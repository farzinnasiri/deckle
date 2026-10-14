"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Keyboard, Quote } from "lucide-react";
import type { PasteAnchor } from "./paper-editor";

export type PasteTagState = {
  as: "typed" | "clipping";
  /** Changes with every paste, restarting the tag's time on the desk. */
  id: number;
};

// A small paper label on text pasted from outside: what happened to it, and
// the other way to have it. It sits on the top edge of the pasted words,
// follows them while the paper feeds, and leaves on its own or as soon as you
// write.
export function PasteTag({
  tag,
  locate,
  onSwap,
  onDismiss,
}: {
  tag: PasteTagState;
  locate: () => PasteAnchor | null;
  onSwap: () => void;
  onDismiss: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(
    null,
  );
  useLayoutEffect(() => {
    let frame = 0;
    const started = performance.now();
    const measure = () => {
      const anchor = locate();
      const width = root.current?.offsetWidth ?? 240;
      if (anchor) {
        // A tab stuck to the top edge of the pasted words, at the far end of
        // the line from where reading starts (and clear of a clipping's tape).
        const height = root.current?.offsetHeight ?? 36;
        const left = anchor.rtl
          ? anchor.columnLeft
          : anchor.columnRight - width;
        setPlace({
          left: Math.max(12, Math.min(innerWidth - width - 12, left)),
          top: Math.max(12, anchor.top - height - 6),
        });
      }
      // Follow the paper while it feeds after the paste.
      if (performance.now() - started < 900)
        frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [tag, locate]);
  useEffect(() => {
    const timer = setTimeout(onDismiss, 7000);
    return () => clearTimeout(timer);
  }, [tag.id, onDismiss]);
  const clipping = tag.as === "clipping";
  return (
    <div
      ref={root}
      key={tag.id}
      className="paste-tag"
      style={place ?? { visibility: "hidden" }}
      role="status"
    >
      <span className="paste-tag-mark">
        {clipping ? <Quote size={14} /> : <Keyboard size={14} />}
        {clipping ? "Taped in as a clipping" : "Typed in as yours"}
      </span>
      <button
        type="button"
        // Keep the caret in the paper: the swap edits where it already is.
        onPointerDown={(e) => e.preventDefault()}
        onClick={onSwap}
        title={clipping ? "⌘⇧V types outside text in" : undefined}
      >
        {clipping ? <Keyboard size={14} /> : <Quote size={14} />}
        {clipping ? "Type it in" : "Make it a clipping"}
      </button>
    </div>
  );
}
