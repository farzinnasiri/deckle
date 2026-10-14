"use client";

import {
  Focus,
  Minimize2,
  Settings,
  Volume2,
  VolumeX,
  Share2,
  Copy,
} from "lucide-react";
import { visibleControls } from "@/lib/desk-layout";
import type { Settings as DeskSettings } from "@/lib/writing";

export function DeskControls({
  settings,
  disabled,
  onFocus,
  onSettings,
  onShare,
  onCopy,
  update,
}: {
  settings: DeskSettings;
  disabled: boolean;
  onFocus: () => void;
  onSettings: () => void;
  onShare: () => void;
  onCopy: () => void;
  update: (patch: Partial<DeskSettings>) => void;
}) {
  const visible = visibleControls(settings);
  return (
    <div className="desk-controls" inert={disabled || undefined}>
      <div
        className="desk-control-stack"
        role="group"
        aria-label="Desk controls"
      >
        <button
          className="desk-control"
          data-layout-control="share"
          hidden={!visible.includes("share")}
          aria-label="Share this paper"
          onClick={onShare}
        >
          <Share2 size={18} aria-hidden="true" />
          <span>Share this paper</span>
        </button>
        <button
          className="desk-control"
          data-layout-control="copy"
          hidden={!visible.includes("copy")}
          aria-label="Copy formatted paper"
          onClick={onCopy}
        >
          <Copy size={18} aria-hidden="true" />
          <span>Copy this paper</span>
        </button>
        <button
          className="desk-control"
          aria-label="Open settings"
          data-layout-control="settings"
          onClick={onSettings}
        >
          <Settings size={18} aria-hidden="true" />
          <span>Make it yours</span>
        </button>
        <button
          className="desk-control"
          data-layout-control="focus"
          hidden={!visible.includes("focus")}
          aria-label={
            settings.immersive ? "Return to the desk" : "Focus on the paper"
          }
          aria-pressed={!!settings.immersive}
          onClick={onFocus}
        >
          {settings.immersive ? (
            <Minimize2 size={18} aria-hidden="true" />
          ) : (
            <Focus size={18} aria-hidden="true" />
          )}
          <span>
            {settings.immersive ? "Back to the desk" : "Just the page"}
          </span>
        </button>
        <button
          className="desk-control"
          data-layout-control="mute"
          hidden={!visible.includes("mute")}
          aria-label={settings.muted ? "Unmute all sounds" : "Mute all sounds"}
          aria-pressed={!!settings.muted}
          onClick={() => update({ muted: !settings.muted })}
        >
          {settings.muted ? (
            <VolumeX size={18} aria-hidden="true" />
          ) : (
            <Volume2 size={18} aria-hidden="true" />
          )}
          <span>{settings.muted ? "Sound is off" : "Quiet, please"}</span>
        </button>
      </div>
    </div>
  );
}
