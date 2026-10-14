"use client";
import { useLayoutEffect, useRef, useState } from "react";
export type DeskFocus = "paper" | "machine" | "lamp" | "rail" | "desk" | null;
const targets = {
  paper: ".paper-window",
  machine: ".machine-face",
  lamp: ".pendant-lamp",
  rail: ".light-fader-input",
  desk: ".desk-clock",
};
const hints = {
  paper: "Choose a stock. Watch the texture of this paper.",
  machine: "Your choices rearrange this machine.",
  lamp: "Click the shade or pull its cord to try the lamp.",
  rail: "Move this slider left or right to adjust the light below the paper.",
  desk: "Choose the surface around your writing.",
};
export function DeskFocusGuide({ focus }: { focus: DeskFocus }) {
  const guide = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    rail?: {
      left: number;
      top: number;
      width: number;
      height: number;
      fromX: number;
      x: number;
      y: number;
    };
  }>({ left: 20, top: 110 });
  useLayoutEffect(() => {
    if (!focus) return;
    const measure = () => {
      const rect = document
        .querySelector(targets[focus])
        ?.getBoundingClientRect();
      if (!rect) return;
      const narrow = innerWidth <= 800,
        width = narrow ? innerWidth : innerWidth - 380;
      if (focus === "rail" && guide.current) {
        const control = document
          .querySelector(".rail-light-fader")
          ?.getBoundingClientRect();
        if (!control) return;
        const hintWidth = guide.current.offsetWidth;
        const hintHeight = guide.current.offsetHeight;
        const left = Math.max(
          12,
          Math.min(
            width - hintWidth - 12,
            control.left + (control.width - hintWidth) / 2,
          ),
        );
        const top = Math.max(12, control.top - hintHeight - 28);
        setPosition({
          left,
          top,
          rail: {
            left: control.left - 5,
            top: control.top - 5,
            width: control.width + 10,
            height: control.height + 10,
            fromX: hintWidth / 2,
            x: control.left + control.width / 2 - left,
            y: control.top - 5 - top - hintHeight,
          },
        });
        return;
      }
      const limit = narrow ? innerHeight * 0.52 : innerHeight - 70;
      setPosition({
        left: Math.max(
          12,
          Math.min(width - 224, rect.left + (rect.width - 210) / 2),
        ),
        top: Math.max(
          12,
          Math.min(limit, focus === "lamp" ? rect.bottom + 14 : rect.top - 56),
        ),
      });
    };
    measure();
    let frame = 0;
    let until = performance.now() + 600;
    const follow = () => {
      measure();
      if (performance.now() < until) frame = requestAnimationFrame(follow);
    };
    const settle = () => {
      cancelAnimationFrame(frame);
      until = performance.now() + 600;
      follow();
    };
    settle();
    const observer = new ResizeObserver(measure);
    if (guide.current) observer.observe(guide.current);
    window.addEventListener("resize", settle);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", settle);
    };
  }, [focus]);
  return focus ? (
    <>
      {focus === "rail" && position.rail && (
        <div
          className="desk-focus-target"
          style={{
            left: position.rail.left,
            top: position.rail.top,
            width: position.rail.width,
            height: position.rail.height,
          }}
          aria-hidden="true"
        />
      )}
      <div
        ref={guide}
        className={`desk-focus-guide${focus === "rail" ? " is-rail" : ""}`}
        style={{ left: position.left, top: position.top }}
        role="status"
        key={focus}
      >
        {focus === "rail" && position.rail ? (
          <svg
            className="desk-focus-pointer"
            width="100%"
            height={Math.max(1, position.rail.y)}
            aria-hidden="true"
          >
            <path
              d={`M ${position.rail.fromX} 0 L ${position.rail.x} ${position.rail.y}`}
            />
            <path
              d={`M ${position.rail.x - 4} ${position.rail.y - 6} L ${position.rail.x} ${position.rail.y} L ${position.rail.x + 4} ${position.rail.y - 6}`}
            />
          </svg>
        ) : (
          <span aria-hidden="true">↳</span>
        )}
        {hints[focus]}
      </div>
    </>
  ) : null;
}
