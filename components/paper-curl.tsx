import type { CSSProperties } from "react";
import { paperCurlProfile } from "@/lib/paper-curl";
import { paperVariables } from "@/lib/materials";
import type { PaperOptions } from "@/lib/writing";

/** The crest where the sheet rolls back over itself. Its torn edge is behind
 * the bend; fibres foreshorten and the writing turns away from the reader.
 * The live editor stays on the flat sheet, so feeding back reveals the ink. */
export function PaperCurl({
  feedOffset,
  paper,
}: {
  feedOffset: number;
  paper: PaperOptions;
}) {
  const { crest, strength } = paperCurlProfile(feedOffset);
  if (strength <= 0) return null;
  return (
    <div
      className="paper-crest"
      aria-hidden="true"
      data-crest={Math.round(crest)}
      style={
        {
          ...paperVariables(paper),
          "--crest": `${crest}px`,
          // Fibres travel over the bend more slowly than the flat sheet.
          "--crest-feed": `${feedOffset * 0.4}px`,
          opacity: strength,
        } as CSSProperties
      }
    >
      <span className="paper-crest-surface" />
    </div>
  );
}
