import { test } from "node:test";
import assert from "node:assert/strict";
import { connectDesk, type DeskEnvironment } from "../lib/desk-lock";
import { newStore, type Store } from "../lib/writing";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function until(condition: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) assert.fail("Desk handoff did not complete");
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

/** Web Locks queues writers; aborting a queued request does not steal an existing lock. */
class Locks {
  active = false;
  requests = 0;
  queue: (() => void)[] = [];
  request(signal: AbortSignal, run: () => Promise<void>) {
    this.requests++;
    return new Promise<void>((resolve, reject) => {
      const abort = () => {
        this.queue = this.queue.filter((item) => item !== start);
        reject(new DOMException("Canceled", "AbortError"));
      };
      const start = () => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) {
          abort();
          return;
        }
        this.active = true;
        void run()
          .then(resolve, reject)
          .finally(() => {
            this.active = false;
            this.next();
          });
      };
      signal.addEventListener("abort", abort, { once: true });
      this.queue.push(start);
      this.next();
    });
  }
  next() {
    if (!this.active) this.queue.shift()?.();
  }
}
class Channel extends EventTarget {
  constructor(private hub: Set<Channel>) {
    super();
    hub.add(this);
  }
  postMessage(data: unknown) {
    for (const other of this.hub)
      if (other !== this)
        queueMicrotask(() => {
          if (this.hub.has(other))
            other.dispatchEvent(new MessageEvent("message", { data }));
        });
  }
  close() {
    this.hub.delete(this);
  }
}
function setup() {
  const locks = new Locks();
  const hub = new Set<Channel>();
  let saved = newStore();
  const connections: ReturnType<typeof connectDesk>[] = [];
  function tab(
    options: {
      flush?: () => Promise<void>;
      load?: (readOnly: boolean) => Promise<Store>;
    } = {},
  ) {
    const lifecycle = new EventTarget();
    let focused = false;
    let writable = false;
    let store = structuredClone(saved);
    let dirty = false;
    const errors: unknown[] = [];
    let waitingKeys = 0;
    let waitingClicks = 0;
    const connection = connectDesk(
      {
        load: options.load ?? (async () => structuredClone(saved)),
        flush: async () => {
          await options.flush?.();
          if (dirty) {
            saved = structuredClone(store);
            dirty = false;
          }
        },
        onStore: (snapshot) => {
          store = snapshot;
        },
        onWritable: (ready) => {
          writable = ready;
        },
        onWaitingKey: () => {
          waitingKeys++;
        },
        onWaitingClick: () => {
          waitingClicks++;
        },
        onError: (error) => {
          errors.push(error);
        },
      },
      {
        requestLock: (signal, run) => locks.request(signal, run),
        channel: new Channel(hub) as DeskEnvironment["channel"],
        window: lifecycle,
        document: new EventTarget(),
        isFocused: () => focused,
        isVisible: () => true,
      },
    );
    const client = {
      connection,
      get writable() {
        return writable;
      },
      get store() {
        return store;
      },
      get waitingKeys() {
        return waitingKeys;
      },
      get waitingClicks() {
        return waitingClicks;
      },
      errors,
      focus: () => {
        focused = true;
        lifecycle.dispatchEvent(new Event("focus"));
      },
      blur: () => {
        focused = false;
        lifecycle.dispatchEvent(new Event("blur"));
      },
      key: () => lifecycle.dispatchEvent(new Event("keydown")),
      click: () => lifecycle.dispatchEvent(new Event("click")),
      edit: (title: string) => {
        assert.ok(writable);
        store = {
          ...store,
          active: {
            ...store.active,
            document: { ...store.active.document, title },
          },
        };
        dirty = true;
      },
      save: async () => {
        saved = structuredClone(store);
        dirty = false;
        connection.changed();
      },
    };
    connections.push(connection);
    return client;
  }
  return {
    tab,
    locks,
    get saved() {
      return saved;
    },
    close: () => connections.forEach((connection) => connection.close()),
  };
}

test("switching tabs flushes pending writing before the new tab can edit, then hands it back without reloading", async () => {
  const desk = setup();
  const gate = deferred();
  const first = desk.tab({ flush: () => gate.promise });
  const second = desk.tab();
  try {
    first.focus();
    await until(() => first.writable);
    first.edit("First tab's latest writing");
    first.blur();
    second.focus();
    second.key();
    await until(() => !first.writable);
    assert.equal(second.writable, false);
    assert.ok(second.waitingKeys > 0, "Input during the handoff can be queued");
    gate.resolve();
    await until(() => second.writable);
    assert.equal(
      second.store.active.document.title,
      "First tab's latest writing",
    );
    assert.equal(first.writable, false);
    second.edit("Second tab's continuation");
    second.blur();
    first.focus();
    await until(() => first.writable);
    assert.equal(
      first.store.active.document.title,
      "Second tab's continuation",
    );
    assert.equal(second.writable, false);
  } finally {
    gate.resolve();
    desk.close();
  }
});

test("saved changes update passive tabs, and closing the writer allows another tab to resume", async () => {
  const desk = setup();
  const first = desk.tab();
  const second = desk.tab();
  try {
    first.focus();
    await until(() => first.writable);
    first.edit("Shared paper");
    await first.save();
    await until(() => second.store.active.document.title === "Shared paper");
    first.connection.close();
    second.focus();
    await until(() => second.writable);
    assert.equal(second.store.active.document.title, "Shared paper");
  } finally {
    desk.close();
  }
});

test("closing a tab while it waits for a writer cancels its request without blocking the next tab", async () => {
  const desk = setup();
  const gate = deferred();
  const first = desk.tab({ flush: () => gate.promise });
  const canceled = desk.tab();
  const next = desk.tab();
  try {
    first.focus();
    await until(() => first.writable);
    first.edit("Not lost on close");
    first.blur();
    canceled.focus();
    canceled.connection.close();
    next.focus();
    gate.resolve();
    await until(() => next.writable);
    assert.equal(canceled.writable, false);
    assert.equal(next.store.active.document.title, "Not lost on close");
  } finally {
    gate.resolve();
    desk.close();
  }
});

test("a failed save keeps the unsaved writer until saving succeeds", async () => {
  const desk = setup();
  let fail = true;
  const first = desk.tab({
    flush: async () => {
      if (fail) throw new Error("Storage full");
    },
  });
  const second = desk.tab();
  try {
    first.focus();
    await until(() => first.writable);
    first.edit("Recoverable writing");
    second.focus();
    await until(() => first.errors.length > 0);
    assert.equal(first.writable, true);
    assert.equal(second.writable, false);
    assert.equal(first.store.active.document.title, "Recoverable writing");
    fail = false;
    second.connection.activate();
    await until(() => second.writable);
    assert.equal(second.store.active.document.title, "Recoverable writing");
  } finally {
    fail = false;
    desk.close();
  }
});

test("loading failures report once instead of repeatedly requesting the writer", async () => {
  const desk = setup();
  const first = desk.tab({
    load: async () => {
      throw new Error("Cannot read saved desk");
    },
  });
  try {
    first.focus();
    await until(() => first.errors.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(desk.locks.requests, 1);
    assert.equal(first.writable, false);
  } finally {
    desk.close();
  }
});

test("keys and clicks wait for the latest snapshot even after the lock has been acquired", async () => {
  const desk = setup();
  const gate = deferred();
  let loading = false;
  const first = desk.tab({
    load: async () => {
      loading = true;
      await gate.promise;
      return newStore();
    },
  });
  try {
    first.focus();
    await until(() => loading);
    first.key();
    first.click();
    assert.equal(first.writable, false);
    assert.equal(first.waitingKeys, 1);
    assert.equal(first.waitingClicks, 1);
    gate.resolve();
    await until(() => first.writable);
    first.key();
    first.click();
    assert.equal(first.waitingKeys, 1);
    assert.equal(first.waitingClicks, 1);
  } finally {
    gate.resolve();
    desk.close();
  }
});
