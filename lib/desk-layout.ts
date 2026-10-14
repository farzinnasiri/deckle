import type { Settings } from "./writing";
export const MACHINE_CONTROLS = [
  { id: "bold", label: "Bold" },
  { id: "italic", label: "Italic" },
  { id: "ribbon", label: "Ink ribbon" },
  { id: "section", label: "Section" },
  { id: "underline", label: "Underline" },
  { id: "typeface", label: "Typeface" },
  { id: "typeSize", label: "Type size" },
  { id: "ruling", label: "Page lines" },
  { id: "paperCounters", label: "Paper counters" },
  { id: "light", label: "Rail light" },
  { id: "volume", label: "Volume" },
  { id: "feed", label: "Paper feed" },
  { id: "save", label: "Save to archive" },
  { id: "share", label: "Share" },
  { id: "copy", label: "Copy paper" },
  { id: "focus", label: "Focus mode" },
  { id: "mute", label: "Mute" },
] as const;
export type MachineControl = (typeof MACHINE_CONTROLS)[number]["id"];
export type LayoutPreset = "minimal" | "balanced" | "full" | "custom";
export const LAYOUT_PRESETS = [
  {
    id: "minimal",
    name: "Minimal",
    description: "Just writing and the essentials",
    controls: ["light", "feed", "save", "share", "copy", "focus"],
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Everyday writing controls",
    controls: [
      "bold",
      "italic",
      "underline",
      "paperCounters",
      "light",
      "volume",
      "feed",
      "save",
      "share",
      "copy",
      "focus",
      "mute",
    ],
  },
  {
    id: "full",
    name: "Full desk",
    description: "Every mechanical control",
    controls: MACHINE_CONTROLS.map((c) => c.id),
  },
] satisfies {
  id: Exclude<LayoutPreset, "custom">;
  name: string;
  description: string;
  controls: MachineControl[];
}[];
export function visibleControls(
  settings?: Pick<Settings, "layoutPreset" | "visibleControls">,
) {
  const chosen =
    settings?.layoutPreset === "custom"
      ? settings.visibleControls
      : LAYOUT_PRESETS.find((p) => p.id === settings?.layoutPreset)?.controls;
  return MACHINE_CONTROLS.map((c) => c.id).filter(
    (id) => !chosen || chosen.includes(id),
  );
}
export function toggleControl(
  settings: Settings,
  id: MachineControl,
): Partial<Settings> {
  const current = visibleControls(settings);
  return {
    layoutPreset: "custom",
    visibleControls: current.includes(id)
      ? current.filter((c) => c !== id)
      : [...current, id],
  };
}
