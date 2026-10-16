"use client";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { machineAudio } from "@/lib/audio";
import { X } from "lucide-react";
import { stocks } from "@/lib/materials";
import type { PaperOptions } from "@/lib/writing";
import {
  DECKLE_CLIPBOARD,
  rememberCopy,
  type ClipboardPayload,
} from "@/lib/clipboard";

// The copy holder: one sheet of notes for this paper, held by a clip in a
// drawer at the desk's left edge. Pull its tab (or click it) and the sheet
// slides out and latches; push it back and it slides away. Write or paste
// anything on it. Copied onto the paper, its words arrive as clippings.

type Props = {
  mobile?: boolean;
  open: boolean;
  /** Hidden while a sheet or dialog covers the desk. */
  hidden: boolean;
  notes: string;
  stock: PaperOptions["stock"];
  /** `pulled` when a drag let go of it, rather than a click or a key. */
  onOpen: (open: boolean, pulled?: boolean) => void;
  /** How far out the drawer is while it is dragged (0 to 1), then null. */
  onPull: (pull: number | null) => void;
  onNotes: (text: string) => void;
};

const sourcePayload = (text: string): ClipboardPayload => ({
  v: 1,
  from: "source",
  text: text.replace(/\r\n?/g, "\n"),
  clips: [],
});

export function CopyHolder({
  mobile = false,
  open,
  hidden,
  notes,
  stock,
  onOpen,
  onPull,
  onNotes,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(notes);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    x: number;
    start: number;
    width: number;
    last: number;
    time: number;
    velocity: number;
    pull: number;
    /** The desk has been told about this pull and follows it. */
    followed: boolean;
  } | null>(null);
  // Typing stays local and quick; the paper's record follows a moment later.
  const save = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<string | null>(null);
  const saveNotes = useRef(onNotes);
  saveNotes.current = onNotes;
  const flush = () => {
    clearTimeout(save.current);
    if (pending.current !== null) saveNotes.current(pending.current);
    pending.current = null;
  };
  useEffect(() => () => flush(), []);
  useEffect(() => {
    if (pending.current === null) setText(notes);
  }, [notes]);
  useEffect(() => {
    if (!open || hidden || mobile) return;
    const timer = setTimeout(
      () => area.current?.focus({ preventScroll: true }),
      420,
    );
    return () => clearTimeout(timer);
  }, [open, hidden, mobile]);

  function setPull(value: number | null) {
    if (value === null) root.current?.style.removeProperty("--pull");
    else root.current?.style.setProperty("--pull", value.toFixed(3));
  }
  function grab(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    if (drag.current) release(e.clientX);
    const sheet =
      root.current?.querySelector<HTMLElement>(".copy-holder-sheet");
    drag.current = {
      x: e.clientX,
      start: open ? 1 : 0,
      width: sheet?.offsetWidth || 320,
      last: e.clientX,
      time: performance.now(),
      velocity: 0,
      pull: open ? 1 : 0,
      followed: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    void machineAudio.unlock();
  }
  function pull(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    // The button came up somewhere this page never heard about (outside the
    // window, over another app): let go where the pointer is now.
    if (e.buttons === 0) {
      release(e.clientX);
      return;
    }
    if (!dragging && Math.abs(e.clientX - d.x) > 4) setDragging(true);
    const now = performance.now();
    d.velocity = (e.clientX - d.last) / Math.max(8, now - d.time);
    d.last = e.clientX;
    d.time = now;
    // Past the ends it resists, like a drawer at the end of its runner.
    const raw = d.start + (e.clientX - d.x) / d.width;
    d.pull = raw < 0 ? raw * 0.25 : raw > 1 ? 1 + (raw - 1) * 0.25 : raw;
    setPull(d.pull);
    if (d.followed || Math.abs(e.clientX - d.x) > 4) {
      d.followed = true;
      onPull(d.pull);
    }
    if (Math.abs(d.velocity) > 0.05)
      machineAudio.drawerRun(Math.min(1, Math.abs(d.velocity)));
  }
  function release(clientX: number) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const moved = d.followed || Math.abs(clientX - d.x) > 4;
    setDragging(false);
    setPull(null);
    if (d.followed) onPull(null);
    // A flick decides; otherwise wherever it was let go past halfway.
    const next = !moved
      ? !open
      : d.velocity > 0.45
        ? true
        : d.velocity < -0.45
          ? false
          : d.pull > 0.5;
    if (next !== open) onOpen(next, moved);
  }
  // Leaving the window mid-drag can swallow the pointer's release.
  useEffect(() => {
    const letGo = () => {
      const d = drag.current;
      if (d) release(d.last);
    };
    window.addEventListener("blur", letGo);
    return () => window.removeEventListener("blur", letGo);
  });

  return (
    <div
      ref={root}
      className={`copy-holder ${open ? "is-open" : ""} ${dragging ? "is-dragging" : ""} ${hidden ? "is-hidden" : ""}`}
      inert={hidden || undefined}
      style={
        {
          "--holder-paper": stocks[stock].tint,
          "--holder-texture": `url("/textures/paper-${stock}.png")`,
        } as CSSProperties
      }
      onKeyDown={(e) => {
        if (e.key === "Tab" && mobile && open) {
          const items = [
            area.current,
            root.current?.querySelector<HTMLButtonElement>(
              ".mobile-sheet-heading button",
            ),
          ].filter(
            (item): item is HTMLTextAreaElement | HTMLButtonElement => !!item,
          );
          e.preventDefault();
          const at = items.indexOf(
            document.activeElement as HTMLTextAreaElement | HTMLButtonElement,
          );
          items[
            (at + (e.shiftKey ? -1 : 1) + items.length) % items.length
          ]?.focus();
        }
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          flush();
          if (mobile) area.current?.blur();
          onOpen(false);
        }
      }}
    >
      <section
        className="copy-holder-sheet"
        aria-label="Notes for this paper"
        role={mobile && open ? "dialog" : undefined}
        aria-modal={mobile && open ? true : undefined}
        inert={!open || undefined}
      >
        <header className="mobile-sheet-heading mobile-only">
          <span>Notes</span>
          <button
            type="button"
            aria-label="Close notes"
            onClick={() => {
              flush();
              area.current?.blur();
              onOpen(false);
            }}
          >
            <X size={20} />
          </button>
        </header>
        <span className="copy-holder-clip" aria-hidden="true" />
        <textarea
          ref={area}
          className="copy-holder-text"
          dir="auto"
          spellCheck={false}
          aria-label="Notes for this paper"
          placeholder={
            "Notes for this paper.\nPaste a source, jot down what you need."
          }
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            pending.current = e.target.value;
            clearTimeout(save.current);
            save.current = setTimeout(flush, 300);
          }}
          onBlur={flush}
          onKeyDown={(e) => {
            if (
              Array.from(e.key).length === 1 &&
              !e.metaKey &&
              !e.ctrlKey &&
              !e.nativeEvent.isComposing
            ) {
              void machineAudio.unlock();
              machineAudio.pencil();
            }
          }}
          onCopy={(e) => {
            const field = e.currentTarget;
            const picked = field.value.slice(
              field.selectionStart,
              field.selectionEnd,
            );
            if (!picked) return;
            const payload = sourcePayload(picked);
            e.clipboardData.setData("text/plain", payload.text);
            e.clipboardData.setData(DECKLE_CLIPBOARD, JSON.stringify(payload));
            rememberCopy(payload);
            e.preventDefault();
            machineAudio.carbon();
          }}
          onDragStart={(e) => {
            const field = e.currentTarget;
            const picked = field.value.slice(
              field.selectionStart,
              field.selectionEnd,
            );
            if (picked)
              e.dataTransfer.setData(
                DECKLE_CLIPBOARD,
                JSON.stringify(sourcePayload(picked)),
              );
          }}
        />
      </section>
      <button
        type="button"
        className="copy-holder-handle"
        aria-label={open ? "Push the notes back" : "Pull out the notes"}
        aria-expanded={open}
        title={open ? "Push back · Esc" : "Pull out your notes"}
        onPointerDown={grab}
        onPointerMove={pull}
        onPointerUp={(e) => release(e.clientX)}
        onPointerCancel={(e) => release(e.clientX)}
        onLostPointerCapture={(e) => release(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(!open);
          }
        }}
      >
        <span className="copy-holder-grip" aria-hidden="true" />
        <span className="copy-holder-label" aria-hidden="true">
          Notes
        </span>
      </button>
    </div>
  );
}
