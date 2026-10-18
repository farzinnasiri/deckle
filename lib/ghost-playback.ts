import { fitsPaper } from "./paper-capacity";
import { minimalGhostEdit, type GhostEdit } from "./ghostwriter";

export type GhostPlayback = {
  text: () => string;
  available: () => boolean;
  move: (at: number) => void;
  write: (from: number, to: number, text: string) => void;
  checkpoint: (edit: GhostEdit) => () => void;
  voice: (text: string) => void;
};
function pause(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Play changes through real editor operations. Each passage is a transaction:
 * interruption restores its checkpoint synchronously, before human input runs. */
export async function playGhostEdits(
  edits: GhostEdit[],
  paper: GhostPlayback,
  options: {
    signal: AbortSignal;
    reduced: () => boolean;
    instant?: boolean;
    progress: (edit: GhostEdit, completed: number) => void;
  },
) {
  const { signal } = options;
  let completed = 0;
  let rollback: (() => void) | null = null;
  const cancel = () => {
    const restore = rollback;
    rollback = null;
    restore?.();
  };
  const check = () => {
    signal.throwIfAborted();
    if (!paper.available())
      throw new Error(
        "The paper changed. Start another pass when you are ready.",
      );
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (edits.some((edit) => edit.kind === "review"))
      throw new Error("Reader feedback cannot change the paper.");
    if (options.instant) {
      // Validate every instant replacement before changing any ink.
      let text = paper.text();
      for (const planned of [...edits].sort((a, b) => b.from - a.from)) {
        if (text.slice(planned.from, planned.to) !== planned.before)
          throw new Error(
            "The paper changed. Start another pass when you are ready.",
          );
        const after =
          text.slice(0, planned.from) + planned.after + text.slice(planned.to);
        if (!fitsPaper(text, after))
          throw new Error(
            "This change would fill the paper. File it or shorten it before another pass.",
          );
        text = after;
      }
    }
    // Work from the end so every earlier anchor stays valid.
    for (const planned of [...edits].sort((a, b) => b.from - a.from)) {
      check();
      const text = paper.text();
      if (text.slice(planned.from, planned.to) !== planned.before)
        throw new Error(
          "The paper changed. Start another pass when you are ready.",
        );
      const edit = minimalGhostEdit(planned);
      const after = text.slice(0, edit.from) + edit.after + text.slice(edit.to);
      if (!fitsPaper(text, after))
        throw new Error(
          "This change would fill the paper. File it or shorten it before another pass.",
        );
      options.progress(planned, completed);
      rollback = paper.checkpoint(edit);
      if (!options.instant) paper.move(edit.to);
      // The existing long platen roll tops out at 534 ms. Let it settle
      // before striking at the new position, including the next layout frame.
      if (!options.instant && !options.reduced()) await pause(560, signal);
      check();
      if (options.instant || options.reduced())
        paper.write(edit.from, edit.to, edit.after);
      else {
        let end = edit.to;
        for (const char of Array.from(edit.before).reverse()) {
          check();
          paper.write(end - char.length, end, "");
          end -= char.length;
          paper.voice("");
          await pause(14, signal);
        }
        let at = edit.from;
        for (const char of Array.from(edit.after)) {
          check();
          paper.write(at, at, char);
          at += char.length;
          paper.voice(char);
          await pause(
            char === "\n" ? 120 : /[.!?]/.test(char) ? 65 : 24,
            signal,
          );
        }
      }
      // Verify that the editor accepted the operations, including capacity checks.
      if (paper.text() !== after)
        throw new Error("This change could not fit on the paper.");
      rollback = null;
      completed++;
      // Fast passes still yield between editor transactions. This lets React
      // settle its synchronous snapshots and human input interrupt a long batch.
      await pause(!options.instant && !options.reduced() ? 200 : 0, signal);
    }
    return { completed, interrupted: false };
  } catch (error) {
    cancel();
    if (signal.aborted) return { completed, interrupted: true };
    return {
      completed,
      interrupted: false,
      error:
        error instanceof Error ? error.message : "This pass could not finish.",
    };
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
