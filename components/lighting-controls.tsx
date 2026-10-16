"use client";

import {
  useState,
  useRef,
  useCallback,
  type CSSProperties,
  type KeyboardEvent,
  type WheelEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { machineAudio } from "@/lib/audio";

export type RoomWallSwitchProps = {
  on: boolean;
  onToggle: () => void;
  hidden?: boolean;
};

/**
 * Classic vintage wall toggle switch (tumbler switch on the wall).
 * Authentic Bakelite / antique brass plate with spring toggle lever.
 */
export function RoomWallSwitch({
  on,
  onToggle,
  hidden = false,
}: RoomWallSwitchProps) {
  const handleClick = () => {
    void machineAudio.unlock();
    machineAudio.wallSwitch(!on);
    onToggle();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <button
      type="button"
      className={`wall-toggle-switch ${on ? "switch-on" : "switch-off"}`}
      inert={hidden || undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="switch"
      aria-checked={on}
      aria-label={`Room ambient lighting. Currently ${on ? "on" : "off"}. Flick wall switch to turn ${on ? "off" : "on"}`}
      title={`Room Light (Wall Switch) · ${on ? "ON" : "OFF"} · Click to flick`}
    >
      <div className="switch-plate" aria-hidden="true">
        <span className="plate-screw screw-top" />
        <span className="switch-engraving engrave-on">I</span>
        <div className="switch-housing">
          <span className="housing-bezel" />
          <span className="toggle-bat">
            <i className="bat-tip" />
          </span>
        </div>
        <span className="switch-engraving engrave-off">O</span>
        <span className="plate-screw screw-bottom" />
      </div>
      <span className="switch-caption sr-only">
        {on ? "Room Light ON" : "Room Light OFF"}
      </span>
    </button>
  );
}

export type DeskLampDimmerProps = {
  intensity: number; // 0.0 to 1.0
  onChange: (next: number) => void;
  hidden?: boolean;
};

/**
 * Round rotary dimmer knob on the desk.
 * Vintage knurled brass / Bakelite rotary potentiometer that rotates to change lamp intensity.
 */
export function DeskLampDimmer({
  intensity,
  onChange,
  hidden = false,
}: DeskLampDimmerProps) {
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartIntensity = useRef(intensity);

  // Discrete steps for click advance: 0 -> 0.35 -> 0.70 -> 1.0 -> 0
  const cycleStep = useCallback(() => {
    void machineAudio.unlock();
    let next: number;
    if (intensity < 0.1) {
      next = 0.35;
    } else if (intensity < 0.5) {
      next = 0.7;
    } else if (intensity < 0.85) {
      next = 1.0;
    } else {
      next = 0.0;
    }
    const isZeroTransition =
      (intensity === 0 && next > 0) || (intensity > 0 && next === 0);
    machineAudio.dimmerTick(next, isZeroTransition);
    onChange(next);
  }, [intensity, onChange]);

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    void machineAudio.unlock();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    const next = Math.max(
      0,
      Math.min(1, Math.round((intensity + delta) * 100) / 100),
    );
    if (next !== intensity) {
      const isZeroTransition =
        (intensity === 0 && next > 0) || (intensity > 0 && next === 0);
      machineAudio.dimmerTick(next, isZeroTransition);
      onChange(next);
    }
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    void machineAudio.unlock();
    dragStartY.current = e.clientY;
    dragStartIntensity.current = intensity;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    // Moving pointer up (negative deltaY) increases intensity, moving down decreases
    const deltaY = dragStartY.current - e.clientY;
    const step = deltaY / 120; // 120px drag covers full range
    const raw = dragStartIntensity.current + step;
    const next = Math.max(0, Math.min(1, Math.round(raw * 20) / 20));
    if (next !== intensity) {
      const isZeroTransition =
        (intensity === 0 && next > 0) || (intensity > 0 && next === 0);
      machineAudio.dimmerTick(next, isZeroTransition);
      onChange(next);
    }
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging) {
      setDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      void machineAudio.unlock();
      const next = Math.min(1, Math.round((intensity + 0.1) * 10) / 10);
      machineAudio.dimmerTick(next, intensity === 0);
      onChange(next);
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      void machineAudio.unlock();
      const next = Math.max(0, Math.round((intensity - 0.1) * 10) / 10);
      machineAudio.dimmerTick(next, next === 0);
      onChange(next);
    } else if (e.key === "Home") {
      e.preventDefault();
      void machineAudio.unlock();
      machineAudio.dimmerTick(0, true);
      onChange(0);
    } else if (e.key === "End") {
      e.preventDefault();
      void machineAudio.unlock();
      machineAudio.dimmerTick(1, intensity === 0);
      onChange(1);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      cycleStep();
    }
  };

  // Angle from -135deg (0% off) to +135deg (100% max)
  const angle = Math.round(intensity * 270 - 135);
  const percent = Math.round(intensity * 100);

  return (
    <div
      className={`desk-lamp-dimmer ${intensity > 0 ? "lamp-active" : "lamp-off"} ${dragging ? "is-adjusting" : ""}`}
      style={
        {
          "--dimmer-rot": `${angle}deg`,
          "--dimmer-glow": intensity,
        } as CSSProperties
      }
      inert={hidden || undefined}
      role="slider"
      aria-label="Desk lamp dimmer knob"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}% lamp brightness`}
      tabIndex={0}
      onClick={(e) => {
        // Only trigger click advance if not dragging
        if (!dragging) cycleStep();
      }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      title={`Desk Lamp Dimmer · ${percent}% · Click to step, scroll or drag to rotate`}
    >
      <div className="dimmer-dial-ring" aria-hidden="true">
        <span className="dial-mark mark-0">OFF</span>
        <span className="dial-mark mark-25">·</span>
        <span className="dial-mark mark-50">·</span>
        <span className="dial-mark mark-75">·</span>
        <span className="dial-mark mark-100">MAX</span>
      </div>

      <div className="rotary-knob" aria-hidden="true">
        <div className="knurled-rim" />
        <div className="knob-cap">
          <span className="knob-indicator" />
          <span className="knob-pilot-light" />
        </div>
      </div>

      <span className="dimmer-caption">LAMP · {percent}%</span>
    </div>
  );
}

/** A recessed linear fader shares the machine's key materials and engraving. */
export function RailLightFader({
  intensity,
  onChange,
  disabled = false,
  hidden = false,
}: {
  intensity: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  hidden?: boolean;
}) {
  return (
    <label
      className="rail-light-fader"
      data-layout-control="light"
      hidden={hidden}
      style={{ "--fader-level": intensity } as CSSProperties}
    >
      <span className="engraved">LIGHT</span>
      <span className="fader-bed">
        <span className="fader-scale" aria-hidden="true" />
        <input
          type="range"
          className="light-fader-input"
          aria-label="Rail light brightness"
          aria-orientation="horizontal"
          aria-valuetext={
            intensity === 0 ? "Off" : `${Math.round(intensity * 100)} percent`
          }
          min="0"
          max="1"
          step="0.05"
          value={intensity}
          disabled={disabled}
          onPointerDown={() => void machineAudio.unlock()}
          onChange={(event) => {
            const next = Number(event.target.value);
            machineAudio.dimmerTick(next, next === 0 || intensity === 0);
            onChange(next);
          }}
          onKeyDown={(event) => event.stopPropagation()}
        />
        <span
          className={`fader-pilot ${intensity > 0 ? "on" : ""}`}
          aria-hidden="true"
        />
      </span>
    </label>
  );
}
