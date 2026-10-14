import {
  type CSSProperties,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { getClockStyle, type ClockStyleId } from "@/lib/clocks";
import { machineAudio } from "@/lib/audio";

export type DeskClockProps = {
  time: Date;
  hidden: boolean;
  style?: ClockStyleId;
  position?: { x: number; y: number };
  onMove?: (pos: { x: number; y: number }) => void;
  ticking?: boolean;
  onToggleTicking?: () => void;
  sceneScale?: number;
};

export function DeskClock({
  time,
  hidden,
  style = "studio",
  position,
  onMove,
  ticking = false,
  onToggleTicking,
  sceneScale = 1,
}: DeskClockProps) {
  const clockInfo = getClockStyle(style);
  const hours = time.getHours();
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();
  // Hands turn on a 1s transition, so their angles only ever grow: counting
  // from the midnight the clock was set down keeps the minute hand from
  // spinning backwards at the top of every hour.
  const setDown = useRef(new Date(time).setHours(0, 0, 0, 0));
  const days = Math.max(
    0,
    Math.round((new Date(time).setHours(0, 0, 0, 0) - setDown.current) / 864e5),
  );
  const elapsed = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  const hourAngle = (elapsed / 3600) * 30;
  const minuteAngle = (elapsed / 60) * 6;
  const secondAngle = Math.floor(elapsed) * 6;

  const hoursStr = String(hours).padStart(2, "0");
  const minsStr = String(minutes).padStart(2, "0");
  const secsStr = String(seconds).padStart(2, "0");

  const [pos, setPos] = useState<{ x: number; y: number }>(
    position || { x: 0, y: 0 },
  );
  const [isDragging, setIsDragging] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const constrain = useCallback(
    (next: { x: number; y: number }) => {
      const node = root.current;
      const desk = node?.closest(".desk");
      if (!node || !desk) return next;
      const rect = node.getBoundingClientRect();
      const bounds = desk.getBoundingClientRect();
      const inset = 12;
      const scale = Math.max(0.2, sceneScale);
      const originX = rect.left - posRef.current.x * scale;
      const originY = rect.top - posRef.current.y * scale;
      return {
        x: Math.round(
          Math.max(
            (Math.max(0, bounds.left) + inset - originX) / scale,
            Math.min(
              (Math.min(innerWidth, bounds.right) -
                inset -
                rect.width -
                originX) /
                scale,
              next.x,
            ),
          ),
        ),
        y: Math.round(
          Math.max(
            (Math.max(0, bounds.top) + inset - originY) / scale,
            Math.min(
              (Math.min(innerHeight, bounds.bottom) -
                inset -
                rect.height -
                originY) /
                scale,
              next.y,
            ),
          ),
        ),
      };
    },
    [sceneScale],
  );

  useEffect(() => {
    const fit = () => setPos(constrain(position || { x: 0, y: 0 }));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [position?.x, position?.y, constrain, style]);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    hasMoved: boolean;
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (hidden || e.button !== 0) return;
      if ((e.target as HTMLElement).closest(".clock-sound-crown")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: pos.x,
        originY: pos.y,
        hasMoved: false,
      };
      void machineAudio.unlock();
    },
    [hidden, pos.x, pos.y],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d) return;
      const scale = Math.max(0.2, sceneScale || 1);
      const dx = (e.clientX - d.startX) / scale;
      const dy = (e.clientY - d.startY) / scale;
      if (!d.hasMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        d.hasMoved = true;
        setIsDragging(true);
        machineAudio.clockLift();
      }
      if (d.hasMoved) {
        setPos(constrain({ x: d.originX + dx, y: d.originY + dy }));
      }
    },
    [sceneScale, constrain],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      if (d.hasMoved) {
        setIsDragging(false);
        machineAudio.clockPlace();
        const scale = Math.max(0.2, sceneScale || 1);
        const finalPos = constrain({
          x: Math.round(d.originX + (e.clientX - d.startX) / scale),
          y: Math.round(d.originY + (e.clientY - d.startY) / scale),
        });
        setPos(finalPos);
        onMove?.(finalPos);
      } else {
        setIsDragging(false);
      }
    },
    [onMove, sceneScale, constrain],
  );

  const handlePointerCancel = useCallback(() => {
    if (dragRef.current?.hasMoved) {
      setIsDragging(false);
      machineAudio.clockPlace();
    }
    dragRef.current = null;
  }, []);

  return (
    <div
      ref={root}
      role="group"
      tabIndex={hidden ? -1 : 0}
      className={`desk-clock clock-style-${style} ${isDragging ? "is-dragging" : ""}`}
      style={
        {
          "--hour-angle": `${hourAngle}deg`,
          "--minute-angle": `${minuteAngle}deg`,
          "--second-angle": `${secondAngle}deg`,
          "--clock-drag-x": `${pos.x}px`,
          "--clock-drag-y": `${pos.y}px`,
          translate: `${pos.x}px ${pos.y}px`,
        } as CSSProperties
      }
      inert={hidden || undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        ) {
          e.preventDefault();
          const step = e.shiftKey ? 40 : 12;
          const next = constrain({
            x:
              pos.x +
              (e.key === "ArrowRight"
                ? step
                : e.key === "ArrowLeft"
                  ? -step
                  : 0),
            y:
              pos.y +
              (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0),
          });
          setPos(next);
          onMove?.(next);
          return;
        }
      }}
      aria-label={`${clockInfo.name}, ${time.toLocaleTimeString()}. Drag or use arrow keys to move across the desk.`}
      aria-roledescription="movable clock"
      title={`${clockInfo.name} (${clockInfo.year}) · Drag to move anywhere on desk`}
    >
      {/* TACTILE ON-CLOCK SOUND TOGGLE CROWN / BUTTON */}
      <button
        type="button"
        aria-pressed={ticking}
        className={`clock-sound-crown crown-${style} ${ticking ? "ticking-active" : "ticking-muted"}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          void machineAudio.unlock();
          machineAudio.clockButton(!ticking);
          onToggleTicking?.();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={
          ticking
            ? `Turn off ticking sound for ${clockInfo.name}`
            : `Turn on ticking sound for ${clockInfo.name}`
        }
        title={
          ticking
            ? `${clockInfo.name}: Ticking ON · Click to mute sound`
            : `${clockInfo.name}: Ticking OFF · Click to hear ticking`
        }
      >
        {style === "digital" ? (
          <span className="clock-sound-readout">
            SOUND {ticking ? "ON" : "OFF"}
          </span>
        ) : (
          <>
            <span className="clock-switch-grip" aria-hidden="true" />
            <span className="clock-switch-mark" aria-hidden="true" />
          </>
        )}
      </button>

      {/* FACE UP CONTENT */}
      <>
        {style === "flip" && (
          <div className="clock-flip-assembly" aria-hidden="true">
            <div className="flip-housing-bezel">
              <div className="flip-unit flip-hours">
                <div className="flip-card-leaf flip-top">
                  <span>{hoursStr}</span>
                </div>
                <div className="flip-card-seam" />
                <div className="flip-card-leaf flip-bottom">
                  <span>{hoursStr}</span>
                </div>
                <i className="flip-hinge-pin left" />
                <i className="flip-hinge-pin right" />
              </div>
              <div className="flip-divider">:</div>
              <div className="flip-unit flip-minutes">
                <div className="flip-card-leaf flip-top">
                  <span>{minsStr}</span>
                </div>
                <div className="flip-card-seam" />
                <div className="flip-card-leaf flip-bottom">
                  <span>{minsStr}</span>
                </div>
                <i className="flip-hinge-pin left" />
                <i className="flip-hinge-pin right" />
              </div>
            </div>
            <span className="flip-seconds">{secsStr}</span>
            <span className="clock-brand flip-brand">CIFRA · DECKLE</span>
          </div>
        )}

        {style === "digital" && (
          <div className="clock-digital-assembly" aria-hidden="true">
            <div className="vfd-bezel">
              <div className="vfd-screen">
                <div className="vfd-readout">
                  <span className="vfd-digits vfd-hours">{hoursStr}</span>
                  <span
                    className={`vfd-colon ${seconds % 2 === 0 ? "tick-flash" : "tick-dim"}`}
                  >
                    :
                  </span>
                  <span className="vfd-digits vfd-minutes">{minsStr}</span>
                </div>
                <div className="vfd-footer">
                  <span className="vfd-tag">24 H</span>
                  <span className="vfd-seconds">{secsStr}</span>
                </div>
              </div>
            </div>
            <span className="clock-brand digital-brand">LUMITRON</span>
          </div>
        )}

        {style === "chronometer" && (
          <span className="clock-dial marine-dial" aria-hidden="true">
            <div className="marine-bezel-knurl" />
            <div className="marine-railroad-track" />
            {["XII", "III", "", "IX"].map((num, i) => (
              <span
                key={num}
                className={`clock-number clock-number-${i} marine-num`}
              >
                {num}
              </span>
            ))}
            <i
              className="clock-hand hour breguet-hand"
              style={{ "--angle": `${hourAngle}deg` } as CSSProperties}
            />
            <i
              className="clock-hand minute breguet-hand"
              style={{ "--angle": `${minuteAngle}deg` } as CSSProperties}
            />
            <i className="clock-pin marine-pin" />
            <div className="marine-subdial">
              <span className="subdial-tick t-top">60</span>
              <span className="subdial-tick t-bot">30</span>
              <i
                className="subdial-hand"
                style={{ "--sub-angle": `${secondAngle}deg` } as CSSProperties}
              />
              <i className="subdial-pin" />
            </div>
            <span className="clock-brand marine-brand">DECKLE · 17 RUBIS</span>
          </span>
        )}

        {style === "bauhaus" && (
          <span className="clock-dial bauhaus-dial" aria-hidden="true">
            <div className="radial-disc-surface" />
            <div className="radial-batons">
              {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(
                (deg, i) => (
                  <i
                    key={deg}
                    className={`radial-baton ${i % 3 === 0 ? "major" : "minor"}`}
                    style={{ "--rot": `${deg}deg` } as CSSProperties}
                  />
                ),
              )}
            </div>
            <i
              className="clock-hand hour needle-hand"
              style={{ "--angle": `${hourAngle}deg` } as CSSProperties}
            />
            <i
              className="clock-hand minute needle-hand"
              style={{ "--angle": `${minuteAngle}deg` } as CSSProperties}
            />
            <i
              className="clock-hand second"
              style={{ "--angle": `${secondAngle}deg` } as CSSProperties}
            />
            <i className="clock-pin bauhaus-pin" />
            <span className="clock-brand bauhaus-brand">JUNGHANS</span>
          </span>
        )}

        {style === "deco" && (
          <span className="clock-dial deco-dial" aria-hidden="true">
            <div className="deco-inner-ring" />
            {[12, 3, 6, 9].map((n, i) => (
              <span
                key={n}
                className={`clock-number clock-number-${i} deco-num`}
              >
                {n}
              </span>
            ))}
            <i
              className="clock-hand hour cathedral-hand"
              style={{ "--angle": `${hourAngle}deg` } as CSSProperties}
            />
            <i
              className="clock-hand minute cathedral-hand"
              style={{ "--angle": `${minuteAngle}deg` } as CSSProperties}
            />
            <i
              className="clock-hand second"
              style={{ "--angle": `${secondAngle}deg` } as CSSProperties}
            />
            <i className="clock-pin deco-crown-pin" />
            <span className="clock-brand deco-brand">TELECHRON</span>
          </span>
        )}

        {style === "studio" && (
          <span className="clock-dial studio-dial" aria-hidden="true">
            {[12, 3, 6, 9].map((n, i) => (
              <span key={n} className={`clock-number clock-number-${i}`}>
                {n}
              </span>
            ))}
            <i
              className="clock-hand hour"
              style={{ "--angle": `${hourAngle}deg` } as CSSProperties}
            />
            <i
              className="clock-hand minute"
              style={{ "--angle": `${minuteAngle}deg` } as CSSProperties}
            />
            <i
              className="clock-hand second"
              style={{ "--angle": `${secondAngle}deg` } as CSSProperties}
            />
            <i className="clock-pin" />
            <span className="clock-brand">DECKLE</span>
          </span>
        )}
      </>
    </div>
  );
}
