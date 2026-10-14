import type { CSSProperties } from "react";
import { stampAppearance, type Stamp as StampData } from "@/lib/writing";
export function Stamp({
  stamp,
  fresh = false,
}: {
  stamp?: StampData;
  fresh?: boolean;
}) {
  if (!stamp) return null;
  const look = stampAppearance(stamp.seed);
  const date = new Date(stamp.at)
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
  return (
    <span
      className={`date-stamp ${fresh ? "stamp-landing" : ""}`}
      style={
        {
          "--stamp-angle": `${look.angle}deg`,
          transform: `translate(${look.x}px, ${look.y}px) rotate(${look.angle}deg)`,
          opacity: look.opacity,
          maskPosition: `${look.maskX}px 0`,
        } as CSSProperties
      }
    >
      {stamp.name.toUpperCase()} · {date}
    </span>
  );
}
