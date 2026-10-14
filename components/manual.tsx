import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Volume2 } from "lucide-react";
import { DeskDialog } from "./dialog";
import type { Settings } from "@/lib/writing";
const headings = [
  "On writing",
  "Sound",
  "Light",
  "Typeface",
  "Your papers",
  "Care",
];
export function Manual({
  settings,
  update,
  onClose,
  onExport,
  onBackup,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onClose: () => void;
  onExport: () => void;
  onBackup: () => void;
}) {
  const [page, setPage] = useState(0);
  function choice(label: string, checked: boolean, action: () => void) {
    return (
      <label className="printed-choice">
        <input type="checkbox" checked={checked} onChange={action} />
        <span>{label}</span>
      </label>
    );
  }
  return (
    <DeskDialog
      label="Instruction manual"
      onClose={onClose}
      className="manual-dialog"
    >
      <div className="manual-spine" />
      <div className="manual-page">
        <div className="manual-running">
          DECKLE <span>OWNER’S MANUAL</span>
        </div>
        <h2>{headings[page]}</h2>
        {page === 0 && (
          <>
            <p>
              This machine has one purpose. To give your words somewhere to go.
            </p>
            <p>
              Begin typing. You always write on the line just above the slot;
              the paper rises one line at a time, never the other way round.
              Click earlier words to revise them. The paper rolls back to meet
              you when you type.
            </p>
            <p className="small-print">
              Select words to revise or format them. Turn the feed knob to read
              earlier lines. Tearing saves this piece in the archive and starts
              a fresh paper.
            </p>
          </>
        )}
        {page === 1 && (
          <>
            <p>
              A good mechanism need not announce itself. Set the volume to suit
              the room.
            </p>
            <label className="manual-slider">
              <Volume2 size={18} /> Volume
              <input
                aria-label="Master volume"
                type="range"
                min="0"
                max="1"
                step=".01"
                value={settings.volume}
                onChange={(e) => update({ volume: +e.target.value })}
              />
            </label>
            {choice("Ring the margin bell", settings.bell, () =>
              update({ bell: !settings.bell }),
            )}
            <p className="small-print">
              Every key is a real recording of a Hermes Precisa 305, chosen by
              the weight of the letter and heard where the head stands on the
              line. The room is a small, furnished study.
            </p>
            <div className="room-stamp">STUDY · SMALL ROOM</div>
          </>
        )}
        {page === 2 && (
          <>
            <p>
              Window light for the day. A small pool of lamplight for the
              evening. Pull the chain at any time.
            </p>
            {(["auto", "day", "lamp"] as const).map((v, i) => (
              <div key={v}>
                {choice(
                  ["Follow the day", "Always daylight", "Always lamplight"][i],
                  settings.light === v,
                  () => update({ light: v }),
                )}
              </div>
            ))}
            <p className="small-print">
              Automatic light changes at 7 in the morning and 7 in the evening,
              by your local clock. No location is requested.
            </p>
          </>
        )}
        {page === 3 && (
          <>
            <p>
              Two faces. The same words. Choose the one you would like to spend
              time with.
            </p>
            {choice("Courier Prime", settings.face === "mono", () =>
              update({ face: "mono" }),
            )}
            <p className="type-specimen mono">
              The quiet work of putting
              <br />
              one word after another.
            </p>
            {choice("Book serif", settings.face === "book", () =>
              update({ face: "book" }),
            )}
            <p className="type-specimen book">
              The quiet work of putting
              <br />
              one word after another.
            </p>
          </>
        )}
        {page === 4 && (
          <>
            <p>
              Your papers stay in this browser on this device. No account. No
              server receives your writing.
            </p>
            <p>
              Keep a copy somewhere safe. Clearing this site’s data will clear
              the drawer, too.
            </p>
            <button className="printed-button" onClick={onExport}>
              <Download size={16} /> Export all as Markdown
            </button>
            <button className="printed-button" onClick={onBackup}>
              <Download size={16} /> Export archive with replay logs
            </button>
            <p className="small-print">
              Text exports never include keystroke history. Open a finished
              paper to print it or save it as a PDF. This web edition uses
              browser storage, so there is no folder to reveal.
            </p>
          </>
        )}
        {page === 5 && (
          <>
            <p>
              The machine should accommodate its writer. Adjust these provisions
              as needed.
            </p>
            {choice("Reduce movement", settings.reduceMotion, () =>
              update({ reduceMotion: !settings.reduceMotion }),
            )}
            {choice("Larger paper and type", settings.largeType, () =>
              update({ largeType: !settings.largeType }),
            )}
            {choice("Silence the machine", settings.volume === 0, () =>
              update({ volume: settings.volume ? 0 : 0.35 }),
            )}
            <p className="small-print">
              The system’s reduced-motion preference is also respected. Every
              control is reachable by keyboard. A text version of the paper is
              available to screen readers.
            </p>
          </>
        )}
        <footer className="manual-pagination">
          <button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            aria-label="Previous manual page"
          >
            <ChevronLeft size={17} />
          </button>
          <span>{String(page + 1).padStart(2, "0")} / 06</span>
          <button
            disabled={page === 5}
            onClick={() => setPage(page + 1)}
            aria-label="Next manual page"
          >
            <ChevronRight size={17} />
          </button>
        </footer>
      </div>
    </DeskDialog>
  );
}
