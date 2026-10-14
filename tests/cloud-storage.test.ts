import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDeskStorage } from "../lib/storage";
import { newStore, appendEvent, makeEvent } from "../lib/writing";
import { combineDesks } from "../lib/cloud/model";
import { initializeCloud, saveCloud, switchToCloud } from "../lib/cloud/client";
const writing = (text: string) => {
  const store = newStore();
  store.active = appendEvent(store.active, makeEvent("type", text, "draft"));
  return store;
};
test("Local saves never upload; switching Cloud and back retains full papers, replay and settings", async () => {
  const storage = createDeskStorage("round-trip"),
    original = writing("A complete paper");
  original.settings.volume = 0.22;
  await storage.saveStore(original, true);
  let remote: typeof original | null = null,
    revision = 0,
    calls = 0,
    candidate: typeof original | null = null;
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls++;
    if (String(input) === "https://cloud.test/snapshot")
      return Response.json(remote);
    if (String(input) === "https://cloud.test/upload") {
      candidate = JSON.parse(await (init!.body as Blob).text());
      return Response.json({ storageId: "stored" });
    }
    if (!init?.body)
      return Response.json({
        revision,
        url: remote ? "https://cloud.test/snapshot" : null,
      });
    const body = JSON.parse(String(init.body));
    if (body.action === "upload")
      return Response.json({
        ticket: "ticket",
        url: "https://cloud.test/upload",
      });
    assert.equal(body.baseRevision, revision);
    remote = candidate;
    return Response.json({ revision: ++revision });
  };
  try {
    await initializeCloud(storage, "account");
    await saveCloud(storage, "account");
    assert.equal(calls, 0);
    await switchToCloud(storage, "account");
    assert.equal((await storage.cloudState()).mode, "cloud");
    assert.deepEqual(remote!.active.events, original.active.events);
    assert.equal(
      JSON.stringify(remote!.active.document),
      JSON.stringify(original.active.document),
    );
    assert.equal(remote!.settings.volume, 0.22);
    const fresh = createDeskStorage("fresh-device");
    await fresh.saveStore(newStore(), true);
    await switchToCloud(fresh, "account");
    assert.equal(
      (await fresh.loadStore()).active.id,
      original.active.id,
      "a fresh browser opens the cloud active paper",
    );
    const state = await storage.cloudState();
    await storage.setCloudState({ ...state, mode: "local", pending: false });
    const modified = {
      ...original,
      active: appendEvent(
        original.active,
        makeEvent("type", " locally", "draft"),
      ),
    };
    await storage.saveStore(modified, true);
    const before = calls;
    await saveCloud(storage, "account");
    assert.equal(calls, before);
    const merged = await switchToCloud(storage, "account");
    assert.deepEqual(merged.active.document, modified.active.document);
    assert.equal(
      merged.pieces.length,
      1,
      "the older conflicting cloud paper remains as a separate copy",
    );
  } finally {
    globalThis.fetch = fetchBefore;
  }
});
test("a receipt for an older cloud save cannot mark newer writing saved", async () => {
  const storage = createDeskStorage("receipt");
  await storage.saveStore(writing("first"), true);
  await storage.setCloudState({
    mode: "cloud",
    revision: 0,
    mutationId: "old",
    pending: true,
  });
  await storage.saveStore(writing("newer"), true);
  await storage.acknowledgeCloud("old", 1);
  const state = await storage.cloudState();
  assert.equal(state.revision, 1);
  assert.equal(state.pending, true);
});
test("combining identical papers is idempotent and preserves differing versions", () => {
  const local = writing("Local"),
    remote = structuredClone(local);
  assert.equal(combineDesks(local, remote).pieces.length, 0);
  remote.active.document.cursor = 0;
  remote.active.document.selection = { anchor: 0, head: 0 };
  assert.equal(
    combineDesks(local, remote).pieces.length,
    0,
    "navigation alone is not a conflicting version",
  );
  remote.active = appendEvent(
    remote.active,
    makeEvent("type", " changed remotely", "draft"),
  );
  const merged = combineDesks(local, remote);
  assert.equal(merged.pieces.length, 1);
  assert.notEqual(merged.pieces[0].id, local.active.id);
  assert.deepEqual(merged.active.document, local.active.document);
  assert.deepEqual(merged.pieces[0].document, remote.active.document);
  assert.equal(
    combineDesks(merged, remote).pieces.length,
    1,
    "retrying a transfer does not import the same conflicting version twice",
  );
});
test("a v3 desk upgrade retires the old queue without losing papers or account ownership", async () => {
  const name = "upgrade-user",
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(`deckle-v1:${name}`, 3);
      r.onupgradeneeded = () => {
        for (const store of [
          "desk",
          "papers",
          "events",
          "settings",
          "owner",
          "notion",
        ])
          r.result.createObjectStore(
            store,
            store === "papers" || store === "notion"
              ? { keyPath: "id" }
              : undefined,
          );
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  const original = writing("Keep this writing");
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(
      ["settings", "papers", "events", "notion"],
      "readwrite",
    );
    const { active, pieces, owner, ...metadata } = original;
    tx.objectStore("settings").put(
      { ...metadata, activeId: active.id },
      "state",
    );
    tx.objectStore("papers").put(active);
    tx.objectStore("events").put(active.events, active.id);
    tx.objectStore("notion").put({ id: "account", userId: "owner" });
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  db.close();
  const storage = createDeskStorage(name);
  assert.deepEqual(
    (await storage.loadStore()).active.document,
    original.active.document,
  );
  const upgraded = await new Promise<IDBDatabase>((resolve) => {
    const r = indexedDB.open(`deckle-v1:${name}`, 4);
    r.onsuccess = () => resolve(r.result);
  });
  assert.equal(upgraded.objectStoreNames.contains("notion"), false);
  const claim = await new Promise((resolve) => {
    const r = upgraded.transaction("owner").objectStore("owner").get("account");
    r.onsuccess = () => resolve(r.result);
  });
  assert.deepEqual(claim, { id: "account", userId: "owner" });
  upgraded.close();
});
