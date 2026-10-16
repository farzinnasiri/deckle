"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { machineAudio } from "@/lib/audio";
import type { GhostEdit } from "@/lib/ghostwriter";
import type { GhostSuggestion } from "@/lib/ghost-review";
import type { EditorHandle } from "./paper-editor";

/** A fixed desk panel. Navigation feeds the paper without moving the panel. */
export function GhostReview(props: {
  writer: RefObject<EditorHandle | null>;
  text: string;
  suggestions: GhostSuggestion[];
  hidden: boolean;
  busy: boolean;
  working: boolean;
  onReveal: () => void;
  onApply: (edits: GhostEdit[]) => void;
  onStop: () => void;
  onLayout: (layout: { visible: boolean; height: number }) => void;
}) {
  const [activeId, setActiveId] = useState(props.suggestions[0]?.id ?? 0);
  const [dismissed, setDismissed] = useState(false);
  const slip = useRef<HTMLDivElement>(null);
  const shown = useRef<number | null>(null);
  const latest = useRef(props);
  latest.current = props;
  let active = props.suggestions.findIndex(
    (suggestion) => suggestion.id >= activeId,
  );
  if (active < 0) active = Math.max(0, props.suggestions.length - 1);
  const suggestion = props.suggestions[active];
  const edit = suggestion?.edit;
  const visible = !!edit && !props.hidden && !dismissed;
  const select = useCallback((index: number) => {
    const selected = latest.current.suggestions[index];
    if (!selected) return;
    if (latest.current.hidden) latest.current.onReveal();
    setActiveId(selected.id);
    setDismissed(false);
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
            edits: props.suggestions.map((item) => item.edit),
            active,
            onSelect: select,
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
      const bottom = Math.min(viewBottom - 12, box.bottom - 24);
      const height = docked
        ? Math.max(140, Math.min(320, viewHeight * 0.48))
        : Math.max(
            140,
            Math.min(
              420,
              bottom - Math.max(viewTop + 12, box.top + 12, controlsBottom),
            ),
          );
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
      if (event.key === "Escape" && visible && !props.busy) setDismissed(true);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [visible, props.busy]);
  const voice = () => {
    void machineAudio.unlock();
    machineAudio.physical("lever");
  };
  return (
    <div
      ref={slip}
      className="ghostwriter-proof"
      popover="manual"
      tabIndex={-1}
      role="region"
      aria-label="Suggestion review"
    >
      <div className="ghostwriter-proof-heading">
        <span
          aria-label={`Suggestion ${edit ? active + 1 : 0} of ${props.suggestions.length}`}
        >
          {edit ? active + 1 : 0} / {props.suggestions.length}
        </span>
        <button
          type="button"
          aria-label="Previous suggestion"
          disabled={props.busy || active === 0}
          onClick={() => select(active - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          aria-label="Next suggestion"
          disabled={props.busy || active >= props.suggestions.length - 1}
          onClick={() => select(active + 1)}
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          className="ghostwriter-proof-close"
          aria-label="Close suggestion review"
          onClick={() => setDismissed(true)}
        >
          <X size={15} />
        </button>
      </div>
      <div className="ghostwriter-proof-copy">
        <div className="ghostwriter-proof-words">
          <del aria-label="Original">{edit?.before}</del>
          <ins aria-label="Suggested replacement">
            {edit?.after || "Remove this passage"}
          </ins>
        </div>
        <p className="ghostwriter-proof-reason">{edit?.reason}</p>
      </div>
      <div className="ghostwriter-proof-apply">
        <button
          type="button"
          className="deck-mech-btn"
          aria-label={props.working ? "Stop fixing" : "Fix this suggestion"}
          disabled={props.busy && !props.working}
          onPointerDown={voice}
          onClick={() =>
            props.working
              ? props.onStop()
              : suggestion && props.onApply([suggestion.change])
          }
        >
          {props.working ? "Stop" : "Fix one"}
        </button>
        <button
          type="button"
          className="deck-mech-btn"
          aria-label="Fix all remaining suggestions"
          disabled={props.busy || !edit}
          onPointerDown={voice}
          onClick={() =>
            props.onApply(props.suggestions.map((item) => item.change))
          }
        >
          Fix all
        </button>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {props.working
          ? "Fixing the paper. Type or press Escape to stop."
          : `${props.suggestions.length} suggestions remaining.`}
      </span>
    </div>
  );
}
