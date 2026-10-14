"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import {
  applyEvent,
  defaultPaper,
  layout,
  markdown,
  pauseDuration,
  title,
  type Document,
  type Piece,
} from "@/lib/writing";
import { useDeskStorage } from "./desk-storage-provider";
import { paperVariables } from "@/lib/materials";
import { machineAudio } from "@/lib/audio";
import { PaperMarks } from "./paper";
import { DECKLE_CLIPBOARD, rememberCopy } from "@/lib/clipboard";
import { Stamp } from "./stamp";

export type ArchivePreviewActions = {
  replay: () => Promise<void>;
  pause: () => void;
  paper: () => HTMLElement | null;
};

export function ArchivePaperPreview({
  piece,
  busy,
  onOpen,
  actionsRef,
  onRestore,
  onBack,
}: {
  piece: Piece;
  busy: boolean;
  onOpen: (piece: Piece) => Promise<void>;
  actionsRef: Ref<ArchivePreviewActions>;
  onRestore: (piece: Piece) => void;
  /** Slides the paper back into its folder. Absent for discarded papers. */
  onBack?: () => void;
}) {
  const paper = useRef<HTMLDivElement>(null);
  const { hydratePiece } = useDeskStorage();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [replay, setReplay] = useState<Piece | null>(null);
  const [replayDoc, setReplayDoc] = useState<Document | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const index = useRef(0);
  const scroll = useRef<HTMLDivElement>(null);
  const waste = Boolean(piece.discardedAt);
  const document = replayDoc || piece.document;

  useEffect(() => {
    if (!playing || !replay) return;
    if (index.current >= replay.events.length) {
      setPlaying(false);
      return;
    }
    const i = index.current;
    const event = replay.events[i];
    const gap = i
      ? pauseDuration(replay.events[i - 1].at, event.at, speed)
      : 120;
    const timer = setTimeout(() => {
      const before = replayDoc || { marks: [], cursor: 0 };
      const next = applyEvent(before, event);
      const column = layout(next).head.col;
      if (event.action === "paste") machineAudio.rustle({ gain: 0.3 });
      else if (event.action === "stamp") machineAudio.physical("stamp");
      else if (event.action === "style") machineAudio.physical("lever");
      else if (event.action === "block") machineAudio.roll(2);
      else if (!["restore", "title", "paper"].includes(event.action)) {
        if (event.action !== "type") machineAudio.correction(column);
        else if (event.key === "\n")
          machineAudio.carriageReturn(layout(before).head.col);
        else if (event.key === " ") machineAudio.space(column);
        else machineAudio.strike(Array.from(event.key).at(-1) || "", column);
      }
      index.current++;
      setReplayDoc(next);
    }, gap);
    return () => clearTimeout(timer);
  }, [playing, replay, replayDoc, speed]);
  useEffect(() => {
    if (playing && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [replayDoc, playing]);

  async function startReplay() {
    try {
      const full = replay || (await hydratePiece(piece));
      if (!full.events.length) {
        setError("No replay was recorded for this paper.");
        return;
      }
      setReplay(full);
      if (!replayDoc || index.current >= full.events.length) {
        index.current = 0;
        setReplayDoc({ marks: [], cursor: 0 });
      }
      void machineAudio.unlock();
      setPlaying(true);
      setError("");
    } catch {
      setError("Couldn't load the replay. Try again.");
    }
  }

  useImperativeHandle(actionsRef, () => ({
    replay: startReplay,
    pause: () => setPlaying(false),
    paper: () => paper.current,
  }));

  return (
    <>
      <div
        ref={paper}
        className={`archive-paper ${waste ? "is-discarded" : ""} stock-${document.paper?.stock || "bond"}`}
        style={paperVariables(document.paper || defaultPaper) as CSSProperties}
      >
        <div
          className="archive-paper-scroll"
          ref={scroll}
          tabIndex={0}
          role="document"
          aria-label={`Preview of ${title(piece)}`}
          onCopy={(e) => {
            // Words copied from one of your own papers are yours when pasted.
            // A selection that touches a clipping keeps the outside rules.
            const selection = window.getSelection();
            const text = selection?.toString() ?? "";
            if (!text || !selection?.rangeCount) return;
            const range = selection.getRangeAt(0);
            const quoted = Array.from(
              e.currentTarget.querySelectorAll(".read-clipping"),
            ).some((line) => range.intersectsNode(line));
            if (quoted) return;
            const payload = {
              v: 1 as const,
              from: "paper" as const,
              text: text.replace(/\r\n?/g, "\n"),
              clips: [],
            };
            e.clipboardData.setData("text/plain", payload.text);
            e.clipboardData.setData(DECKLE_CLIPBOARD, JSON.stringify(payload));
            rememberCopy(payload);
            e.preventDefault();
          }}
        >
          <div className="archive-paper-date">
            {document.stamp ? (
              <Stamp stamp={document.stamp} />
            ) : (
              <time>
                {new Date(piece.torn || piece.created).toLocaleDateString(
                  "en-GB",
                  { day: "numeric", month: "short", year: "numeric" },
                )}
              </time>
            )}
          </div>
          <PaperMarks document={document} idPrefix={`archive-${piece.id}`} />
          {!document.marks.length && !document.title && (
            <p className="archive-blank">Blank paper</p>
          )}
        </div>
      </div>
      {/* The folder's front: the sheet is drawn up from behind it. */}
      {!waste && <div className="archive-folder-front" aria-hidden="true" />}
      <div className="archive-paper-actions">
        {onBack && (
          <button
            type="button"
            className="archive-put-back"
            disabled={busy || opening}
            onClick={onBack}
          >
            <ArrowDownToLine size={16} /> Put back
          </button>
        )}
        <button
          type="button"
          className="archive-open"
          disabled={busy || opening}
          onClick={async () => {
            if (waste) {
              onRestore(piece);
              return;
            }
            setOpening(true);
            setPlaying(false);
            try {
              await onOpen(piece);
            } catch {
              setError("Couldn't open this paper. Try again.");
              setOpening(false);
            }
          }}
        >
          {waste ? (
            <>
              <RotateCcw size={16} /> Restore
            </>
          ) : (
            <>
              {opening ? "Opening…" : "Open"} <ArrowRight size={17} />
            </>
          )}
        </button>
      </div>
      {replayDoc && (
        <div className="archive-replay" aria-label="Paper replay">
          <button
            type="button"
            className="archive-icon"
            aria-label={playing ? "Pause replay" : "Play replay"}
            onClick={() => (playing ? setPlaying(false) : void startReplay())}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            type="button"
            onClick={() => setSpeed(speed === 1 ? 4 : speed === 4 ? 16 : 1)}
            aria-label={`Replay speed ${speed} times. Click to change`}
          >
            {speed}×
          </button>
          <button
            type="button"
            className="archive-icon"
            aria-label="Close replay"
            onClick={() => {
              setPlaying(false);
              setReplayDoc(null);
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {error && (
        <p className="archive-message" role="status">
          {error}
        </p>
      )}
      <article className="print-document" aria-hidden="true">
        <header className="print-attribution">
          <span>{piece.document.stamp?.name || "A writer"}</span>
          <time>
            {new Date(
              piece.document.stamp?.at || piece.created,
            ).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
        </header>
        <PaperMarks document={piece.document} idPrefix="print-paper-line" />
      </article>
      <div className="sr-only">{markdown(document)}</div>
    </>
  );
}
