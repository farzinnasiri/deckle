"use client";
import { useEffect, useRef } from "react";
import { machineAudio } from "@/lib/audio";
export function OwnerCard({
  name,
  onDone,
}: {
  name: string;
  onDone: (name: string) => void;
}) {
  const input = useRef<HTMLSpanElement>(null),
    initial = useRef(name);
  useEffect(() => {
    if (input.current) {
      input.current.textContent = initial.current;
      input.current.focus();
    }
  }, []);
  return (
    <div className="owner-in-machine">
      <span className="owner-card-heading">THIS MACHINE BELONGS TO</span>
      <span
        ref={input}
        className="owner-type-line"
        role="textbox"
        aria-label="Type your name on the owner's card"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData
            .getData("text/plain")
            .replace(/\s+/g, " ")
            .slice(0, 48);
          if (input.current) input.current.textContent = text;
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onDone(
              e.key === "Escape"
                ? ""
                : input.current?.textContent?.trim().slice(0, 48) || "",
            );
            return;
          }
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          if (
            e.key.length === 1 &&
            (input.current?.textContent?.length || 0) >= 48
          ) {
            e.preventDefault();
            return;
          }
          void machineAudio.unlock();
          if (e.key === "Backspace") machineAudio.correction(20);
          else if (e.key.length === 1) machineAudio.strike(e.key, 20);
        }}
      />
      <span className="owner-card-instruction">
        Type your name. Return to keep. Esc to skip.
      </span>
    </div>
  );
}
