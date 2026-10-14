"use client";
import { useEffect, useMemo, useState } from "react";
import Deckle from "./deckle";
import { createDeskStorage, LOCAL_DESK_ID } from "@/lib/storage";
import { needsDeskAdoption, adoptDesk } from "@/lib/account-storage";
import { initializeCloud } from "@/lib/cloud/client";
import { DeskStorageProvider } from "./desk-storage-provider";
export function AccountDesk({ userId }: { userId: string | null }) {
  const storage = useMemo(
    () => createDeskStorage(userId ?? LOCAL_DESK_ID),
    [userId],
  );
  const [state, setState] = useState<"loading" | "adopt" | "ready">(
      userId ? "loading" : "ready",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const ready = async () => {
    if (!userId) return;
    await navigator.locks.request(
      `deckle-writer:${userId}`,
      { ifAvailable: true },
      async (lock) => {
        if (lock) await initializeCloud(storage, userId);
      },
    );
    setState("ready");
  };
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void needsDeskAdoption(userId, storage)
      .then(async (needed) => {
        if (!alive) return;
        if (needed) setState("adopt");
        else await ready();
      })
      .catch(() =>
        setError(
          "The saved desk could not be opened. Your papers have not been replaced.",
        ),
      );
    return () => {
      alive = false;
    };
  }, [storage, userId]);
  if (state === "ready")
    return (
      <DeskStorageProvider storage={storage}>
        <Deckle userId={userId} />
      </DeskStorageProvider>
    );
  return (
    <main className="account-desk-gate">
      <section aria-busy={busy}>
        <h1>{state === "adopt" ? "Keep this desk?" : "Opening your desk"}</h1>
        {state === "adopt" && (
          <>
            <p>
              This browser has a local desk. Copy its papers and settings to
              this account, or begin with a fresh desk.
            </p>
            <div className="storage-actions">
              <button
                className="printed-button"
                disabled={busy}
                onClick={() => {
                  if (!userId) return;
                  setBusy(true);
                  void adoptDesk(userId, storage)
                    .then(ready)
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Keep this desk
              </button>
              <button
                className="printed-button"
                disabled={busy}
                onClick={() => void ready()}
              >
                Start fresh
              </button>
            </div>
            <p className="small-print">
              The original browser copy is preserved.
            </p>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}
