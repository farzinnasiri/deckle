"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Bold,
  ClipboardPaste,
  Code,
  Copy,
  Italic,
  Scissors,
  Strikethrough,
  Underline,
} from "lucide-react";
import {
  FORMAT_KEYS,
  type FormatCommand,
  type SelectionBox,
} from "./paper-editor";

// A short bar of keys over selected words: cut, copy and paste, then the
// styles.
// It sits above the selection, or below when the paper window has no room
// above, close to where the mouse let go. Each key has a hint with its
// shortcut. The editor keeps focus throughout.

export type SelectionCommand = "cut" | "copy" | "paste" | FormatCommand;
const CLIPBOARD = new Set<SelectionCommand>(["cut", "copy", "paste"]);
type Key = {
  command: SelectionCommand;
  label: string;
  icon: ReactNode;
  shortcut?: string;
};
const KEYS: Key[][] = [
  [
    {
      command: "cut",
      label: "Cut",
      icon: <Scissors size={16} />,
      shortcut: "Mod-x",
    },
    {
      command: "copy",
      label: "Copy",
      icon: <Copy size={16} />,
      shortcut: "Mod-c",
    },
    {
      command: "paste",
      label: "Paste",
      icon: <ClipboardPaste size={16} />,
      shortcut: "Mod-v",
    },
  ],
  [
    { command: "bold", label: "Bold", icon: <Bold size={16} /> },
    { command: "italic", label: "Italic", icon: <Italic size={16} /> },
    { command: "underline", label: "Underline", icon: <Underline size={16} /> },
    {
      command: "strike",
      label: "Strike through",
      icon: <Strikethrough size={16} />,
    },
    { command: "code", label: "Code", icon: <Code size={16} /> },
  ],
];
const mac =
  typeof navigator !== "undefined" &&
  /Mac|iP(hone|ad)/.test(navigator.platform);
const shortcutLabel = (key?: string) =>
  key
    ?.split("-")
    .map((part) =>
      part === "Mod"
        ? mac
          ? "⌘"
          : "Ctrl+"
        : part === "Shift"
          ? mac
            ? "⇧"
            : "Shift+"
          : part.toUpperCase(),
    )
    .join("");

export function SelectionBar({
  locate,
  paperWindow,
  active,
  only,
  onCommand,
}: {
  locate: () => SelectionBox | null;
  /** The visible paper, in viewport pixels. */
  paperWindow: () => { top: number; bottom: number } | null;
  active: Partial<Record<SelectionCommand, boolean>>;
  /** Show just these keys (a bare caret has nothing to copy or style). */
  only?: SelectionCommand[];
  onCommand: (command: SelectionCommand) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  // A key on its own says what it does.
  const lone = only?.length === 1;
  const [place, setPlace] = useState<{
    left: number;
    top: number;
    below: boolean;
    nub: number;
  } | null>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const started = performance.now();
    const measure = () => {
      const box = locate();
      const width = bar.current?.offsetWidth ?? 300,
        height = bar.current?.offsetHeight ?? 40;
      const view = paperWindow();
      if (box && view) {
        const viewportTop = window.visualViewport?.offsetTop ?? 0;
        const visibleTop = Math.max(view.top, viewportTop);
        const visibleBottom = Math.min(
          view.bottom,
          viewportTop + (window.visualViewport?.height ?? innerHeight),
        );
        // Centre on a one-line selection; on a longer one, stay by the end
        // the mouse finished on, so the keys are a short reach away.
        const centre = box.singleLine ? (box.startX + box.endX) / 2 : box.headX;
        const left = Math.max(
          12,
          Math.min(innerWidth - width - 12, centre - width / 2),
        );
        // A selection can run past the window, behind the machine or above
        // the slot; the bar stays over the paper you can see.
        const clamp = (y: number) =>
          Math.max(visibleTop, Math.min(visibleBottom, y));
        const anchorTop = clamp(box.singleLine ? box.top : box.headTop),
          anchorBottom = clamp(box.singleLine ? box.bottom : box.headBottom);
        const below = anchorTop - height - 12 < Math.max(8, visibleTop);
        setPlace({
          left,
          top: Math.max(
            visibleTop + 4,
            Math.min(
              visibleBottom - height - 4,
              below ? anchorBottom + 10 : anchorTop - height - 10,
            ),
          ),
          below,
          nub: Math.max(14, Math.min(width - 14, centre - left)),
        });
      } else setPlace(null);
      // The paper may still be feeding; follow it briefly.
      if (performance.now() - started < 500)
        frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [locate, paperWindow, active]);
  return (
    <div
      ref={bar}
      className={`selection-bar ${place?.below ? "is-below" : ""}`}
      role="toolbar"
      aria-label="Selected text"
      style={
        place
          ? {
              left: place.left,
              top: place.top,
              ["--nub" as string]: `${place.nub}px`,
            }
          : { visibility: "hidden" }
      }
      // Keys must not take focus from the paper.
      onPointerDown={(e) => e.preventDefault()}
    >
      {KEYS.map((all) =>
        only ? all.filter((key) => only.includes(key.command)) : all,
      )
        .filter((group) => group.length)
        .map((group, index) => (
          <div className="selection-bar-group" key={index}>
            {group.map((key) => {
              const shortcut = shortcutLabel(
                key.shortcut ?? FORMAT_KEYS[key.command as FormatCommand],
              );
              const pressed = CLIPBOARD.has(key.command)
                ? undefined
                : !!active[key.command];
              return (
                <button
                  key={key.command}
                  type="button"
                  className={`selection-bar-key ${lone ? "has-label" : ""}`}
                  aria-label={key.label}
                  aria-pressed={pressed}
                  data-hint={shortcut ? `${key.label}  ${shortcut}` : key.label}
                  onClick={() => onCommand(key.command)}
                >
                  {key.icon}
                  {lone && <span>{key.label} here</span>}
                </button>
              );
            })}
          </div>
        ))}
    </div>
  );
}
