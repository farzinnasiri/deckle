import {
  cleanStore,
  defaultSettings,
  defaultPaper,
  paperRulings,
  indexPiece,
  type Store,
  type Piece,
  type Document,
  type KeyEvent,
} from "./writing";
import { desks } from "./materials";
import { validActivity } from "./activity";
import { MACHINE_CONTROLS } from "./desk-layout";

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function validDocument(value: unknown): value is Document {
  if (
    !object(value) ||
    !Array.isArray(value.marks) ||
    !Number.isInteger(value.cursor) ||
    Number(value.cursor) < 0 ||
    Number(value.cursor) > value.marks.length
  )
    return false;
  if (value.title !== undefined && typeof value.title !== "string")
    return false;
  if (
    value.selection !== undefined &&
    (!object(value.selection) ||
      !Number.isInteger(value.selection.anchor) ||
      !Number.isInteger(value.selection.head))
  )
    return false;
  if (
    value.stamp !== undefined &&
    (!object(value.stamp) ||
      typeof value.stamp.name !== "string" ||
      !Number.isFinite(value.stamp.seed) ||
      !Number.isFinite(value.stamp.at))
  )
    return false;
  return value.marks.every(
    (m) =>
      object(m) &&
      typeof m.id === "string" &&
      typeof m.text === "string" &&
      ["glyph", "clipping", "seam"].includes(String(m.kind)) &&
      Number.isFinite(m.seed) &&
      Number.isFinite(m.density) &&
      ["draft", "ink"].includes(String(m.mode)) &&
      (m.overprints === undefined ||
        (Array.isArray(m.overprints) &&
          m.overprints.every((t) => typeof t === "string"))),
  );
}
function validEvent(value: unknown): value is KeyEvent {
  if (
    !object(value) ||
    ![1, 2].includes(Number(value.version)) ||
    typeof value.id !== "string" ||
    typeof value.key !== "string" ||
    !Number.isFinite(value.at) ||
    !Number.isFinite(value.seed) ||
    !Number.isFinite(value.density) ||
    !["draft", "ink"].includes(String(value.mode)) ||
    ![
      "type",
      "backspace",
      "strike-word",
      "paste",
      "seam",
      "delete",
      "restore",
      "style",
      "block",
      "title",
      "paper",
      "stamp",
    ].includes(String(value.action))
  )
    return false;
  if (value.action === "restore" && !validDocument(value.snapshot))
    return false;
  if (
    value.range !== undefined &&
    (!object(value.range) ||
      !Number.isInteger(value.range.from) ||
      !Number.isInteger(value.range.to) ||
      Number(value.range.from) < 0 ||
      Number(value.range.to) < Number(value.range.from))
  )
    return false;
  return true;
}
function validPiece(value: unknown): value is Piece {
  return (
    object(value) &&
    [1, 2].includes(Number(value.version)) &&
    typeof value.id === "string" &&
    !!value.id &&
    Number.isFinite(value.created) &&
    (value.torn === null || Number.isFinite(value.torn)) &&
    (value.discardedAt === null || Number.isFinite(value.discardedAt)) &&
    Array.isArray(value.continuedFrom) &&
    value.continuedFrom.every(Number.isFinite) &&
    validDocument(value.document) &&
    Array.isArray(value.events) &&
    value.events.every(validEvent) &&
    (value.notes === undefined || typeof value.notes === "string") &&
    (value.sources === undefined ||
      (Array.isArray(value.sources) &&
        value.sources.every(
          (source) =>
            object(source) &&
            typeof source.id === "string" &&
            typeof source.text === "string" &&
            Number.isFinite(source.added) &&
            (source.line === undefined || Number.isInteger(source.line)),
        )))
  );
}
export function migrateStore(value: unknown): Store {
  if (
    !object(value) ||
    ![1, 2].includes(Number(value.version)) ||
    !validPiece(value.active) ||
    !Array.isArray(value.pieces) ||
    !value.pieces.every(validPiece) ||
    !object(value.settings) ||
    (value.setupPending !== undefined &&
      typeof value.setupPending !== "boolean") ||
    typeof value.uncovered !== "boolean" ||
    typeof value.day !== "string" ||
    !Number.isFinite(value.linesToday)
  )
    throw new Error(
      "This is not a supported Deckle archive. No papers were changed.",
    );
  const ids = [value.active.id, ...value.pieces.map((p) => p.id)];
  if (new Set(ids).size !== ids.length)
    throw new Error(
      "This archive has duplicate paper IDs. No papers were changed.",
    );
  const old = value as unknown as Store;
  if (old.activity !== undefined && !validActivity(old.activity))
    throw new Error("This archive contains unsupported activity data.");
  const settings = {
    ...defaultSettings,
    ...old.settings,
    desk: old.settings.desk ?? defaultSettings.desk,
    // Desks saved while the clock defaulted to off keep it off only if the
    // owner switched it themselves.
    clock: old.settings.clockChosen ? old.settings.clock !== false : true,
    paper: {
      ...defaultPaper,
      element: old.settings.face || "mono",
      ...old.settings.paper,
    },
  };
  if (
    settings.typeSize !== undefined &&
    ![1, 2, 3, 4].includes(settings.typeSize)
  )
    throw new Error("This archive contains an unsupported type size.");
  if (
    (settings.layoutPreset !== undefined &&
      !["minimal", "balanced", "full", "custom"].includes(
        settings.layoutPreset,
      )) ||
    (settings.visibleControls !== undefined &&
      (!Array.isArray(settings.visibleControls) ||
        !settings.visibleControls.every((id) =>
          MACHINE_CONTROLS.some((c) => c.id === id),
        )))
  )
    throw new Error("This archive contains unsupported layout settings.");
  // Preserve a desk saved with the earlier one-lamp selector.
  if (settings.deskLightSource === "rail") {
    settings.railLightIntensity =
      old.settings.railLightIntensity ?? settings.deskLightIntensity;
    settings.railLightSpread =
      old.settings.railLightSpread ?? settings.deskLightSpread;
    settings.railLightReach =
      old.settings.railLightReach ?? settings.deskLightReach;
    settings.railLightTone =
      old.settings.railLightTone ?? settings.deskLightTone;
    settings.deskLightIntensity = 0;
  }
  delete settings.deskLightSource;
  const lampLevels = [
    settings.deskLightIntensity,
    settings.deskLightSpread,
    settings.deskLightReach,
    settings.railLightIntensity,
    settings.railLightSpread,
    settings.railLightReach,
  ];
  const lampColours = [settings.deskLightColor, settings.railLightColor];
  if (
    lampLevels.some(
      (value) =>
        value !== undefined &&
        (!Number.isFinite(value) || value < 0 || value > 1),
    ) ||
    lampColours.some(
      (value) =>
        value !== undefined &&
        (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)),
    )
  )
    throw new Error("This archive contains unsupported lamp settings.");
  if (
    !["bond", "white", "onionskin", "kraft", "ledger", "recycled"].includes(
      settings.paper.stock,
    ) ||
    (settings.paper.ruling !== undefined &&
      !Object.hasOwn(paperRulings, settings.paper.ruling)) ||
    !["mono", "book", "italic"].includes(settings.paper.element) ||
    !["black", "blue", "sepia", "bichrome"].includes(settings.paper.ribbon) ||
    !["auto", "day", "lamp", "mixed", "office"].includes(settings.light) ||
    !Object.hasOwn(desks, settings.desk || "cherry") ||
    typeof settings.volume !== "number" ||
    settings.volume < 0 ||
    settings.volume > 1
  )
    throw new Error("This archive contains unsupported settings.");
  for (const p of [old.active, ...old.pieces]) {
    const paper = p.document.paper;
    if (
      paper &&
      (!["bond", "white", "onionskin", "kraft", "ledger", "recycled"].includes(
        paper.stock,
      ) ||
        (paper.ruling !== undefined &&
          !Object.hasOwn(paperRulings, paper.ruling)) ||
        !["mono", "book", "italic"].includes(paper.element) ||
        !["black", "blue", "sepia", "bichrome"].includes(paper.ribbon))
    )
      throw new Error("This archive contains an unsupported paper.");
  }
  return {
    ...old,
    version: 2,
    settings,
    owner:
      old.owner &&
      typeof old.owner.name === "string" &&
      Number.isFinite(old.owner.seed)
        ? old.owner
        : { name: "", seed: 1971, enrolled: old.uncovered },
    active: { ...old.active, version: 2 },
    pieces: old.pieces.map(indexPiece),
  };
}
export function mergeArchive(
  current: Store,
  incoming: Store,
): { store: Store; imported: number; skipped: number } {
  const existing = new Set([
    current.active.id,
    ...current.pieces.map((p) => p.id),
  ]);
  const additions = [incoming.active, ...incoming.pieces].filter(
    (p) => p.document.marks.length || p.document.title,
  );
  const added = additions
    .filter((p) => !existing.has(p.id))
    .map((p) => indexPiece({ ...p, torn: p.torn || p.created }));
  return {
    store: {
      ...current,
      pieces: [...added, ...current.pieces].sort(
        (a, b) => (b.torn || b.created) - (a.torn || a.created),
      ),
    },
    imported: added.length,
    skipped: additions.length - added.length,
  };
}
