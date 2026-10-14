import { stopAllDeskStorage } from "./storage";

export const ERASURE_CHANNEL = "deckle-browser-erasure";
export const BROWSER_GENERATION_KEY = "deckle:browser-generation";

export async function beginBrowserErasure() {
  const channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(ERASURE_CHANNEL);
  channel?.postMessage("erase");
  channel?.close();
  await stopAllDeskStorage();
}

export async function eraseBrowserData() {
  // Stop all writers before deleting databases. No empty desk is written here.
  await stopAllDeskStorage();
  const databases = await indexedDB.databases();
  for (const { name } of databases) {
    if (!name || (name !== "deckle-v1" && !name.startsWith("deckle-v1:")))
      continue;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      const timeout = setTimeout(
        () =>
          reject(
            new Error(
              "Close the other Deckle tabs, then retry clearing this browser.",
            ),
          ),
        10000,
      );
      request.onsuccess = () => {
        clearTimeout(timeout);
        resolve();
      };
      request.onerror = () => {
        clearTimeout(timeout);
        reject(request.error);
      };
    });
  }
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
  }
  if ("caches" in window)
    await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
  localStorage.clear();
  sessionStorage.clear();
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
}
