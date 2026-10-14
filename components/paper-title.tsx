"use client";
import {
  forwardRef,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { machineAudio } from "@/lib/audio";
import { isJoiningGlyph, textDirection } from "@/lib/direction";

// The title is typed on the same machine as the page: every key strikes, and
// each new letter lands with wet ink. The input keeps native editing,
// selection and IME; its own text is transparent, and an inked copy of the
// same glyphs sits exactly underneath.
type Props = {
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
  /** Enter or Escape hands the keyboard back to the page. */
  onDone: () => void;
};
const seedAt = (index: number, char: string) =>
  ((index + 1) * 2654435761 + char.charCodeAt(0) * 40503) >>> 0;
const part = (seed: number, shift: number) =>
  ((seed >>> shift) % 1000) / 1000 - 0.5;

export const PaperTitle = forwardRef<HTMLInputElement, Props>(
  function PaperTitle({ value, placeholder, disabled, onChange, onDone }, ref) {
    const input = useRef<HTMLInputElement | null>(null);
    const ink = useRef<HTMLSpanElement>(null);
    // The characters typed by the latest keystroke, for the wet-ink landing.
    const [fresh, setFresh] = useState<{ from: number; to: number } | null>(
      null,
    );
    const freshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
      undefined,
    );
    const follow = () => {
      // A long title scrolls inside the input; the ink follows it.
      if (ink.current && input.current)
        ink.current.style.transform = `translateX(${-input.current.scrollLeft}px)`;
    };
    useLayoutEffect(follow, [value]);
    useLayoutEffect(() => () => clearTimeout(freshTimer.current), []);
    const glyphs = Array.from(value);
    return (
      <span className="paper-title-field">
        <input
          ref={(node) => {
            input.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
          }}
          className="paper-title"
          aria-label="Paper title"
          dir="auto"
          placeholder={placeholder}
          maxLength={160}
          value={value}
          disabled={disabled}
          onScroll={follow}
          onSelect={follow}
          onChange={(e) => {
            const next = e.target.value;
            const before = Array.from(value),
              after = Array.from(next);
            let start = 0;
            while (
              start < before.length &&
              start < after.length &&
              before[start] === after[start]
            )
              start++;
            const added = after.length - before.length;
            if (added > 0) {
              setFresh({ from: start, to: start + added });
              clearTimeout(freshTimer.current);
              freshTimer.current = setTimeout(() => setFresh(null), 700);
            }
            onChange(next);
          }}
          onPaste={() => {
            void machineAudio.unlock();
            machineAudio.rustle({ gain: 0.25, duration: 0.24 });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              onDone();
              return;
            }
            if (e.metaKey || e.ctrlKey || e.altKey || e.nativeEvent.isComposing)
              return;
            void machineAudio.unlock();
            const caret = e.currentTarget.selectionStart ?? value.length;
            const column = Math.min(60, Math.round((caret / 60) * 60));
            if (e.key === "Backspace" || e.key === "Delete")
              machineAudio.correction(column);
            else if (e.key === " ") machineAudio.space(column);
            else if (Array.from(e.key).length === 1)
              machineAudio.strike(e.key, column, { repeat: e.repeat });
          }}
        />
        <span
          className="paper-title paper-title-ink"
          aria-hidden="true"
          dir={textDirection(value) ?? "ltr"}
        >
          <span ref={ink} className="paper-title-ink-run">
            {glyphs.map((char, index) => {
              const seed = seedAt(index, char);
              const joined = isJoiningGlyph(char);
              return (
                <span
                  key={index}
                  className={`ink-glyph${fresh && index >= fresh.from && index < fresh.to ? " ink-fresh" : ""}`}
                  style={
                    {
                      "--strike-y": joined
                        ? "0px"
                        : `${(part(seed, 10) * 0.7).toFixed(2)}px`,
                      "--strike-x": joined
                        ? "0px"
                        : `${(part(seed, 20) * 0.5).toFixed(2)}px`,
                      "--ink-density": joined
                        ? 1
                        : (0.9 + ((seed % 1000) / 1000) * 0.1).toFixed(3),
                    } as CSSProperties
                  }
                >
                  {char}
                </span>
              );
            })}
          </span>
        </span>
      </span>
    );
  },
);
