import {
  createDeskStorage,
  LOCAL_DESK_ID,
  upgradeDeskDatabase,
  type DeskStorage,
} from "./storage";
const requestResult = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
async function openExistingDesk(accountId?: string) {
  const name = accountId ? `deckle-v1:${accountId}` : "deckle-v1";
  if (!(await indexedDB.databases()).some((db) => db.name === name))
    return null;
  const request = indexedDB.open(name, 4);
  request.onupgradeneeded = () =>
    upgradeDeskDatabase(request.result, request.transaction!);
  return requestResult(request);
}
async function adoptionSource(userId: string) {
  for (const accountId of [LOCAL_DESK_ID, undefined]) {
    const db = await openExistingDesk(accountId);
    if (!db) continue;
    try {
      const tx = db.transaction(["owner", "settings", "desk"]);
      const [claim, state, legacy] = await Promise.all([
        requestResult(tx.objectStore("owner").get("account")),
        requestResult(tx.objectStore("settings").get("state")),
        requestResult(tx.objectStore("desk").get("state")),
      ]);
      if ((!claim || claim.userId === userId) && (state || legacy))
        return { accountId };
    } finally {
      db.close();
    }
  }
  return null;
}
export async function needsDeskAdoption(userId: string, storage: DeskStorage) {
  if (await storage.hasDesk()) return false;
  return !!(await adoptionSource(userId));
}
export async function adoptDesk(userId: string, storage: DeskStorage) {
  const candidate = await adoptionSource(userId);
  if (!candidate) return;
  const { accountId } = candidate;
  const lock = accountId ? `deckle-writer:${accountId}` : "deckle-writer";
  await navigator.locks.request(lock, async () => {
    if (await storage.hasDesk())
      throw new Error(
        "Your account already has a desk. Existing papers have not been replaced.",
      );
    const db = await openExistingDesk(accountId);
    if (!db) return;
    try {
      const tx = db.transaction("owner", "readwrite"),
        store = tx.objectStore("owner");
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      const r = store.get("account");
      let allowed = false;
      r.onsuccess = () => {
        if (!r.result || r.result.userId === userId) {
          allowed = true;
          store.put({ id: "account", userId }, "account");
        }
      };
      await done;
      if (!allowed) throw new Error("This desk belongs to another account.");
    } finally {
      db.close();
    }
    const legacy = createDeskStorage(accountId);
    const source = await legacy.archiveStore(
      await legacy.loadStore({ readOnly: true }),
    );
    if (await storage.hasDesk())
      throw new Error(
        "Your account already has a desk. Existing papers have not been replaced.",
      );
    await storage.resetDeskStorage(source);
  });
}
