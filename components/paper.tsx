import { memo, type CSSProperties } from "react";
import {
  documentLines,
  paperRuling,
  styleClass,
  type Document,
} from "@/lib/writing";
import { isJoiningGlyph, lineDirections } from "@/lib/direction";

// The reader and replay use the same line and glyph rules as the live editor.
export const PaperMarks = memo(function PaperMarks({
  document,
  idPrefix = "paper-line",
}: {
  document: Document;
  feed?: number;
  reading?: boolean;
  idPrefix?: string;
}) {
  const lines = documentLines(document);
  const directions = lineDirections(
    lines.map((line) =>
      line.marks.map((mark) => mark.overprints?.at(-1) ?? mark.text).join(""),
    ),
  );
  return (
    <div className={`readable-paper ruling-${paperRuling(document.paper)}`}>
      {document.title && (
        <h1 className="paper-title-read" dir="auto">
          {document.title}
        </h1>
      )}
      {lines.map((line, i) => (
        <div
          id={`${idPrefix}-${i}`}
          key={i}
          dir={directions[i]}
          className={`read-line block-${line.block} ${line.marks[0]?.clipId ? "read-clipping" : ""}`}
        >
          {line.block === "dinkus"
            ? "*  *  *"
            : line.marks.slice(line.prefix).map((mark, j) =>
                mark.kind === "seam" ? (
                  <div className="read-seam" key={mark.id}>
                    continued
                  </div>
                ) : (
                  <span
                    key={mark.id}
                    className={`ink-glyph ${styleClass(mark)} ${mark.crossed ? "ink-crossed" : ""} ${mark.overprints?.length ? "ink-overprint" : ""} ${line.initial && j === 0 ? "stamped-initial" : ""}`}
                    data-underprint={
                      mark.overprints?.length ? mark.text : undefined
                    }
                    style={
                      isJoiningGlyph(mark.text)
                        ? ({
                            "--ink-density": 1,
                            "--strike-y": "0px",
                            "--strike-x": "0px",
                          } as CSSProperties)
                        : ({
                            "--ink-density":
                              mark.density * (0.9 + (mark.seed % 1000) / 10000),
                            "--strike-y": `${(((mark.seed >>> 10) % 1000) / 1000 - 0.5) * 0.7}px`,
                            "--strike-x": `${(((mark.seed >>> 20) % 1000) / 1000 - 0.5) * 0.5}px`,
                          } as CSSProperties)
                    }
                  >
                    {mark.overprints?.at(-1) ?? mark.text}
                  </span>
                ),
              )}
          {!line.marks.length && <br />}
        </div>
      ))}
    </div>
  );
});
