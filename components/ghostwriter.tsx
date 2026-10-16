"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { machineAudio } from "@/lib/audio";
import { editingText, editorMarks, markOffsets } from "@/lib/editor-model";
import {
  GHOST_TEXT_LIMIT,
  ghostEdits,
  type GhostEdit,
  type GhostOptions,
  type GhostPlan,
  type GhostRequest,
  type GhostScope,
} from "@/lib/ghostwriter";
import type { Document } from "@/lib/writing";
import type { EditorHandle } from "./paper-editor";
import { GhostReview } from "./ghost-review";
import {
  startGhostReview,
  reconcileGhostReview,
  pendingGhostSuggestions,
  finishGhostReview,
  type GhostReviewState,
} from "@/lib/ghost-review";

type Status = {
  phase: "idle" | "reading" | "review" | "working" | "done" | "error";
  message: string;
  completed: number;
  total: number;
  edit?: GhostEdit;
};
const idle: Status = { phase: "idle", message: "", completed: 0, total: 0 };
type Review = GhostReviewState & {
  passId: number;
  pieceId: string;
  userId: string;
};
const DRAWER_WIDTH = 248;
const MIN_DRAWER_WIDTH = 216;
const PULL_WIDTH = 44;
export const GHOSTWRITER_MIN_REACH = MIN_DRAWER_WIDTH + PULL_WIDTH;
export const GHOSTWRITER_DESKTOP_WIDTH = 1100;
const choices = [
  {
    kind: "grammar",
    label: "Grammar",
    hint: "Spelling, punctuation & small fixes",
  },
  {
    kind: "wording",
    label: "Wording",
    hint: "Clearer phrases, still your voice",
  },
  {
    kind: "structure",
    label: "Structure",
    hint: "Reorder the ideas already here",
  },
] as const;

export function Ghostwriter(props: {
  writer: RefObject<EditorHandle | null>;
  document: Document;
  pieceId: string;
  userId: string | null;
  disabled: boolean;
  reduced: boolean;
  machineView: { scale: number; x: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reviewHidden: boolean;
  onWorking: (working: boolean) => void;
  onReviewLayout: (layout: { visible: boolean; height: number }) => void;
}) {
  const [options, setOptions] = useState<GhostOptions>({
    grammar: true,
    wording: true,
    structure: false,
  });
  const [status, setStatus] = useState<Status>(idle);
  const [review, setReview] = useState<Review | null>(null);
  const reviewSequence = useRef(0);
  const open = props.open;
  const [side, setSide] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(DRAWER_WIDTH);
  const sideRef = useRef(false);
  const [keyboard, setKeyboard] = useState(false);
  const trayId = useId();
  const root = useRef<HTMLElement>(null);
  const tray = useRef<HTMLDivElement>(null);
  const pull = useRef<HTMLButtonElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    side: boolean;
    open: boolean;
    moved: boolean;
    handled: boolean;
  } | null>(null);
  const dragged = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  const request = useRef<AbortController | null>(null);
  const runningScope = useRef("");
  const busy = status.phase === "reading" || status.phase === "working";
  const text = editingText(props.document);
  const selection = props.document.selection;
  const selected = !!selection && selection.anchor !== selection.head;
  const scope = selected
    ? {
        from: Math.min(selection.anchor, selection.head),
        to: Math.max(selection.anchor, selection.head),
      }
    : { from: 0, to: text.length };
  const wordCount = text
    .slice(scope.from, scope.to)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const pending = useMemo(
    () => (review ? pendingGhostSuggestions(review) : []),
    [review],
  );
  // The phone's hardware controls and proofreader share the lower tray.
  // A completed check (or a resize from the side drawer) hands it to review;
  // reopening the hardware later temporarily puts the proofreader away.
  const presentation = useRef({ side: false, busy: false, count: 0 });
  useEffect(() => {
    const previous = presentation.current;
    presentation.current = { side, busy, count: pending.length };
    const node = tray.current;
    if (!node || side) return;
    if (
      pending.length &&
      !busy &&
      (previous.side || previous.busy || !previous.count)
    ) {
      node.hidePopover();
      latest.current.onOpenChange(false);
      return;
    }
    if (!open || props.disabled) node.hidePopover();
    else if (!node.matches(":popover-open")) node.showPopover();
  }, [props.disabled, open, side, pending.length, busy]);
  function positionTray() {
    // Fit the drawer to the resting machine, independently of Notes' camera.
    const next =
      !root.current?.closest("[data-mobile]") &&
      window.innerWidth >= GHOSTWRITER_DESKTOP_WIDTH &&
      window.innerHeight >= 480;
    sideRef.current = next;
    setSide(next);
    const machine = root.current?.closest<HTMLElement>(".machine");
    if (next && machine) {
      const { scale, x } = latest.current.machineView;
      const available =
        (window.innerWidth / 2 - (machine.offsetWidth * scale) / 2 - x - 12) /
          scale -
        PULL_WIDTH;
      const width = Math.max(
        MIN_DRAWER_WIDTH,
        Math.min(DRAWER_WIDTH, available),
      );
      setDrawerWidth(width);
    }
  }
  useLayoutEffect(() => {
    positionTray();
    window.addEventListener("resize", positionTray);
    return () => window.removeEventListener("resize", positionTray);
  }, [props.machineView]);
  function reveal(shown: boolean) {
    positionTray();
    latest.current.onOpenChange(shown);
    void machineAudio.ghostDrawer(shown);
  }
  useEffect(() => {
    if (!open || props.disabled) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") reveal(false);
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
    };
  }, [open, props.disabled]);
  useEffect(() => {
    const stop = () => request.current?.abort();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && busy && !latest.current.disabled) stop();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden" && status.phase === "working")
        stop();
    };
    window.addEventListener("pagehide", stop);
    document.addEventListener("keydown", escape);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", stop);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [status.phase, busy]);
  useEffect(() => {
    request.current?.abort();
    if (tray.current?.matches(":popover-open")) tray.current.hidePopover();
    latest.current.onOpenChange(false);
    setReview(null);
    setStatus(idle);
    return () => {
      request.current?.abort();
    };
  }, [props.pieceId, props.userId]);
  useEffect(() => {
    if (!review || busy) return;
    const next = reconcileGhostReview(review, text);
    if (next === review) return;
    setReview(next ? { ...review, ...next } : null);
    setStatus((previous) => ({
      ...previous,
      phase: next && pendingGhostSuggestions(next).length ? "review" : "done",
      total: next ? pendingGhostSuggestions(next).length : 0,
      message: next
        ? "Suggestions updated for this paper."
        : "The paper changed. Check it again for fresh suggestions.",
    }));
  }, [review, text, busy]);

  async function check() {
    const start = latest.current;
    if (!start.userId || start.disabled || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const checkedText = editingText(start.document);
    const expanded = editorMarks(start.document),
      offsets = markOffsets(expanded);
    const protectedRanges: GhostScope[] = [];
    expanded.forEach((mark, i) => {
      if (!mark.clipId) return;
      const last = protectedRanges.at(-1);
      if (last?.to === offsets[i]) last.to = offsets[i + 1];
      else protectedRanges.push({ from: offsets[i], to: offsets[i + 1] });
    });
    const input: GhostRequest = {
      text: checkedText,
      scope,
      options,
      protected: protectedRanges,
    };
    runningScope.current = selected ? "Selection" : "Paper";
    setStatus({ ...idle, phase: "reading", message: "Reading your words…" });
    try {
      const response = await fetch("/api/ghostwriter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Deckle-Account": start.userId,
        },
        body: JSON.stringify(input),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(290000),
        ]),
      });
      const plan: GhostPlan & { error?: string } = await response.json();
      if (!response.ok)
        throw new Error(
          plan.error ?? "Ghostwriter could not finish. Try again shortly.",
        );
      controller.signal.throwIfAborted();
      if (
        latest.current.pieceId !== start.pieceId ||
        latest.current.userId !== start.userId
      )
        throw new Error(
          "You changed the paper while Ghostwriter was reading. Your writing is safe. Start a fresh pass.",
        );
      // Revalidate the response in the browser before giving it the carriage.
      const edits = ghostEdits(input, plan);
      const checked = reconcileGhostReview(
        startGhostReview(checkedText, edits),
        editingText(latest.current.document),
      );
      if (!checked)
        throw new Error(
          "You changed the paper while Ghostwriter was reading. Check it again for fresh suggestions.",
        );
      const remaining = pendingGhostSuggestions(checked).length;
      if (!remaining) {
        setReview(null);
        setStatus({
          ...idle,
          phase: "done",
          message: "These words can stay as they are.",
        });
        return;
      }
      setReview({
        ...checked,
        passId: ++reviewSequence.current,
        pieceId: start.pieceId,
        userId: start.userId,
      });
      setStatus({
        ...idle,
        phase: "review",
        total: remaining,
        message: `${remaining} ${remaining === 1 ? "suggestion" : "suggestions"}. Fix one or fix all; your paper is unchanged.`,
      });
    } catch (error) {
      if (
        latest.current.pieceId !== start.pieceId ||
        latest.current.userId !== start.userId
      )
        return;
      setStatus({
        ...idle,
        phase: controller.signal.aborted ? "done" : "error",
        message: controller.signal.aborted
          ? "Stopped. Your paper is unchanged."
          : error instanceof Error
            ? error.message
            : "Ghostwriter could not finish. Try again shortly.",
      });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }
  async function apply(chosen: GhostEdit[]) {
    const start = latest.current;
    if (!review || !chosen.length || start.disabled || request.current) return;
    if (
      review.text !== editingText(start.document) ||
      review.pieceId !== start.pieceId ||
      review.userId !== start.userId
    ) {
      setReview(null);
      setStatus({
        ...idle,
        phase: "error",
        message: "The paper changed. Check it again for fresh suggestions.",
      });
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    try {
      const edits = chosen;
      const marks = editorMarks(start.document),
        offsets = markOffsets(marks);
      if (
        edits.some((edit) =>
          marks.some(
            (mark, index) =>
              mark.clipId &&
              edit.from < offsets[index + 1] &&
              edit.to > offsets[index],
          ),
        )
      )
        throw new Error(
          "A suggestion now touches a clipping. Check the paper again.",
        );
      const writer = start.writer.current;
      if (!writer) return;
      writer.reviewGhost(null);
      setStatus({
        ...idle,
        phase: "working",
        total: edits.length,
        message: "Applying your chosen changes.",
      });
      start.onWorking(true);
      const result = await writer.revise(edits, {
        signal: controller.signal,
        reduced: () => latest.current.reduced,
        progress: (edit, completed) =>
          setStatus({
            phase: "working",
            message: edit.reason,
            edit,
            completed,
            total: edits.length,
          }),
      });
      if (
        latest.current.pieceId !== start.pieceId ||
        latest.current.userId !== start.userId
      )
        return;
      const remaining = finishGhostReview(review, edits, result.completed);
      setReview(remaining ? { ...review, ...remaining } : null);
      setStatus({
        phase: result.error
          ? "error"
          : remaining && pendingGhostSuggestions(remaining).length
            ? "review"
            : "done",
        completed: result.completed,
        total: edits.length,
        message:
          result.error ??
          (result.interrupted
            ? result.completed
              ? `Stopped. ${result.completed} ${result.completed === 1 ? "change" : "changes"} kept.`
              : "Stopped. Your words are as they were."
            : `${result.completed} ${result.completed === 1 ? "change" : "changes"} applied.`),
      });
    } catch (error) {
      if (
        latest.current.pieceId !== start.pieceId ||
        latest.current.userId !== start.userId
      )
        return;
      setStatus({
        ...idle,
        phase: controller.signal.aborted ? "done" : "error",
        message: controller.signal.aborted
          ? "Stopped. Your paper is unchanged."
          : error instanceof Error
            ? error.message
            : "Ghostwriter could not finish. Try again shortly.",
      });
    } finally {
      if (request.current === controller) request.current = null;
      latest.current.onWorking(false);
    }
  }
  const readout =
    status.phase === "idle"
      ? selected
        ? "Selection"
        : "Paper"
      : status.phase === "reading"
        ? `Reading ${runningScope.current.toLowerCase()}…`
        : status.phase === "review"
          ? `${pending.length} ${pending.length === 1 ? "suggestion" : "suggestions"}`
          : status.phase === "working"
            ? `Change ${status.completed + 1}/${status.total}`
            : status.phase === "error"
              ? "Could not finish"
              : /restored/i.test(status.message)
                ? "Restored"
                : /stopped/i.test(status.message)
                  ? "Stopped"
                  : /fresh suggestions/i.test(status.message)
                    ? "Check again"
                    : status.completed
                      ? `${status.completed} ${status.completed === 1 ? "change" : "changes"}`
                      : "No changes";
  const blocked =
    text.length > GHOST_TEXT_LIMIT
      ? "Paper too long"
      : !wordCount
        ? "Write first"
        : !Object.values(options).some(Boolean)
          ? "Choose a category"
          : "";
  const target =
    busy || review ? runningScope.current : selected ? "Selection" : "Paper";
  const state =
    blocked && !busy ? blocked : status.phase === "idle" ? "" : readout;
  const voice = () => {
    void machineAudio.unlock();
    machineAudio.keyDown(0.2);
  };
  function startPull(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    setKeyboard(false);
    dragged.current = false;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      side: root.current?.dataset.side === "true",
      open,
      moved: false,
      handled: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    void machineAudio.unlock();
  }
  function movePull(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || start.handled) return;
    const distance = start.side
      ? event.clientX - start.x
      : start.y - event.clientY;
    if (Math.abs(distance) > 6) start.moved = true;
    if ((!start.open && distance > 22) || (start.open && distance < -22)) {
      reveal(!start.open);
      start.handled = true;
    }
  }
  function finishPull() {
    if (drag.current) dragged.current = drag.current.moved;
    drag.current = null;
  }
  function activatePull(
    event: React.MouseEvent<HTMLButtonElement>,
    close = false,
  ) {
    event.preventDefault();
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setKeyboard(event.detail === 0);
    reveal(!close && !open);
  }
  return (
    <section
      ref={root}
      className={`ghostwriter ${open ? "is-open" : ""} ${keyboard ? "is-keyboard" : ""} ${busy ? "ghostwriter-busy" : ""}`}
      aria-label="Ghostwriter"
      data-phase={status.phase}
      data-side={side}
      style={{ "--gw-body": `${drawerWidth}px` } as CSSProperties}
    >
      <button
        ref={pull}
        type="button"
        className="ghostwriter-pull"
        popoverTarget={side ? undefined : trayId}
        aria-expanded={open}
        aria-controls={trayId}
        aria-label={`${open ? "Close" : "Open"} Ghostwriter${busy ? `. ${status.phase === "reading" ? "Reading" : "Editing"} in progress` : ""}`}
        disabled={props.disabled}
        onMouseDown={(event) => event.preventDefault()}
        onPointerDown={startPull}
        onPointerMove={movePull}
        onPointerUp={finishPull}
        onPointerCancel={finishPull}
        onLostPointerCapture={finishPull}
        onClick={activatePull}
      >
        <svg
          className="ghostwriter-emblem"
          viewBox="0 0 20 24"
          aria-hidden="true"
        >
          <path d="M3 21V10a7 7 0 0 1 14 0v11l-3-1-4 2-4-2Z" />
          <ellipse cx="7" cy="10" rx="1.25" ry="1.75" />
          <ellipse cx="13" cy="10" rx="1.25" ry="1.75" />
        </svg>
        <i className="ghostwriter-pull-rule" aria-hidden="true" />
        <span>
          {busy
            ? status.phase === "reading"
              ? "Reading…"
              : "Editing…"
            : "Ghostwriter"}
        </span>
        <b className={busy ? "is-running" : ""} aria-hidden="true" />
      </button>
      <div
        ref={tray}
        id={trayId}
        className="ghostwriter-tray"
        popover={side ? undefined : "manual"}
        data-side={side}
        role="region"
        aria-label="Ghostwriter controls"
        aria-busy={busy}
      >
        <div className="ghostwriter-chassis">
          <div className="ghostwriter-unit">
            <div className="ghostwriter-heading">
              {!busy && !state && (
                <span className="ghostwriter-vents" aria-hidden="true" />
              )}
              <span
                className={`ghostwriter-readout ${busy ? "is-running" : ""} ${status.phase === "error" ? "has-error" : ""}`}
                title={
                  status.message ||
                  (selected
                    ? "Only the selected passage will be edited."
                    : "The current paper will be edited.")
                }
                aria-busy={busy}
                aria-hidden="true"
              >
                {status.phase === "reading" ? (
                  <span className="ghostwriter-waiting">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <i />
                )}
                <span>{busy ? readout : target}</span>
                {!busy && state && (
                  <span className="ghostwriter-state">{state}</span>
                )}
              </span>
              <button
                type="button"
                className="ghostwriter-close"
                popoverTarget={trayId}
                popoverTargetAction="hide"
                aria-label="Close Ghostwriter tray"
                onPointerDown={startPull}
                onPointerMove={movePull}
                onPointerUp={finishPull}
                onPointerCancel={finishPull}
                onLostPointerCapture={finishPull}
                onClick={(event) => activatePull(event, true)}
              >
                Close
              </button>
            </div>
            <div
              className="ghostwriter-switches"
              role="group"
              aria-label="What Ghostwriter may change"
              hidden={status.phase === "error"}
            >
              {choices.map(({ kind, label, hint }) => (
                <button
                  key={kind}
                  type="button"
                  role="switch"
                  className="ghostwriter-choice"
                  aria-checked={options[kind]}
                  aria-label={label}
                  title={hint}
                  disabled={busy || props.disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerDown={() => void machineAudio.unlock()}
                  onClick={() => {
                    setOptions({ ...options, [kind]: !options[kind] });
                    machineAudio.physical("lever");
                  }}
                >
                  <span className="ghostwriter-choice-label">{label}</span>
                  <span className="ghostwriter-toggle" aria-hidden="true">
                    <span className="ghostwriter-socket">
                      <span className="ghostwriter-lever" />
                    </span>
                    <span className="ghostwriter-switch-state">
                      <span data-lit={options[kind]}>
                        <i />
                        On
                      </span>
                      <span data-lit={!options[kind]}>
                        <i />
                        Off
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {status.phase === "error" && (
              <p className="ghostwriter-error">{status.message}</p>
            )}
            <div className="ghostwriter-actions">
              {!props.userId && !props.disabled ? (
                <a
                  className="deck-mech-btn ghostwriter-run ghostwriter-sign-in"
                  href="/sign-in"
                  title="Sign in to use AI editing"
                >
                  Sign in
                </a>
              ) : (
                <button
                  type="button"
                  className={`deck-mech-btn ghostwriter-run ${busy ? "is-latched" : ""}`}
                  aria-label={selected ? "Check passage" : "Check paper"}
                  aria-describedby="ghostwriter-help"
                  aria-pressed={busy}
                  disabled={props.disabled || busy || !!blocked}
                  title={`Check the ${selected ? "selected passage" : "current paper"} for fresh suggestions.`}
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerDown={voice}
                  onClick={() => void check()}
                >
                  <span className="ghostwriter-keylight" aria-hidden="true" />
                  <span className="mech-label">Check</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {review ? (
        <GhostReview
          key={review.passId}
          writer={props.writer}
          text={review.text}
          suggestions={pending}
          busy={busy}
          working={status.phase === "working"}
          onStop={() => request.current?.abort()}
          hidden={props.reviewHidden || props.disabled || (!side && open)}
          onReveal={() => latest.current.onOpenChange(sideRef.current)}
          onLayout={props.onReviewLayout}
          onApply={(edits) => void apply(edits)}
        />
      ) : null}
      <span id="ghostwriter-help" className="sr-only">
        AI editing sends only this paper as context. Only the selected passage
        is reviewed when text is selected. Review suggestions beside the paper.
        Fix one or fix all remaining suggestions. Check always starts a fresh
        pass on the current words. Type or press Escape to stop mechanical
        editing. Undo restores the whole pass.
      </span>
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {status.phase === "working"
          ? `${runningScope.current}. Change ${status.completed + 1} of ${status.total}. ${status.message}`
          : status.message ||
            blocked ||
            (selected ? "Selected passage" : "Current paper")}
      </span>
    </section>
  );
}
