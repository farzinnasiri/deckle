import type { Store } from "./writing";

type DeskCallbacks = {
  load: (readOnly: boolean) => Promise<Store>;
  flush: () => Promise<void>;
  beforeYield?: () => Promise<void>;
  onStore: (store: Store) => void;
  onWritable: (writable: boolean) => void;
  onWaitingKey?: (event: KeyboardEvent) => void;
  onWaitingClick?: (event: MouseEvent) => void;
  onError: (error: unknown) => void;
};

/** Browser dependencies are injectable so handoffs can be tested with delayed saves. */
export type DeskEnvironment = {
  requestLock: (signal: AbortSignal, run: () => Promise<void>) => Promise<void>;
  channel: Pick<
    BroadcastChannel,
    "postMessage" | "addEventListener" | "removeEventListener" | "close"
  > | null;
  window: EventTarget;
  document: EventTarget;
  isFocused: () => boolean;
  isVisible: () => boolean;
};

/** One shared desk. The tab being used saves first, then hands the writer to the next tab. */
export function connectDesk(
  callbacks: DeskCallbacks,
  environment?: DeskEnvironment,
  accountId?: string,
) {
  const env = environment ?? {
    requestLock: (signal: AbortSignal, run: () => Promise<void>) => {
      if (!navigator.locks)
        return Promise.reject(
          new Error(
            "This browser cannot coordinate local saves. Use a browser with Web Locks support.",
          ),
        );
      return navigator.locks.request(
        accountId ? `deckle-writer:${accountId}` : "deckle-writer",
        { signal },
        run,
      );
    },
    channel:
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(
            accountId ? `deckle-desk:${accountId}` : "deckle-desk",
          )
        : null,
    window,
    document,
    isFocused: () => document.hasFocus(),
    isVisible: () => document.visibilityState === "visible",
  };
  let closed = false;
  let owned = false;
  let ready = false;
  let wanted = false;
  let requesting = false;
  let epoch = 0;
  let request: AbortController | undefined;
  let release: (() => void) | undefined;
  let yielding: Promise<void> | undefined;
  let retry: ReturnType<typeof setInterval> | undefined;

  const changed = () => {
    if (!closed) env.channel?.postMessage("saved");
  };
  const refresh = async () => {
    if (closed || owned || requesting) return;
    const version = ++epoch;
    try {
      const store = await callbacks.load(true);
      if (!closed && !owned && !requesting && version === epoch)
        callbacks.onStore(store);
    } catch (error) {
      if (!closed && version === epoch) callbacks.onError(error);
    }
  };
  const yieldDesk = () => {
    if (yielding) return yielding;
    wanted = false;
    request?.abort();
    if (!owned) return Promise.resolve();
    yielding = (async () => {
      await callbacks.beforeYield?.();
      ready = false;
      if (!closed) callbacks.onWritable(false);
      try {
        await callbacks.flush();
        changed();
        release?.();
      } catch (error) {
        // Keep the writer and its unsaved paper if storage failed.
        if (!closed) {
          ready = true;
          callbacks.onWritable(true);
          callbacks.onError(error);
        } else release?.();
      }
    })().finally(() => {
      yielding = undefined;
    });
    return yielding;
  };
  const activate = () => {
    if (closed || !env.isVisible()) return;
    clearTimeout(start);
    wanted = true;
    if (yielding) {
      void yielding.then(() => {
        if (wanted && !closed) activate();
      });
      return;
    }
    if (owned) return;
    if (requesting) {
      env.channel?.postMessage("claim");
      return;
    }
    requesting = true;
    ++epoch; // An older background read must not replace the acquired snapshot.
    const controller = new AbortController();
    request = controller;
    const signal = controller.signal;
    const ask = () => env.channel?.postMessage("claim");
    ask();
    // A claim can arrive while another tab is still acquiring its writer.
    const claimRetry = setInterval(ask, 250);
    retry = claimRetry;
    void env
      .requestLock(signal, async () => {
        clearInterval(claimRetry);
        if (retry === claimRetry) retry = undefined;
        if (closed || !wanted) return;
        owned = true;
        requesting = false;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        try {
          const store = await callbacks.load(false);
          if (closed || !wanted) release?.();
          else {
            callbacks.onStore(store);
            ready = true;
            callbacks.onWritable(true);
          }
          await held;
        } finally {
          ready = false;
          owned = false;
          release = undefined;
        }
      })
      .catch((error: unknown) => {
        if (
          !closed &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          if (request === controller) wanted = false;
          callbacks.onError(error);
        }
      })
      .finally(() => {
        clearInterval(claimRetry);
        if (retry === claimRetry) retry = undefined;
        if (request === controller) {
          requesting = false;
          if (!closed && wanted && !owned) activate();
        }
      });
  };
  const onFocus = () => activate();
  const onBlur = () => {
    void yieldDesk();
  };
  const onVisibility = () => {
    if (!env.isVisible()) void yieldDesk();
    else if (env.isFocused()) activate();
  };
  const onPointer = () => activate();
  const onKey = (event: Event) => {
    activate();
    if (!ready || yielding) callbacks.onWaitingKey?.(event as KeyboardEvent);
  };
  const onClick = (event: Event) => {
    if (ready && !yielding) return;
    activate();
    callbacks.onWaitingClick?.(event as MouseEvent);
  };
  const onMessage = (event: Event) => {
    const message = (event as MessageEvent).data;
    if (message === "claim" && owned) void yieldDesk();
    else if (message === "saved") void refresh();
  };
  env.window.addEventListener("focus", onFocus);
  env.window.addEventListener("blur", onBlur);
  env.window.addEventListener("pagehide", onBlur);
  env.window.addEventListener("pointerdown", onPointer, true);
  env.window.addEventListener("keydown", onKey, true);
  env.window.addEventListener("click", onClick, true);
  env.document.addEventListener("visibilitychange", onVisibility);
  env.channel?.addEventListener("message", onMessage);
  const start = setTimeout(() => {
    if (env.isFocused() && env.isVisible()) activate();
    else void refresh();
  }, 0);

  return {
    activate,
    changed,
    close: () => {
      closed = true;
      wanted = false;
      ++epoch;
      clearTimeout(start);
      clearInterval(retry);
      request?.abort();
      env.window.removeEventListener("focus", onFocus);
      env.window.removeEventListener("blur", onBlur);
      env.window.removeEventListener("pagehide", onBlur);
      env.window.removeEventListener("pointerdown", onPointer, true);
      env.window.removeEventListener("keydown", onKey, true);
      env.window.removeEventListener("click", onClick, true);
      env.document.removeEventListener("visibilitychange", onVisibility);
      env.channel?.removeEventListener("message", onMessage);
      env.channel?.close();
      void yieldDesk();
    },
  };
}
