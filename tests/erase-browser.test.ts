import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDeskStorage } from "../lib/storage";
import { eraseBrowserData } from "../lib/erase-browser";
import { appendEvent, makeEvent, newStore } from "../lib/writing";

test("erasure removes every local desk, cancels queued writes and clears browser preferences, sessions and caches", async () => {
  let cacheCleared = false,
    preferencesCleared = false,
    sessionCleared = false,
    unregistered = false;
  const cache = {
    keys: async () => ["deckle-assets"],
    delete: async () => {
      cacheCleared = true;
      return true;
    },
  };
  Object.assign(globalThis, {
    window: { caches: cache },
    caches: cache,
    localStorage: {
      clear: () => {
        preferencesCleared = true;
      },
    },
    sessionStorage: {
      clear: () => {
        sessionCleared = true;
      },
    },
    document: { cookie: "" },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      serviceWorker: {
        getRegistrations: async () => [
          {
            unregister: async () => {
              unregistered = true;
              return true;
            },
          },
        ],
      },
    },
  });
  const first = createDeskStorage("user_a"),
    second = createDeskStorage("local"),
    legacy = createDeskStorage();
  const desk = newStore();
  desk.active = appendEvent(
    desk.active,
    makeEvent("type", "private writing", "draft"),
  );
  for (const storage of [first, second, legacy])
    await storage.saveStore(desk, true);
  const queued = first.saveStore({
    ...desk,
    owner: { name: "private name", seed: 1, enrolled: true },
  });
  const rejected = assert.rejects(queued, /erased/);
  await eraseBrowserData();
  await rejected;
  assert.deepEqual(
    (await indexedDB.databases()).filter((d) =>
      d.name?.startsWith("deckle-v1"),
    ),
    [],
  );
  assert.equal(
    cacheCleared && preferencesCleared && sessionCleared && unregistered,
    true,
  );
  await assert.rejects(first.saveStore(desk, true), /erased/);
  await assert.rejects(createDeskStorage("user_a").loadStore(), /erased/);
  assert.deepEqual(await indexedDB.databases(), []);
});
