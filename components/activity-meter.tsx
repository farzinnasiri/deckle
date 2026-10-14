"use client";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { RetroCounter } from "./retro-counter";
import { machineAudio } from "@/lib/audio";
import {
  DAILY_CHARGE,
  INACTIVE_DRAIN,
  type DailyActivity,
} from "@/lib/activity";
export function ActivityMeter({
  activity,
  lines,
  hidden,
  reducedMotion = false,
  retired = false,
  guidedOpen,
  onOpenChange,
}: {
  activity: DailyActivity;
  lines: number;
  hidden: boolean;
  reducedMotion?: boolean;
  retired?: boolean;
  guidedOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = guidedOpen ?? localOpen;
  const [keyboard, setKeyboard] = useState(false);
  // Each opening replays the cells and drums, so the plate always "reads" the
  // day afresh instead of showing figures that were already there.
  const [reading, setReading] = useState(0);
  const hintId = useId();
  const root = useRef<HTMLDivElement>(null);
  const cells = Math.ceil(activity.charge / 20);
  function toggle(next: boolean) {
    if (guidedOpen === undefined) setLocalOpen(next);
    onOpenChange?.(next);
    if (next) setReading((n) => n + 1);
    void machineAudio.unlock().then(() => {
      if (next) {
        machineAudio.meterOpen();
        machineAudio.meterCharge(cells);
        machineAudio.counterRoll(6);
      } else machineAudio.meterClose();
    });
  }
  useEffect(() => {
    if (hidden || retired) {
      setLocalOpen(false);
      return;
    }
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (guidedOpen !== undefined) return;
      if (!root.current?.contains(e.target as Node)) toggle(false);
    };
    document.addEventListener("pointerdown", close);
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setKeyboard(true);
        toggle(false);
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open, hidden, retired, guidedOpen]);
  return (
    <div
      ref={root}
      className={`activity-meter ${open ? "is-open" : ""} ${reducedMotion ? "is-reduced" : ""} ${keyboard ? "is-keyboard" : ""} ${retired ? "is-retired" : ""}`}
      hidden={hidden}
      inert={retired || undefined}
    >
      <button
        className="energy-toggle"
        aria-expanded={open}
        aria-controls="daily-writing-counters"
        aria-label={`Battery ${activity.charge} percent. ${open ? "Hide" : "Show"} today's writing`}
        aria-describedby={hintId}
        onClick={(e) => {
          setKeyboard(e.detail === 0);
          toggle(!open);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setKeyboard(true);
            toggle(false);
          }
        }}
      >
        <span
          className="activity-battery"
          role="img"
          aria-label={`${activity.charge}% charge`}
        >
          <span className="energy-cells" aria-hidden="true">
            {Array.from({ length: 5 }, (_, cell) => (
              <span
                key={`${cell}-${reading}`}
                style={{ "--cell": cell } as CSSProperties}
              >
                <i
                  style={{
                    opacity: Math.max(
                      0,
                      Math.min(1, (activity.charge - cell * 20) / 20),
                    ),
                  }}
                />
              </span>
            ))}
          </span>
          <span className="energy-caption" aria-hidden="true">
            BATTERY
          </span>
          <span className="energy-screw screw-left" aria-hidden="true" />
          <span className="energy-screw screw-right" aria-hidden="true" />
        </span>
      </button>
      <div id={hintId} className="battery-help" role="tooltip">
        <span>Writing day: +{DAILY_CHARGE}% charge.</span>
        <span>Inactive day: −{INACTIVE_DRAIN}% charge.</span>
      </div>
      <div className="activity-drawer" aria-hidden={!open} inert={!open}>
        <div id="daily-writing-counters" className="activity-face">
          <div>
            <span>LINES</span>
            <RetroCounter
              key={`lines-${reading}`}
              value={lines}
              label="lines written today"
            />
          </div>
          <div>
            <span>CHARS</span>
            <RetroCounter
              key={`chars-${reading}`}
              value={activity.characters}
              digits={6}
              label="characters written today"
            />
          </div>
          <p className="activity-legend" aria-hidden="true">
            +{DAILY_CHARGE}% WRITING DAY · −{INACTIVE_DRAIN}% IDLE
          </p>
        </div>
      </div>
    </div>
  );
}
