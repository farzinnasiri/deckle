"use client";

import { WASTEBASKET_CAPACITY } from "@/lib/writing";

import { useEffect, useRef, useState, type RefObject } from "react";

/** A wire mesh steel wastebasket standing on the floor at the desk's corner.
 * Discarded papers show crumpled in its mouth; opening it shows them. */
export function DeskBin({
  count,
  onOpen,
  mouthRef,
}: {
  count: number;
  onOpen: () => void;
  /** The opening, which a thrown paper aims for. */
  mouthRef: RefObject<HTMLSpanElement | null>;
}) {
  const [caught, setCaught] = useState(0);
  useEffect(() => {
    // Keep each fill state and the shredder ready before their first animation.
    const paths = Array.from(
      { length: WASTEBASKET_CAPACITY },
      (_, i) => `/objects/wastebasket-${i + 1}.png`,
    );
    paths.push("/objects/shredder.png");
    paths.forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, []);
  const before = useRef(count);
  useEffect(() => {
    if (count > before.current) setCaught((n) => n + 1);
    before.current = count;
  }, [count]);
  const label =
    count >= WASTEBASKET_CAPACITY
      ? "Wastebasket full. Empty it before discarding another paper."
      : count === 0
        ? "Wastebasket, empty"
        : `Wastebasket, ${count} discarded ${count === 1 ? "paper" : "papers"}`;
  return (
    <button
      type="button"
      className={`desk-bin ${caught ? "is-caught" : ""}`}
      key={caught}
      onClick={onOpen}
      aria-label={label}
      title={label}
    >
      <img
        className="bin-object"
        src={
          count === 0
            ? "/objects/wastebasket.png"
            : `/objects/wastebasket-${Math.min(count, WASTEBASKET_CAPACITY)}.png`
        }
        width="104"
        height="132"
        alt=""
        draggable={false}
      />
      {count >= WASTEBASKET_CAPACITY && (
        <span className="bin-full-label">Full · empty basket</span>
      )}
      <span className="bin-mouth" ref={mouthRef} aria-hidden="true" />
    </button>
  );
}
