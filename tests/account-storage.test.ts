import "fake-indexeddb/auto";
import { beforeEach, test } from "node:test";
import { IDBFactory } from "fake-indexeddb";
import assert from "node:assert/strict";
import { createDeskStorage, LOCAL_DESK_ID } from "../lib/storage";
import { adoptDesk, needsDeskAdoption } from "../lib/account-storage";
import { appendEvent, makeEvent, newStore } from "../lib/writing";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

test("a browser desk survives account adoption and remains separate from account and cloud changes", async () => {
  const local = createDeskStorage(LOCAL_DESK_ID);
  const original = newStore();
  original.active = appendEvent(
    original.active,
    makeEvent("type", "My local writing", "draft"),
  );
  original.active.notes = "Notes stay with the paper";
  original.settings.volume = 0.23;
  await local.saveStore(original, true);

  const account = createDeskStorage("new-account");
  assert.equal(await needsDeskAdoption("new-account", account), true);
  await adoptDesk("new-account", account);
  const copied = await account.archiveStore(await account.loadStore());
  assert.deepEqual(copied.active.document, original.active.document);
  assert.deepEqual(copied.active.events, original.active.events);
  assert.equal(copied.active.notes, original.active.notes);
  assert.equal(copied.settings.volume, 0.23);
  assert.equal((await account.cloudState()).mode, "local");
  assert.equal(await needsDeskAdoption("new-account", account), false);
  await assert.rejects(adoptDesk("new-account", account), /already has a desk/);

  const state = await account.cloudState();
  await account.setCloudState({ ...state, mode: "cloud", pending: true });
  const changed = {
    ...copied,
    active: appendEvent(
      copied.active,
      makeEvent("type", " in my account", "draft"),
    ),
  };
  await account.saveStore(changed, true);
  const reopened = await createDeskStorage(LOCAL_DESK_ID).loadStore();
  assert.deepEqual(reopened.active.document, original.active.document);
  assert.deepEqual(reopened.active.events, original.active.events);
  assert.equal((await local.cloudState()).mode, "local");
  assert.equal((await local.cloudState()).pending, false);
  assert.equal(
    await needsDeskAdoption(
      "other-account",
      createDeskStorage("other-account"),
    ),
    false,
    "another account cannot claim the same browser papers",
  );
});

test("papers from the original browser database can still be adopted without replacing the source", async () => {
  const legacy = createDeskStorage();
  const original = newStore();
  original.active = appendEvent(
    original.active,
    makeEvent("type", "An older browser paper", "draft"),
  );
  await legacy.saveStore(original, true);
  const account = createDeskStorage("legacy-account");
  assert.equal(await needsDeskAdoption("legacy-account", account), true);
  await adoptDesk("legacy-account", account);
  assert.deepEqual(
    (await account.loadStore()).active.document,
    original.active.document,
  );
  assert.deepEqual(
    (await legacy.loadStore()).active.document,
    original.active.document,
  );
});
