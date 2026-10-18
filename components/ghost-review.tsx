"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { machineAudio } from "@/lib/audio";
import { minimalGhostEdit, type GhostEdit } from "@/lib/ghostwriter";
import {
  chosenGhostEdits,
  reviewGhostEdits,
  type GhostSuggestion,
} from "@/lib/ghost-review";
import type { EditorHandle } from "./paper-editor";

/** A fixed desk panel: a proof tape issuing from a small dark head. The head
 * and the tape's last line stay put; only the torn top end varies in length.
 * Navigation feeds the paper without moving the panel. */
export function GhostReview(props: {
  writer: RefObject<EditorHandle | null>;
  text: string;
  suggestions: GhostSuggestion[];
  hidden: boolean;
  busy: boolean;
  working: boolean;
  onReveal: () => void;
  onApply: (edits: GhostEdit[]) => void;
  onChoose: (id: number, choice: number) => void;
  onDismiss: (id: number) => void;
  onStop: () => void;
  onLayout: (layout: { visible: boolean; height: number }) => void;
}) {
  const [activeId, setActiveId] = useState(props.suggestions[0]?.id ?? 0);
  const [closed, setClosed] = useState(false);
  const slip = useRef<HTMLDivElement>(null);
  const shown = useRef<number | null>(null);
  const latest = useRef(props);
  latest.current = props;
  let active = props.suggestions.findIndex(
    (suggestion) => suggestion.id >= activeId,
  );
  if (active < 0) active = Math.max(0, props.suggestions.length - 1);
  const suggestion = props.suggestions[active];
  const highlights = useMemo(
    () => reviewGhostEdits(props.suggestions),
    [props.suggestions],
  );
  const highlightIndex = highlights.findingIds.indexOf(suggestion?.id ?? -1);
  const edit = highlights.edits[highlightIndex];
  const edits = suggestion ? chosenGhostEdits(suggestion) : [];
  const allEdits = props.suggestions
    .filter((item) => !item.dismissed && !item.resolved)
    .flatMap(chosenGhostEdits);
  const visible = !!suggestion && !props.hidden && !closed;
  const select = useCallback((index: number) => {
    const selected = latest.current.suggestions[index];
    if (!selected) return;
    if (latest.current.hidden) latest.current.onReveal();
    setActiveId(selected.id);
    setClosed(false);
  }, []);

  useLayoutEffect(() => {
    const writer = props.writer.current,
      node = slip.current;
    if (!writer || !node) return;
    writer.reviewGhost(
      props.busy || !edit
        ? null
        : {
            text: props.text,
            edits: highlights.edits,
            active: highlightIndex,
            onSelect: (index) => {
              const id = highlights.findingIds[index];
              select(props.suggestions.findIndex((item) => item.id === id));
            },
          },
    );
    if (!visible || !edit) return;
    if (shown.current !== suggestion.id && !props.busy) {
      writer.revealGhost(edit);
      shown.current = suggestion.id;
    }
  }, [
    props.writer,
    props.text,
    props.suggestions,
    props.busy,
    active,
    highlights.edits,
    highlights.findingIds,
    highlightIndex,
    suggestion,
    edit,
    visible,
    select,
  ]);

  useLayoutEffect(() => {
    const writer = props.writer.current,
      node = slip.current;
    if (!writer || !node) return;
    if (!visible) {
      node.hidePopover();
      props.onLayout({ visible: false, height: 0 });
      return;
    }
    if (!node.matches(":popover-open")) node.showPopover();
    let frame = 0,
      until = performance.now() + 650;
    const position = () => {
      // Measure the stationary paper window, never the selected words or the
      // feeding paper strip. Content and navigation cannot change this slot.
      const box = writer.ghostPaperBounds();
      if (!box) return;
      const viewTop = visualViewport?.offsetTop ?? 0;
      const viewHeight = visualViewport?.height ?? innerHeight;
      const viewBottom = viewTop + viewHeight;
      const docked = innerWidth <= 700;
      node.dataset.docked = String(docked);
      const desk = node.closest("main");
      const cord = desk?.querySelector(".pull-cord")?.getBoundingClientRect();
      const controls = desk
        ?.querySelector(".desk-control-stack")
        ?.getBoundingClientRect();
      const sideLeft = Math.max(box.right + 12, (cord?.right ?? 0) + 12);
      const width = docked
        ? Math.min(360, innerWidth - 24)
        : Math.min(248, Math.max(168, innerWidth - sideLeft - 12));
      const left = docked
        ? (innerWidth - width) / 2
        : Math.min(innerWidth - width - 12, sideLeft);
      node.dataset.compact = String(width < 210);
      const controlsBottom =
        controls && left < controls.right && left + width > controls.left
          ? controls.bottom + 12
          : 0;
      const top = Math.max(viewTop + 12, box.top + 12, controlsBottom);
      let bottom = Math.min(viewBottom - 12, box.bottom - 24);
      // A short slot beside the paper may continue down the desk until the
      // machine, its drawer or the archive front. Those bounds are fixed.
      if (!docked && bottom - top < 300)
        bottom = [".machine", ".ghostwriter-tray", ".desk-front"]
          .map((part) => desk?.querySelector(part)?.getBoundingClientRect())
          .reduce(
            (limit, part) =>
              part?.width &&
              part.top >= bottom &&
              left < part.right &&
              left + width > part.left
                ? Math.min(limit, part.top - 12)
                : limit,
            viewBottom - 12,
          );
      const height = docked
        ? Math.max(140, Math.min(360, viewHeight * 0.5))
        : Math.max(140, Math.min(440, bottom - top));
      node.style.width = `${width}px`;
      node.style.height = `${height}px`;
      node.style.left = `${left}px`;
      node.style.top = `${docked ? viewBottom - height - 12 : bottom - height}px`;
      props.onLayout({
        visible: true,
        height: docked ? Math.ceil(height + 24) : 0,
      });
    };
    const follow = () => {
      position();
      if (performance.now() < until) frame = requestAnimationFrame(follow);
    };
    const track = () => {
      until = performance.now() + 650;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(follow);
    };
    // Settle the initial placement and any viewport resize. Text changes and
    // wheel events do not reposition the panel.
    position();
    track();
    window.addEventListener("resize", track);
    visualViewport?.addEventListener("resize", track);
    visualViewport?.addEventListener("scroll", track);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", track);
      visualViewport?.removeEventListener("resize", track);
      visualViewport?.removeEventListener("scroll", track);
    };
  }, [props.writer, props.onLayout, visible]);

  useEffect(
    () => () => {
      props.writer.current?.reviewGhost(null);
      props.onLayout({ visible: false, height: 0 });
    },
    [props.writer, props.onLayout],
  );
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && visible && !props.busy) setClosed(true);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [visible, props.busy]);
  const voice = () => {
    void machineAudio.unlock();
    machineAudio.physical("lever");
  };
  const kind =
    suggestion?.kind === "fix"
      ? "Fix"
      : suggestion?.kind === "style"
        ? "Style"
        : "Review";
  const options = suggestion?.kind === "style" ? suggestion.alternatives : [];
  const changes = suggestion?.alternatives[suggestion.selected]?.edits ?? [];
  const position = edit ? active + 1 : 0;
  return (
    <div
      ref={slip}
      className="ghostwriter-proof"
      popover="manual"
      tabIndex={-1}
      role="region"
      aria-label="Suggestion review"
    >
      {/* Adding-machine tape: the latest finding feeds up out of the head. */}
      <div
        className="ghostwriter-proof-tape"
        key={suggestion?.id}
        data-kind={suggestion?.kind}
      >
        <button
          type="button"
          className="ghostwriter-proof-close"
          aria-label="Close suggestion review"
          title="Close. Highlights stay on the paper."
          onClick={() => setClosed(true)}
        >
          <X size={15} />
        </button>
        <div className="ghostwriter-proof-copy">
          <span className="ghostwriter-proof-kind">
            {kind}
            <span aria-hidden="true">
              {position} of {props.suggestions.length}
            </span>
          </span>
          <h3 className="ghostwriter-proof-title">{suggestion?.title}</h3>
          <p className="ghostwriter-proof-reason">{suggestion?.reason}</p>
          {suggestion?.kind === "review" ? (
            <div className="ghostwriter-proof-evidence">
              {suggestion.anchors.map((anchor) => (
                <blockquote key={`${anchor.from}-${anchor.to}`}>
                  {props.text.slice(anchor.from, anchor.to)}
                </blockquote>
              ))}
            </div>
          ) : options.length > 1 ? (
            <div
              className="ghostwriter-proof-options"
              role="radiogroup"
              aria-label="Choose a phrasing"
            >
              {options.map((option, index) => (
                <label
                  key={index}
                  className="ghostwriter-proof-option"
                  data-chosen={suggestion?.selected === index}
                >
                  <input
                    type="radio"
                    name={`ghost-choice-${suggestion?.id}`}
                    value={index}
                    checked={suggestion?.selected === index}
                    disabled={props.busy}
                    onChange={() =>
                      suggestion && props.onChoose(suggestion.id, index)
                    }
                  />
                  <span className="ghostwriter-proof-mark" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="ghostwriter-proof-wording">
                    {option.edits.map((change) => (
                      <Wording
                        key={`${change.from}-${change.to}`}
                        {...change}
                      />
                    ))}
                    <small>
                      {option.label}
                      {index === 0 && <b>Recommended</b>}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="ghostwriter-proof-words">
              {changes.map((change) => (
                <div key={`${change.from}-${change.to}`}>
                  <del aria-label="Original">{change.before}</del>
                  <ins aria-label="Suggested replacement">
                    {change.after || "Remove this passage"}
                  </ins>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="ghostwriter-proof-links">
          <button
            type="button"
            disabled={props.busy || !suggestion}
            onClick={() => suggestion && props.onDismiss(suggestion.id)}
          >
            Dismiss
          </button>
          {allEdits.length > 0 && (
            <button
              type="button"
              className="ghostwriter-proof-all"
              disabled={props.busy}
              onPointerDown={voice}
              onClick={() => props.onApply(allEdits)}
            >
              Apply all
            </button>
          )}
        </div>
      </div>
      <div className="ghostwriter-proof-head">
        <div className="ghostwriter-proof-counter">
          <button
            type="button"
            aria-label="Previous suggestion"
            disabled={props.busy || active === 0}
            onClick={() => select(active - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span
            role="img"
            aria-label={`Suggestion ${position} of ${props.suggestions.length}`}
          >
            <b>{position}</b>
            <i>/</i>
            {props.suggestions.length}
          </span>
          <button
            type="button"
            aria-label="Next suggestion"
            disabled={props.busy || active >= props.suggestions.length - 1}
            onClick={() => select(active + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {suggestion?.kind === "review" && !props.working ? (
          <span className="ghostwriter-proof-well is-note">Feedback only</span>
        ) : (
          (props.working || edits.length > 0) && (
            <span className="ghostwriter-proof-well">
              <button
                type="button"
                className={`ghostwriter-proof-key ${props.working ? "is-latched" : ""}`}
                disabled={props.busy && !props.working}
                onPointerDown={voice}
                onClick={() =>
                  props.working ? props.onStop() : props.onApply(edits)
                }
              >
                {props.working ? "Stop" : "Apply"}
              </button>
            </span>
          )
        )}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {props.working
          ? "Fixing the paper. Type or press Escape to stop."
          : `${props.suggestions.length} suggestions remaining.`}
      </span>
    </div>
  );
}

/** Typed alternative. A pure cut shows the struck words in their sentence;
 * anything else shows the replacement as it would read. */
function Wording(change: GhostEdit) {
  const cut = minimalGhostEdit(change);
  if (cut.after || !cut.before) return <span>{change.after}</span>;
  const at = cut.from - change.from;
  return (
    <span>
      {change.before.slice(0, at)}
      <del>{cut.before}</del>
      {change.before.slice(at + cut.before.length)}
    </span>
  );
}
