"use client";
import { useEffect, useState, type ReactNode } from "react";
import { BROWSER_GENERATION_KEY, ERASURE_CHANNEL } from "@/lib/erase-browser";
import { isErasingBrowser, stopAllDeskStorage } from "@/lib/storage";

export function BrowserErasureGuard({ children }: { children: ReactNode }) {
  const [erased, setErased] = useState(false);
  useEffect(() => {
    let generation: string;
    try {
      generation =
        localStorage.getItem(BROWSER_GENERATION_KEY) ?? crypto.randomUUID();
      localStorage.setItem(BROWSER_GENERATION_KEY, generation);
    } catch {
      return;
    }
    const freeze = () => {
      void stopAllDeskStorage();
      sessionStorage.clear();
      setErased(true);
    };
    const check = () => {
      if (
        !isErasingBrowser() &&
        localStorage.getItem(BROWSER_GENERATION_KEY) !== generation
      )
        freeze();
    };
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(ERASURE_CHANNEL);
    const message = (event: MessageEvent) => {
      if (event.data === "erase" && !isErasingBrowser()) freeze();
    };
    channel?.addEventListener("message", message);
    window.addEventListener("storage", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);
    return () => {
      channel?.close();
      window.removeEventListener("storage", check);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  if (erased)
    return (
      <main className="account-desk-gate">
        <section role="status">
          <h1>This desk has been closed</h1>
          <p>
            Deckle data is being erased in another tab. This tab can no longer
            save.
          </p>
          <a className="printed-button" href="/">
            Open a fresh desk
          </a>
        </section>
      </main>
    );
  return children;
}
