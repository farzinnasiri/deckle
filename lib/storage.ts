import {
  cleanStore,
  newStore,
  indexPiece,
  type Store,
  type Piece,
  type KeyEvent,
} from "./writing";
import { migrateStore } from "./archive";
export type StorageMode = "local" | "cloud";
// Separate from every signed-in account, including its offline cloud copy.
export const LOCAL_DESK_ID = "local";
let erasingBrowser = false;
const storageClosers = new Set<() => Promise<void>>();
export const isErasingBrowser = () => erasingBrowser;
export function stopAllDeskStorage() {
  erasingBrowser = true;
  return Promise.all([...storageClosers].map((close) => close()));
}
export type CloudState = {
  mode: StorageMode;
  revision: number;
  mutationId: string;
  pending: boolean;
};
export function upgradeDeskDatabase(db: IDBDatabase, tx?: IDBTransaction) {
  if (!db.objectStoreNames.contains("desk")) db.createObjectStore("desk");
  if (!db.objectStoreNames.contains("papers")) {
    const papers = db.createObjectStore("papers", { keyPath: "id" });
    papers.createIndex("torn", "torn");
    papers.createIndex("discardedAt", "discardedAt");
    papers.createIndex("words", "words", { multiEntry: true });
    db.createObjectStore("events");
    db.createObjectStore("settings");
    db.createObjectStore("owner");
  }
  tx?.objectStore("settings").delete("cloud-settings");
  // Keep the legacy account ownership claim while retiring the old sync queue.
  if (db.objectStoreNames.contains("notion")) {
    const claim = tx?.objectStore("notion").get("account");
    if (claim)
      claim.onsuccess = () => {
        if (claim.result) tx!.objectStore("owner").put(claim.result, "account");
        db.deleteObjectStore("notion");
      };
  }
}
export function createDeskStorage(accountId?: string) {
  const DB = accountId ? `deckle-v1:${accountId}` : "deckle-v1";
  let connection: Promise<IDBDatabase> | undefined;
  const written = new Map<string, Piece>();
  const listeners = new Set<() => void>();
  function open() {
    if (erasingBrowser)
      return Promise.reject(new Error("Desk data is being erased."));
    const opened = (connection ??= new Promise<IDBDatabase>(
      (resolve, reject) => {
        const request = indexedDB.open(DB, 4);
        request.onupgradeneeded = () => {
          upgradeDeskDatabase(request.result, request.transaction!);
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => {
            request.result.close();
            connection = undefined;
          };
          resolve(request.result);
        };
        request.onerror = () => {
          connection = undefined;
          reject(request.error);
        };
        request.onblocked = () => {
          /* The existing tab must finish its transaction first. */
        };
      },
    ));
    return opened.then((db) => {
      if (erasingBrowser) throw new Error("Desk data is being erased.");
      return db;
    });
  }
  const result = <T>(request: IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const completed = (tx: IDBTransaction) =>
    new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || new Error("Storage transaction aborted"));
    });
  async function write(store: Store, replace = false) {
    const db = await open();
    const tx = db.transaction(
      ["papers", "events", "settings", "owner"],
      "readwrite",
    );
    const done = completed(tx);
    const papers = tx.objectStore("papers"),
      events = tx.objectStore("events");
    const cloudRequest = tx.objectStore("settings").get("storage");
    cloudRequest.onsuccess = () => {
      const cloud = cloudRequest.result as CloudState | undefined;
      if (cloud)
        tx.objectStore("settings").put(
          {
            ...cloud,
            mutationId: crypto.randomUUID(),
            pending: cloud.mode === "cloud",
          },
          "storage",
        );
    };
    if (replace) {
      papers.clear();
      events.clear();
      tx.objectStore("settings").clear();
      tx.objectStore("owner").clear();
    }
    const all = [store.active, ...store.pieces],
      ids = new Set(all.map((p) => p.id));
    const changed: Piece[] = [];
    for (const piece of all) {
      if (!replace && written.get(piece.id) === piece) continue;
      const {
        events: log,
        eventsLoaded,
        ...record
      } = piece.torn ? indexPiece(piece) : piece;
      papers.put(record);
      if (eventsLoaded !== false) events.put(log, piece.id);
      changed.push(piece);
    }
    // Retention only removes records that were part of this loaded desk.
    for (const id of written.keys())
      if (!ids.has(id)) {
        papers.delete(id);
        events.delete(id);
      }
    const { active, pieces: _pieces, owner, ...metadata } = store;
    tx.objectStore("settings").put(
      { ...metadata, activeId: active.id },
      "state",
    );
    tx.objectStore("owner").put(
      owner || { name: "", seed: 1971, enrolled: true },
      "owner",
    );
    await done;
    for (const id of written.keys()) if (!ids.has(id)) written.delete(id);
    for (const piece of changed) written.set(piece.id, piece);
    listeners.forEach((notify) => notify());
  }
  async function loadStore({ readOnly = false } = {}): Promise<Store> {
    const db = await open();
    const tx = db.transaction([
      "settings",
      "owner",
      "papers",
      "events",
      "desk",
    ]);
    const [metadata, owner, papers, legacy] = await Promise.all([
      result(tx.objectStore("settings").get("state")),
      result(tx.objectStore("owner").get("owner")),
      result(tx.objectStore("papers").getAll()) as Promise<Piece[]>,
      result(tx.objectStore("desk").get("state")),
    ]);
    if (!metadata) {
      const migrated = legacy ? migrateStore(legacy) : newStore();
      if (readOnly) return cleanStore(migrated);
      await write(migrated);
      if (legacy) {
        // Verify every new record and log before marking the old snapshot migrated.
        // The original v1 record remains untouched, including its expired wastebasket.
        const verify = db.transaction(["papers", "events"]);
        const [records, logs] = await Promise.all([
          result(verify.objectStore("papers").getAll()),
          result(verify.objectStore("events").getAll()),
        ]);
        const expected = [migrated.active, ...migrated.pieces];
        if (
          records.length !== expected.length ||
          logs.length !== expected.length
        )
          throw new Error(
            "Migration verification failed; original desk retained.",
          );
        for (const piece of expected) {
          const saved = records.find((p: Piece) => p.id === piece.id);
          const log = await loadEvents(piece.id);
          if (
            !saved ||
            JSON.stringify(saved.document) !== JSON.stringify(piece.document) ||
            JSON.stringify(log) !== JSON.stringify(piece.events)
          )
            throw new Error(
              "Migration verification failed; original desk retained.",
            );
        }
        const mark = db.transaction("desk", "readwrite"),
          done = completed(mark);
        mark
          .objectStore("desk")
          .put({ at: Date.now(), version: 2 }, "migrated");
        await done;
      }
      return cleanStore(migrated);
    }
    const active = papers.find((p) => p.id === metadata.activeId);
    if (!active)
      throw new Error(
        "The active paper is missing. Existing data has not been replaced.",
      );
    active.events = await loadEvents(active.id);
    const pieces = papers
      .filter((p) => p.id !== active.id)
      .map((p) => ({ ...p, events: [], eventsLoaded: false }))
      .sort((a, b) => (b.torn || b.created) - (a.torn || a.created));
    const store = migrateStore({ ...metadata, owner, active, pieces });
    if (!readOnly) {
      written.clear();
      [store.active, ...store.pieces].forEach((p) => written.set(p.id, p));
    }
    return cleanStore(store);
  }
  async function loadEvents(id: string): Promise<KeyEvent[]> {
    const db = await open();
    const log = await result(
      db.transaction("events").objectStore("events").get(id),
    );
    if (!Array.isArray(log))
      throw new Error("This paper's replay log could not be loaded.");
    return log;
  }
  async function hydratePiece(piece: Piece): Promise<Piece> {
    return piece.eventsLoaded === false
      ? { ...piece, events: await loadEvents(piece.id), eventsLoaded: true }
      : piece;
  }
  async function archiveStore(store: Store): Promise<Store> {
    await flushStore();
    return {
      ...store,
      active: await hydratePiece(store.active),
      pieces: await Promise.all(store.pieces.map(hydratePiece)),
    };
  }
  // One write window every 250 ms, not a trailing debounce that waits for typing to stop.
  let pending: Store | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  let waiters: { resolve: () => void; reject: (reason: unknown) => void }[] =
    [];
  let queue: Promise<void> = Promise.resolve();
  function saveStore(store: Store, immediate = false): Promise<void> {
    if (erasingBrowser)
      return Promise.reject(new Error("Desk data is being erased."));
    pending = store;
    const promise = new Promise<void>((resolve, reject) =>
      waiters.push({ resolve, reject }),
    );
    if (immediate) void flushStore().catch(() => {});
    else
      timer ??= setTimeout(() => {
        void flushStore().catch(() => {});
      }, 250);
    return promise;
  }
  function flushStore(): Promise<void> {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!pending) return queue;
    const store = pending,
      listeners = waiters;
    pending = undefined;
    waiters = [];
    const task = queue.catch(() => {}).then(() => write(store));
    queue = task;
    void task.then(
      () => listeners.forEach((w) => w.resolve()),
      (error) => listeners.forEach((w) => w.reject(error)),
    );
    return task;
  }
  async function searchPapers(phrase: string): Promise<Set<string>> {
    const db = await open(),
      tx = db.transaction("papers"),
      papers = tx.objectStore("papers");
    // The word index narrows complete-word searches. Phrase and substring matching
    // uses cached text in records, never Markdown reconstruction or replay logs.
    const query = phrase.trim().toLocaleLowerCase(),
      words = query.match(/[\p{L}\p{N}]+/gu) || [];
    const candidates: Piece[] =
      words.length > 1
        ? await result(papers.index("words").getAll(words[0]))
        : await result(papers.getAll());
    return new Set(
      candidates
        .filter((p) => !query || p.searchText?.includes(query))
        .map((p) => p.id),
    );
  }

  function resetDeskStorage(freshStore: Store): Promise<void> {
    // Resets share the save queue, so a tab handoff waits for the complete reset.
    // Clearing and writing happen in one transaction; readers never see half a desk.
    const previous = flushStore();
    const task = previous.catch(() => {}).then(() => write(freshStore, true));
    queue = task;
    return task;
  }

  async function hasDesk() {
    const db = await open();
    return !!(await result(
      db.transaction("settings").objectStore("settings").get("state"),
    ));
  }
  async function cloudState(): Promise<CloudState> {
    const db = await open();
    return (
      (await result(
        db.transaction("settings").objectStore("settings").get("storage"),
      )) ?? {
        mode: "local",
        revision: 0,
        mutationId: crypto.randomUUID(),
        pending: false,
      }
    );
  }
  async function setCloudState(state: CloudState) {
    await flushStore();
    const db = await open(),
      tx = db.transaction("settings", "readwrite"),
      done = completed(tx);
    tx.objectStore("settings").put(state, "storage");
    await done;
    listeners.forEach((notify) => notify());
  }
  async function acknowledgeCloud(mutationId: string, revision: number) {
    const db = await open(),
      tx = db.transaction("settings", "readwrite"),
      done = completed(tx);
    const settings = tx.objectStore("settings"),
      r = settings.get("storage");
    r.onsuccess = () => {
      if (r.result)
        settings.put(
          {
            ...r.result,
            revision,
            pending:
              r.result.mutationId !== mutationId && r.result.mode === "cloud",
          },
          "storage",
        );
    };
    await done;
  }
  const subscribe = (notify: () => void) => {
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  };
  storageClosers.add(async () => {
    clearTimeout(timer);
    timer = undefined;
    pending = undefined;
    waiters
      .splice(0)
      .forEach((waiter) =>
        waiter.reject(new Error("Desk data is being erased.")),
      );
    await queue.catch(() => {});
    await connection?.then((db) => db.close()).catch(() => {});
    connection = undefined;
    written.clear();
    listeners.clear();
  });
  return {
    hasDesk,
    cloudState,
    setCloudState,
    acknowledgeCloud,
    subscribe,
    loadStore,
    saveStore,
    flushStore,
    hydratePiece,
    archiveStore,
    searchPapers,
    resetDeskStorage,
  };
}
const defaultStorage = createDeskStorage();
export const {
  loadStore,
  saveStore,
  flushStore,
  hydratePiece,
  archiveStore,
  searchPapers,
  resetDeskStorage,
} = defaultStorage;
export type DeskStorage = ReturnType<typeof createDeskStorage>;
export function download(
  name: string,
  text: string,
  type = "text/markdown;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
