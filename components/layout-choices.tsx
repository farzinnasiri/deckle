"use client";
import {
  LAYOUT_PRESETS,
  MACHINE_CONTROLS,
  toggleControl,
  visibleControls,
} from "@/lib/desk-layout";
import type { Settings } from "@/lib/writing";
export function LayoutChoices({
  settings,
  update,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const visible = visibleControls(settings);
  return (
    <div className="layout-choices">
      <div
        className="layout-presets"
        role="group"
        aria-label="Desk layout presets"
      >
        {LAYOUT_PRESETS.map((p) => (
          <button
            key={p.id}
            aria-pressed={(settings.layoutPreset || "full") === p.id}
            onClick={() =>
              update({ layoutPreset: p.id, visibleControls: undefined })
            }
          >
            <span
              className={`layout-miniature layout-${p.id}`}
              aria-hidden="true"
            >
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <strong>{p.name}</strong>
            <small>{p.description}</small>
          </button>
        ))}
      </div>
      <details className="layout-advanced">
        <summary>Advanced · choose controls</summary>
        <div className="layout-control-choices">
          {MACHINE_CONTROLS.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={visible.includes(c.id)}
                onChange={() => update(toggleControl(settings, c.id))}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
