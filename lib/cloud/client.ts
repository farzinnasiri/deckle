import type { DeskStorage, CloudState } from "../storage";
import type { Store } from "../writing";
import { migrateStore } from "../archive";
import { combineDesks } from "./model";
export type CloudDesk = { revision: number; url: string | null };
export class CloudError extends Error {
  constructor(
    message: string,
    readonly status = 503,
  ) {
    super(message);
  }
}
export async function deskRequest<T>(
  userId: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("/api/desk/storage", {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-Deckle-Account": userId },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new CloudError(
      result.error ?? "Cloud storage is unavailable.",
      response.status,
    );
  return result;
}
export async function readCloud(
  userId: string,
): Promise<{ revision: number; store: Store | null }> {
  // A concurrent save may retire the first URL between metadata and download.
  for (let attempt = 0; attempt < 2; attempt++) {
    const cloud = await deskRequest<CloudDesk>(userId);
    if (!cloud.url) return { revision: cloud.revision, store: null };
    const response = await fetch(cloud.url, {
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (response.status === 404 && !attempt) continue;
    if (!response.ok)
      throw new CloudError(
        "The cloud copy could not be downloaded. Your browser copy is safe.",
      );
    return {
      revision: cloud.revision,
      store: migrateStore(await response.json()),
    };
  }
  throw new CloudError("The cloud copy changed while opening. Try again.");
}
export async function initializeCloud(storage: DeskStorage, userId: string) {
  const state = await storage.cloudState();
  if (state.mode !== "cloud" || state.pending) return;
  try {
    const cloud = await readCloud(userId);
    if (cloud.store) await storage.resetDeskStorage(cloud.store);
    const next = await storage.cloudState();
    await storage.setCloudState({
      ...next,
      revision: cloud.revision,
      pending: !cloud.store,
    });
  } catch {
    /* Opening the browser copy remains possible offline. */
  }
}
export async function cloudSnapshot(
  storage: DeskStorage,
): Promise<{ state: CloudState; store: Store } | null> {
  await storage.flushStore();
  const state = await storage.cloudState();
  if (state.mode !== "cloud" || !state.pending) return null;
  const store = await storage.archiveStore(
    await storage.loadStore({ readOnly: true }),
  );
  if ((await storage.cloudState()).mutationId !== state.mutationId) return null;
  return { state, store };
}
export async function saveCloud(storage: DeskStorage, userId: string) {
  const snapshot = await cloudSnapshot(storage);
  if (!snapshot) return;
  const blob = new Blob([JSON.stringify(snapshot.store)], {
    type: "application/json",
  });
  if (blob.size > 20_000_000)
    throw new CloudError(
      "This desk exceeds the 20 MB cloud limit. Export a backup; local storage still works.",
      413,
    );
  const upload = await deskRequest<{ ticket: string; url: string }>(userId, {
    action: "upload",
  });
  const response = await fetch(upload.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Deckle-Upload": upload.ticket,
    },
    body: blob,
    signal: AbortSignal.timeout(60000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new CloudError(
      result.error ?? "The cloud upload failed.",
      response.status,
    );
  if ((await storage.cloudState()).mode !== "cloud") return;
  const saved = await deskRequest<{ revision: number }>(userId, {
    action: "save",
    storageId: result.storageId,
    baseRevision: snapshot.state.revision,
    mutationId: snapshot.state.mutationId,
  });
  await storage.acknowledgeCloud(snapshot.state.mutationId, saved.revision);
}
export async function switchToCloud(
  storage: DeskStorage,
  userId: string,
): Promise<Store> {
  await storage.flushStore();
  const local = await storage.archiveStore(
    await storage.loadStore({ readOnly: true }),
  );
  const cloud = await readCloud(userId);
  const hasWriting = [local.active, ...local.pieces].some(
    (p) => p.document.title || p.document.marks.length,
  );
  const merged = cloud.store
    ? hasWriting
      ? combineDesks(local, cloud.store)
      : cloud.store
    : local;
  await storage.resetDeskStorage(merged);
  await storage.setCloudState({
    mode: "cloud",
    revision: cloud.revision,
    mutationId: crypto.randomUUID(),
    pending: true,
  });
  // Keep Local selected if the first transfer fails. The combined browser desk
  // remains intact and the previous cloud snapshot has not been overwritten.
  try {
    await saveCloud(storage, userId);
  } catch (error) {
    const state = await storage.cloudState();
    await storage.setCloudState({ ...state, mode: "local", pending: false });
    throw error;
  }
  return merged;
}
