"use client";
import { useEffect, useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { beginBrowserErasure, eraseBrowserData } from "@/lib/erase-browser";

export function StartOver({
  userId,
  pending = false,
}: {
  userId: string | null;
  pending?: boolean;
}) {
  const { signOut } = useClerk();
  const [confirmation, setConfirmation] = useState("");
  const [started, setStarted] = useState(pending);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const remoteDeleted = useRef(false);
  const running = useRef(false);
  useEffect(() => {
    if (pending) void beginBrowserErasure();
  }, [pending]);
  async function erase() {
    if (running.current || (!started && confirmation !== "DELETE")) return;
    running.current = true;
    setStarted(true);
    setBusy(true);
    setError("");
    try {
      setStatus("Closing the desk in this browser…");
      await beginBrowserErasure();
      if (!remoteDeleted.current) {
        setStatus(
          userId
            ? "Permanently deleting your account and cloud data…"
            : "Clearing this browser…",
        );
        const response = await fetch("/api/account", {
          method: "DELETE",
          cache: "no-store",
          headers: {
            "X-Deckle-Account": userId ?? "local",
            "X-Deckle-Confirm": "DELETE",
          },
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(
            result.error ??
              "Deletion did not finish. Retry to finish deleting your data.",
          );
        }
        remoteDeleted.current = true;
      }
      setStatus("Removing local papers, settings and caches…");
      await eraseBrowserData();
      // Account deletion revokes the identity. Also clear Clerk's browser client
      // without redirecting until the explicit browser cleanup has completed.
      if (userId) {
        try {
          await signOut({ redirectUrl: "/" });
        } catch {
          /* Already deleted. */
        }
      }
      window.location.replace("/");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Deletion did not finish. Retry to remove the remaining data.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="account-desk-gate start-over-page">
      <section aria-labelledby="start-over-title" aria-busy={busy}>
        <h1 id="start-over-title">
          {started ? "Deleting your Deckle data" : "Start from scratch"}
        </h1>
        {!started ? (
          <>
            <p>
              {userId
                ? "Permanently delete your Deckle account and all its cloud data, then sign out."
                : "Permanently erase your local Deckle data."}
            </p>
            <p>
              All papers, archived sheets, notes, replay history and settings
              will be erased. All Deckle data stored in this browser, including
              other local desks, cookies and caches, will be cleared.
            </p>
            <p>
              <strong>
                This cannot be undone. Deckle keeps no recovery copy.
              </strong>
            </p>
            <p className="small-print">
              Downloaded exports and copies on other devices are outside this
              browser. Provider backup retention is managed separately.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void erase();
              }}
            >
              <label htmlFor="erase-confirmation">Type DELETE to confirm</label>
              <input
                id="erase-confirmation"
                autoComplete="off"
                spellCheck={false}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
              <div className="storage-actions">
                <a className="printed-button" href="/">
                  Keep my desk
                </a>
                <button
                  type="submit"
                  className="printed-button danger-confirm-btn"
                  disabled={confirmation !== "DELETE"}
                >
                  Delete permanently
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <p role="status">
              {busy ? status : "Keep this page open until deletion finishes."}
            </p>
            {error && <p role="alert">{error}</p>}
            {!busy && (
              <button
                className="printed-button danger-confirm-btn"
                onClick={() => void erase()}
              >
                Retry permanent deletion
              </button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
