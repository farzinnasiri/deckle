"use client";

import { Minus, Plus } from "lucide-react";
import type { CSSProperties } from "react";
import { elements } from "@/lib/materials";
import type { MachineControl } from "@/lib/desk-layout";
import { machineAudio } from "@/lib/audio";
import { TYPE_SIZES, typeSizePatch, type TypeSize } from "@/lib/type-size";
import {
  paperRuling,
  paperRulings,
  type PaperOptions,
  type Settings,
} from "@/lib/writing";

export function MachinePaperControls({
  paper,
  size,
  update,
  updatePaper,
  visible = ["typeface", "typeSize", "ruling"],
}: {
  visible?: MachineControl[];
  paper: PaperOptions;
  size: TypeSize;
  update: (patch: Partial<Settings>) => void;
  updatePaper: (patch: Partial<PaperOptions>) => void;
}) {
  const fonts = Object.keys(elements) as PaperOptions["element"][];
  const rulings = Object.keys(paperRulings) as NonNullable<
    PaperOptions["ruling"]
  >[];
  const ruling = paperRuling(paper);
  const fontNames = { mono: "Courier", italic: "Italic", book: "Baskerville" };
  const rulingNames = {
    blank: "Blank",
    narrow: "Narrow",
    wide: "Wide",
    margin: "Margin",
    graph: "Graph",
    dots: "Dots",
  };
  const press = () => {
    void machineAudio.unlock();
    machineAudio.keyDown(0.25);
  };
  return (
    <div
      hidden={
        !visible.some((id) => ["typeface", "typeSize", "ruling"].includes(id))
      }
      className="machine-paper-controls"
      role="group"
      aria-label="Paper controls"
    >
      <div
        className="machine-paper-setting"
        data-layout-control="typeface"
        hidden={!visible.includes("typeface")}
      >
        <span className="engraved">Typeface</span>
        <button
          type="button"
          className="typeface-dial"
          aria-label={`Typeface: ${elements[paper.element]}. Switch typeface`}
          title="Turn to switch typeface"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            updatePaper({
              element: fonts[(fonts.indexOf(paper.element) + 1) % fonts.length],
            })
          }
        >
          <span className="typeface-bezel" aria-hidden="true">
            <span
              className="typeface-wheel"
              style={
                {
                  "--dial-angle": `${-50 + fonts.indexOf(paper.element) * 50}deg`,
                } as CSSProperties
              }
            >
              <i />
            </span>
            <span className={`typeface-specimen specimen-${paper.element}`}>
              Aa
            </span>
          </span>
          <span className="mechanism-caption" aria-live="polite">
            {fontNames[paper.element]}
          </span>
        </button>
      </div>
      <div
        className="machine-paper-setting machine-size-control"
        data-layout-control="typeSize"
        hidden={!visible.includes("typeSize")}
        role="group"
        aria-label="Type size"
      >
        <span className="engraved">Type size</span>
        <div className="machine-size-keys">
          <button
            type="button"
            className="size-key"
            aria-label="Decrease font size"
            disabled={size === 1}
            onMouseDown={(event) => event.preventDefault()}
            onPointerDown={press}
            onClick={() =>
              update(typeSizePatch(Math.max(1, size - 1) as TypeSize))
            }
          >
            <Minus size={21} strokeWidth={2.4} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="size-key"
            aria-label="Increase font size"
            disabled={size === 4}
            onMouseDown={(event) => event.preventDefault()}
            onPointerDown={press}
            onClick={() =>
              update(typeSizePatch(Math.min(4, size + 1) as TypeSize))
            }
          >
            <Plus size={21} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
        <output
          className="type-size-lights"
          aria-live="polite"
          aria-label={`Type size ${size} of 4: ${TYPE_SIZES[size - 1].name}`}
        >
          {TYPE_SIZES.map((level, i) => (
            <i
              key={level.name}
              className={i < size ? "is-lit" : ""}
              aria-hidden="true"
            />
          ))}
          <span className="sr-only">{TYPE_SIZES[size - 1].name}</span>
        </output>
      </div>
      <div
        className="machine-paper-setting"
        data-layout-control="ruling"
        hidden={!visible.includes("ruling")}
      >
        <span className="engraved">Page lines</span>
        <button
          type="button"
          className={`ruling-lever ruling-${ruling}`}
          aria-label={`Paper ruling: ${paperRulings[ruling]}. Switch ruling`}
          title="Click the lever to change page lines"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            updatePaper({
              ruling: rulings[(rulings.indexOf(ruling) + 1) % rulings.length],
            })
          }
        >
          <span className="ruling-mechanism" aria-hidden="true">
            <span className="ruling-sample" />
            <span className="ruling-slot">
              <i />
            </span>
          </span>
          <span className="mechanism-caption" aria-live="polite">
            {rulingNames[ruling]}
          </span>
        </button>
      </div>
    </div>
  );
}
