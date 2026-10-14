import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import fixture from "./fixtures/v1-desk.json";
import {
  archiveStore,
  flushStore,
  loadStore,
  saveStore,
  searchPapers,
  hydratePiece,
  resetDeskStorage,
  createDeskStorage,
} from "../lib/storage";
import { appendEvent, makeEvent, newStore } from "../lib/writing";

test("new desks retain their setup invitation until handled, while existing desks stay unchanged", async () => {
  const storage = createDeskStorage("setup-first-visit");
  const fresh = await storage.loadStore();
  assert.equal(fresh.setupPending, true);
  assert.equal(
    (await createDeskStorage("setup-first-visit").loadStore()).setupPending,
    true,
  );

  await storage.saveStore({ ...fresh, setupPending: false }, true);
  const returning = await createDeskStorage("setup-first-visit").loadStore();
  assert.equal(returning.setupPending, false);
  assert.equal(
    returning.active.document.marks.length,
    0,
    "skipping is remembered even without any writing",
  );

  const existing = createDeskStorage("setup-existing-desk");
  const older = newStore();
  delete older.setupPending;
  await existing.saveStore(older, true);
  assert.equal((await existing.loadStore()).setupPending, undefined);
});

test("v1 database upgrades, retains its snapshot, separates logs, coalesces writes and reloads", async () => {
  const original = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("deckle-v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("desk");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = original.transaction("desk", "readwrite");
    tx.objectStore("desk").put(fixture, "state");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  original.close();
  const loaded = await loadStore();
  assert.deepEqual(loaded.active.events, fixture.active.events);
  const again = await loadStore();
  assert.equal(
    again.pieces.find((p) => p.id === fixture.pieces[0].id)?.eventsLoaded,
    false,
  );
  assert.deepEqual(
    (
      await hydratePiece(
        again.pieces.find((p) => p.id === fixture.pieces[0].id)!,
      )
    ).events,
    fixture.pieces[0].events,
  );
  const first = appendEvent(again.active, makeEvent("type", "one", "draft"));
  const second = appendEvent(first, makeEvent("type", " two", "draft"));
  const writes = [
    saveStore({ ...again, active: first }),
    saveStore({ ...again, active: second }),
  ];
  await flushStore();
  await Promise.all(writes);
  const reloaded = await loadStore();
  assert.deepEqual(reloaded.active.document, second.document);
  assert.deepEqual(reloaded.active.events, second.events);
  assert.ok((await searchPapers("clipping")).has(fixture.pieces[0].id));
  const archive = await archiveStore(reloaded);
  assert.deepEqual(
    archive.pieces.find((p) => p.id === fixture.pieces[0].id)?.events,
    fixture.pieces[0].events,
  );
  const db = await new Promise<IDBDatabase>((resolve) => {
    const r = indexedDB.open("deckle-v1", 4);
    r.onsuccess = () => resolve(r.result);
  });
  const tx = db.transaction(["desk", "papers"]);
  const state = await new Promise((resolve) => {
    const r = tx.objectStore("desk").get("state");
    r.onsuccess = () => resolve(r.result);
  });
  assert.deepEqual(state, fixture);
  assert.deepEqual(Array.from(db.objectStoreNames), [
    "desk",
    "events",
    "owner",
    "papers",
    "settings",
  ]);
  db.close();
});

test("resetDeskStorage wipes all papers and events and writes fresh store", async () => {
  const fresh = newStore();
  fresh.owner = { name: "NEW AUTHOR", seed: 1971, enrolled: true };
  fresh.uncovered = true;
  await resetDeskStorage(fresh);

  const reloaded = await loadStore();
  assert.equal(reloaded.owner?.name, "NEW AUTHOR");
  assert.equal(reloaded.pieces.length, 0);
  assert.equal(reloaded.uncovered, true);
});

test("a tab handoff's flush waits for a reset and pending saves cannot overwrite the fresh desk", async () => {
  const previous = await loadStore();
  const stale = appendEvent(
    previous.active,
    makeEvent("type", "Old pending writing", "draft"),
  );
  const pending = saveStore({ ...previous, active: stale });
  const fresh = newStore();
  const reset = resetDeskStorage(fresh);
  await flushStore();
  const openedInNextTab = await loadStore({ readOnly: true });
  assert.equal(openedInNextTab.active.id, fresh.active.id);
  assert.equal(openedInNextTab.active.document.marks.length, 0);
  await Promise.all([pending, reset]);
});
