"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeskStorage, StorageMode } from "@/lib/storage";
import { CloudError, saveCloud, switchToCloud } from "@/lib/cloud/client";
import Link from "next/link";
export function useCloudStorage(
  storage: DeskStorage,
  userId: string | null,
  reload: () => Promise<void>,
) {
  const [mode, setMode] = useState<StorageMode>("local"),
    [status, setStatus] = useState("Saved in this browser"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false);
  const running = useRef(false),
    switching = useRef(false),
    blocked = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    first = useRef(0),
    failures = useRef(0),
    alive = useRef(true);
  const idleWaiters = useRef<Array<() => void>>([]);
  const sync = useCallback(async () => {
    if (!userId) return;
    if (running.current || switching.current || blocked.current) return;
    running.current = true;
    try {
      const state = await storage.cloudState();
      if (alive.current) setMode(state.mode);
      if (state.mode === "local") {
        if (alive.current) setStatus("Saved in this browser");
        return;
      }
      if (!state.pending) {
        if (alive.current) setStatus("Saved to cloud");
        return;
      }
      if (!navigator.onLine) {
        if (alive.current) setStatus("Offline · saved in this browser");
        return;
      }
      if (alive.current) setStatus("Saving to cloud…");
      await saveCloud(storage, userId);
      failures.current = 0;
      if (alive.current) {
        setError("");
        setStatus(
          (await storage.cloudState()).pending
            ? "Changes waiting to save"
            : "Saved to cloud",
        );
      }
    } catch (error) {
      const problem =
        error instanceof Error
          ? error.message
          : "Cloud storage is unavailable. Your browser copy is safe.";
      if (alive.current) {
        setError(problem);
        setStatus("Saved in this browser · cloud needs attention");
        setConflict(error instanceof CloudError && error.status === 409);
      }
      if (error instanceof CloudError && error.status < 500)
        blocked.current = true;
      else if (alive.current)
        timer.current = setTimeout(
          () => void sync(),
          Math.min(60000, 5000 * 2 ** failures.current++),
        );
    } finally {
      running.current = false;
      idleWaiters.current.splice(0).forEach((resolve) => resolve());
      if (
        alive.current &&
        !switching.current &&
        !blocked.current &&
        !failures.current &&
        navigator.onLine
      ) {
        const next = await storage.cloudState();
        if (next.mode === "cloud" && next.pending)
          timer.current = setTimeout(() => void sync(), 1500);
      }
    }
  }, [storage, userId]);
  useEffect(() => {
    if (!userId) return;
    alive.current = true;
    const schedule = () => {
      if (switching.current || blocked.current) return;
      first.current ||= Date.now();
      clearTimeout(timer.current);
      timer.current = setTimeout(
        () => {
          first.current = 0;
          void sync();
        },
        Math.max(0, Math.min(1500, 10000 - (Date.now() - first.current))),
      );
    };
    const unsubscribe = storage.subscribe(schedule);
    void sync();
    const online = () => {
      blocked.current = false;
      void sync();
    };
    window.addEventListener("online", online);
    return () => {
      alive.current = false;
      unsubscribe();
      clearTimeout(timer.current);
      window.removeEventListener("online", online);
    };
  }, [storage, sync]);
  const change = useCallback(
    async (next: StorageMode) => {
      if (!userId) return;
      if (switching.current) return;
      switching.current = true;
      setBusy(true);
      clearTimeout(timer.current);
      setError("");
      try {
        if (running.current)
          await new Promise<void>((resolve) =>
            idleWaiters.current.push(resolve),
          );
        if (next === "local") {
          await storage.flushStore();
          const state = await storage.cloudState();
          await storage.setCloudState({
            ...state,
            mode: "local",
            pending: false,
          });
        } else {
          await switchToCloud(storage, userId);
          await reload();
        }
        blocked.current = false;
        setConflict(false);
        setMode(next);
        setStatus(
          next === "local" ? "Saved in this browser" : "Saved to cloud",
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "The storage change failed. Your papers are safe.",
        );
        // A failed transfer may still have safely combined papers in the browser.
        await reload();
        setMode((await storage.cloudState()).mode);
      } finally {
        switching.current = false;
        setBusy(false);
      }
    },
    [storage, userId, reload],
  );
  const retry = useCallback(() => {
    blocked.current = false;
    setConflict(false);
    void sync();
  }, [sync]);
  return useMemo(
    () => ({
      mode,
      status,
      error,
      busy,
      conflict,
      change,
      retry,
      signedIn: !!userId,
    }),
    [mode, status, error, busy, conflict, change, retry, userId],
  );
}
export type CloudStorage = ReturnType<typeof useCloudStorage>;
export function StorageSettings({ sync }: { sync: CloudStorage }) {
  if (!sync.signedIn)
    return (
      <section className="storage-settings">
        <h2>Storage</h2>
        <p role="status">Saved in this browser</p>
        <p className="small-print">
          Your papers and desk settings stay on this device. No account needed.
          Export a backup from the archive before clearing your browser data.
        </p>
        <p className="small-print">Want to save your writing across devices?</p>
        <Link className="printed-button storage-sign-in" href="/sign-in">
          Sign in for cloud storage
        </Link>
      </section>
    );
  return (
    <section className="storage-settings" aria-busy={sync.busy}>
      <h2>Storage</h2>
      <div
        className="storage-options"
        role="group"
        aria-label="Where to save your desk"
      >
        <button
          className="printed-button"
          aria-pressed={sync.mode === "local"}
          disabled={sync.busy}
          onClick={() => void sync.change("local")}
        >
          <strong>Local</strong>
          <small>This browser only</small>
        </button>
        <button
          className="printed-button"
          aria-pressed={sync.mode === "cloud"}
          disabled={sync.busy}
          onClick={() => void sync.change("cloud")}
        >
          <strong>Cloud</strong>
          <small>Your Deckle account</small>
        </button>
      </div>
      <p className="small-print">
        {sync.mode === "local"
          ? "Papers stay on this device. Switching to Cloud combines them with your saved cloud papers."
          : "Your full desk saves to your account. An offline copy stays in this browser. Switching to Local stops cloud saves."}
      </p>
      <p role="status">{sync.busy ? "Moving your desk…" : sync.status}</p>
      {sync.error && (
        <div role="alert">
          <p>{sync.error}</p>
          {sync.conflict ? (
            <button
              className="printed-button"
              disabled={sync.busy}
              onClick={() => void sync.change("cloud")}
            >
              Combine both desks
            </button>
          ) : (
            <button
              className="printed-button"
              onClick={() =>
                sync.mode === "local" ? void sync.change("cloud") : sync.retry()
              }
            >
              Retry save
            </button>
          )}
        </div>
      )}
    </section>
  );
}
