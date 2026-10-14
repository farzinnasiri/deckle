import {
  editDocument,
  editorMarks,
  markOffsets,
  indexAtOffset,
  editingText,
  type EditRange,
  type TextSelection,
} from "./editor-model";
import type { TypewriterId } from "./typewriters";
import type { ClockStyleId } from "./clocks";
import { settleActivity, type DailyActivity } from "./activity";
import type { LayoutPreset, MachineControl } from "./desk-layout";
export type Mode = "draft" | "ink";
export type Element = "mono" | "italic" | "book";
export type Block = "body" | "h1" | "h2" | "dinkus";
export type MarkStyle = {
  strike?: "single" | "double";
  element?: Element;
  underline?: boolean;
  ribbon?: "black" | "red";
  /** Struck through with a line of x's, still readable. */
  crossed?: boolean;
  /** Code: typed on a slate ribbon over a faint grey ground. */
  code?: boolean;
};
export const paperRulings = {
  blank: "Blank",
  narrow: "Narrow ruled",
  wide: "Wide ruled",
  margin: "Margin ruled",
  graph: "Graph",
  dots: "Dot grid",
} as const;
export type PaperRuling = keyof typeof paperRulings;
export function paperRuling(paper?: PaperOptions): PaperRuling {
  return paper?.ruling ?? (paper?.stock === "ledger" ? "narrow" : "blank");
}
export type PaperOptions = {
  ruling?: PaperRuling;
  stock: "bond" | "white" | "onionskin" | "kraft" | "ledger" | "recycled";
  element: Element;
  initials: boolean;
  ribbon: "black" | "blue" | "sepia" | "bichrome";
};
export type Stamp = { name: string; seed: number; at: number };
export type Owner = { name: string; seed: number; enrolled: boolean };
export const defaultPaper: PaperOptions = {
  stock: "bond",
  element: "mono",
  initials: false,
  ribbon: "black",
};
export type Action =
  | "type"
  | "backspace"
  | "strike-word"
  | "paste"
  | "seam"
  | "delete"
  | "restore"
  | "style"
  | "block"
  | "title"
  | "paper"
  | "stamp";
export type KeyEvent = {
  range?: EditRange;
  selection?: TextSelection;
  snapshot?: Document;
  style?: MarkStyle;
  block?: Block;
  paper?: Partial<PaperOptions>;
  stamp?: Stamp;
  version: 1 | 2;
  id: string;
  at: number;
  action: Action;
  key: string;
  seed: number;
  density: number;
  mode: Mode;
  /** Edits that were not keystrokes: cutting, moving your own words, pasting
   * from outside, or the machine typing a pasted fragment in for you. */
  origin?: "cut" | "move" | "paste" | "retype";
};
export type Mark = MarkStyle & {
  block?: Block;
  id: string;
  text: string;
  kind: "glyph" | "clipping" | "seam";
  seed: number;
  density: number;
  mode: Mode;
  crossed?: boolean;
  clipId?: string;
  overprints?: string[];
};
export type Document = {
  title?: string;
  typingStyle?: MarkStyle;
  pendingBlock?: Block;
  paper?: PaperOptions;
  stamp?: Stamp;
  marks: Mark[];
  cursor: number;
  selection?: TextSelection;
};
/** An earlier copy holder format: separate pasted sheets. Read into `notes`. */
export type Source = {
  id: string;
  text: string;
  added: number;
  /** The visual line the line guide rests on. */
  line?: number;
};
export type Piece = {
  version: 1 | 2;
  id: string;
  created: number;
  torn: number | null;
  discardedAt: number | null;
  continuedFrom: number[];
  events: KeyEvent[];
  document: Document;
  searchText?: string;
  words?: string[];
  eventsLoaded?: boolean;
  /** The copy holder's notes for this paper: research and jottings to write
   * from. Copied onto the paper they arrive as clippings, not as your typing. */
  notes?: string;
  /** Sheets from the earlier copy holder; read through `pieceNotes`. */
  sources?: Source[];
};
export function pieceNotes(piece: Piece) {
  return piece.notes ?? (piece.sources ?? []).map((s) => s.text).join("\n\n");
}

export type Settings = {
  volume: number;
  muted?: boolean;
  bell: boolean;
  room: "study" | "library" | "attic";
  light: "auto" | "day" | "lamp" | "mixed" | "office";
  desk?:
    | "walnut"
    | "oak"
    | "leather"
    | "linen"
    | "slate"
    | "cherry"
    | "maple"
    | "rosewood";
  paper?: PaperOptions;
  clock?: boolean;
  clockChosen?: boolean;
  ticking?: boolean;
  ownerCard?: boolean;
  face: "mono" | "book";
  reduceMotion: boolean;
  largeType: boolean;
  typeSize?: 1 | 2 | 3 | 4;
  immersive?: boolean;
  model?: TypewriterId;
  variations?: { finish?: string; knob?: string; accent?: string };
  clockStyle?: ClockStyleId;
  roomLight?: boolean;
  roomLightPreset?: "auto" | "day" | "study" | "office";
  deskLightIntensity?: number;
  deskLightSpread?: number;
  deskLightReach?: number;
  /** Legacy selector, migrated to independent lamps on load. */
  deskLightSource?: "overhead" | "rail";
  deskLightTone?: "tungsten" | "amber" | "halogen";
  deskLightColor?: string;
  railLightIntensity?: number;
  railLightSpread?: number;
  railLightReach?: number;
  railLightTone?: "tungsten" | "amber" | "halogen";
  railLightColor?: string;
  clockPosition?: { x: number; y: number };
  layoutPreset?: LayoutPreset;
  visibleControls?: MachineControl[];
};
export type Store = {
  owner?: Owner;
  /** Only new desks offer optional setup; older saved desks keep opening normally. */
  setupPending?: boolean;
  version: 1 | 2;
  mode?: Mode;
  tearProgress?: number;
  active: Piece;
  pieces: Piece[];
  settings: Settings;
  uncovered: boolean;
  day: string;
  linesToday: number;
  activity?: DailyActivity;
};
export const defaultSettings: Settings = {
  volume: 0.35,
  muted: false,
  desk: "cherry",
  paper: { ...defaultPaper },
  clock: true,
  clockStyle: "studio",
  ownerCard: false,
  ticking: false,
  bell: true,
  room: "study",
  light: "lamp",
  roomLight: false,
  roomLightPreset: "auto",
  deskLightIntensity: 0.65,
  deskLightSpread: 0.5,
  deskLightReach: 0.5,
  deskLightTone: "tungsten",
  railLightIntensity: 0.35,
  railLightSpread: 0.65,
  railLightReach: 0.55,
  railLightTone: "tungsten",
  face: "mono",
  reduceMotion: false,
  largeType: false,
  model: "d01",
  variations: { finish: "standard", knob: "knurled", accent: "vermilion" },
};
export const COLUMNS = 60;
export function localDay(at = Date.now()) {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
export function newPiece(paper: PaperOptions = defaultPaper): Piece {
  return {
    version: 2,
    id: crypto.randomUUID(),
    created: Date.now(),
    torn: null,
    discardedAt: null,
    continuedFrom: [],
    events: [{ ...makeEvent("paper", "", "draft"), paper: { ...paper } }],
    document: { marks: [], cursor: 0, paper: { ...paper } },
  };
}
export function newStore(): Store {
  return {
    version: 2,
    setupPending: true,
    active: newPiece(),
    pieces: [],
    settings: { ...defaultSettings, roomLight: true },
    uncovered: true,
    owner: {
      name: "",
      seed: crypto.getRandomValues(new Uint32Array(1))[0],
      enrolled: true,
    },
    day: localDay(),
    linesToday: 0,
    activity: settleActivity(undefined, localDay()),
  };
}
export function applyEvent(doc: Document, e: KeyEvent): Document {
  if (e.action === "restore" && e.snapshot) return e.snapshot;
  if (e.action === "title") return { ...doc, title: e.key.slice(0, 160) };
  if (e.action === "stamp" && e.stamp)
    return doc.stamp ? doc : { ...doc, stamp: e.stamp };
  if (e.action === "paper")
    return { ...doc, paper: { ...defaultPaper, ...doc.paper, ...e.paper } };
  if (e.action === "style") {
    const style = e.style || {};
    if (!e.range || e.range.from === e.range.to)
      return { ...doc, typingStyle: { ...doc.typingStyle, ...style } };
    const marks = editorMarks(doc),
      offsets = markOffsets(marks);
    return {
      ...doc,
      marks: marks.map((mark, i) => {
        if (
          offsets[i] < e.range!.from ||
          offsets[i] >= e.range!.to ||
          mark.text === "\n"
        )
          return mark;
        const patch = { ...style };
        if (e.mode === "ink") {
          if (mark.strike === "double") patch.strike = "double";
          if (mark.underline) patch.underline = true;
          if (mark.element === "italic") patch.element = "italic";
          if (mark.ribbon === "red") patch.ribbon = "red";
        }
        return { ...mark, ...patch };
      }),
    };
  }
  if (e.action === "block") {
    const marks = editorMarks(doc),
      offsets = markOffsets(marks),
      text = editingText(doc);
    const from =
      e.range?.from ?? doc.selection?.head ?? offsets[doc.cursor] ?? 0;
    const to = e.range?.to ?? from;
    const start = text.lastIndexOf("\n", from - 1) + 1;
    const endLine = text.indexOf("\n", Math.max(from, to - 1));
    const end = endLine < 0 ? text.length : endLine;
    return {
      ...doc,
      pendingBlock: start === text.length ? e.block : undefined,
      marks: marks.map((mark, i) =>
        offsets[i] >= start && offsets[i] <= end
          ? { ...mark, block: e.block }
          : mark,
      ),
    };
  }
  if (e.range) return editDocument(doc, e);
  const marks = [...doc.marks];
  let cursor = doc.cursor;
  if (e.action === "backspace") {
    if (!cursor) return doc;
    cursor--;
    if (e.mode === "draft") marks.splice(cursor, 1);
  } else if (e.action === "strike-word") {
    while (cursor > 0 && /^\s$/.test(marks[cursor - 1].text)) cursor--;
    const end = cursor;
    while (
      cursor > 0 &&
      marks[cursor - 1].kind === "glyph" &&
      !/\s/.test(marks[cursor - 1].text)
    )
      cursor--;
    if (e.mode === "ink") {
      for (let i = cursor; i < end; i++)
        marks[i] = { ...marks[i], crossed: true };
      cursor = end;
    } else marks.splice(cursor, doc.cursor - cursor);
  } else if (e.action === "type") {
    for (const [offset, text] of Array.from(e.key).entries()) {
      if (
        e.mode === "ink" &&
        cursor < marks.length &&
        text !== "\n" &&
        marks[cursor].kind === "glyph" &&
        marks[cursor].text !== "\n"
      ) {
        marks[cursor] = {
          ...marks[cursor],
          overprints: [...(marks[cursor].overprints || []), text],
        };
      } else {
        marks.splice(cursor, 0, {
          id: `${e.id}-${offset}`,
          text,
          kind: "glyph",
          seed: (e.seed + offset * 7919) >>> 0,
          density: e.density,
          mode: e.mode,
          ...doc.typingStyle,
          ...(doc.pendingBlock ? { block: doc.pendingBlock } : {}),
        });
      }
      cursor++;
    }
  } else {
    marks.splice(cursor, 0, {
      id: e.id,
      text: e.key,
      kind: e.action === "paste" ? "clipping" : "seam",
      seed: e.seed,
      density: 1,
      mode: e.mode,
    });
    cursor++;
  }
  return {
    ...doc,
    marks,
    cursor,
    pendingBlock: e.key.includes("\n") ? undefined : doc.pendingBlock,
  };
}
export function replay(events: KeyEvent[]): Document {
  return events.reduce(applyEvent, { marks: [], cursor: 0 });
}
export function appendEvent(piece: Piece, event: KeyEvent): Piece {
  return {
    ...piece,
    events: [...piece.events, event],
    document: applyEvent(piece.document, event),
  };
}
export function makeEvent(
  action: Action,
  key: string,
  mode: Mode,
  interval = 200,
): KeyEvent {
  return {
    version: 2,
    id: crypto.randomUUID(),
    at: Date.now(),
    action,
    key,
    seed: crypto.getRandomValues(new Uint32Array(1))[0],
    density: Math.min(1.06, interval < 80 ? 0.89 : 0.96 + interval / 15000),
    mode,
  };
}
export type PlacedMark = { mark: Mark; row: number; col: number; rows: number };
export function layout(doc: Document) {
  let row = 0,
    col = 0;
  const placed: PlacedMark[] = [];
  const positions = [{ row, col }];
  doc.marks.forEach((mark, index) => {
    if (mark.kind !== "glyph") {
      if (col) {
        row++;
        col = 0;
      }
      const rows =
        mark.kind === "seam"
          ? 1
          : mark.text
              .split("\n")
              .reduce(
                (n, line) =>
                  n + Math.max(1, Math.ceil(Array.from(line).length / 52)),
                0,
              ) + 2;
      placed.push({ mark, row, col, rows });
      row += rows;
    } else if (mark.text === "\n") {
      placed.push({ mark, row, col, rows: 1 });
      row++;
      col = 0;
    } else {
      if (col >= COLUMNS) {
        row++;
        col = 0;
      }
      if (
        mark.text !== " " &&
        (index === 0 || /\s/.test(doc.marks[index - 1].text))
      ) {
        let wordLength = 0;
        for (
          let j = index;
          j < doc.marks.length &&
          doc.marks[j].kind === "glyph" &&
          !/\s/.test(doc.marks[j].text);
          j++
        )
          wordLength++;
        if (wordLength <= COLUMNS && col + wordLength > COLUMNS) {
          row++;
          col = 0;
        }
      }
      placed.push({ mark, row, col, rows: 1 });
      col++;
    }
    positions.push({ row, col });
  });
  return {
    placed,
    rows: row + 1,
    head: positions[Math.min(doc.cursor, positions.length - 1)],
  };
}
function plainMarkdown(doc: Document): string {
  let out = "",
    strike = false;
  const closeStrike = () => {
    if (strike) {
      out += "~~";
      strike = false;
    }
  };
  for (let index = 0; index < doc.marks.length; index++) {
    const m = doc.marks[index];
    if (m.clipId) {
      closeStrike();
      let quote = "";
      do {
        const mark = doc.marks[index];
        const text = mark.overprints?.at(-1) ?? mark.text;
        quote += mark.crossed ? `~~${text}~~` : text;
        if (doc.marks[index + 1]?.clipId !== m.clipId) break;
        index++;
      } while (index < doc.marks.length);
      out += `\n${quote
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n`;
      continue;
    }
    if (m.kind === "clipping") {
      closeStrike();
      out += `\n\n${m.text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n\n`;
      continue;
    }
    if (m.kind === "seam") {
      closeStrike();
      out += "\n\n---\n\n";
      continue;
    }
    const crossed = Boolean(m.crossed || m.overprints?.length);
    if (crossed !== strike) {
      out += "~~";
      strike = crossed;
    }
    out += m.text;
    if (m.overprints?.length) {
      closeStrike();
      out += m.overprints.join("");
    }
  }
  closeStrike();
  return out;
}
/** With no title set, the first few words of the writing stand in for one. */
export function autoTitle(doc: Document, words = 6) {
  const line = editingText(doc)
    .split("\n")
    .find((l) => l.trim() && l !== "---")
    ?.replace(/^#{1,2} /, "")
    .trim();
  if (!line) return "";
  const all = line.split(/\s+/);
  const head = all
    .slice(0, words)
    .join(" ")
    .slice(0, 48)
    .replace(/[\s,;:.\-–—]+$/u, "");
  return all.length > words || head.length < line.length ? `${head}…` : head;
}
export function title(piece: Piece) {
  return (
    piece.document.title?.trim() ||
    autoTitle(piece.document) ||
    "Untitled paper"
  );
}
export function cleanStore(store: Store): Store {
  const day = localDay();
  return {
    ...store,
    day,
    linesToday: store.day === day ? store.linesToday : 0,
    activity: settleActivity(store.activity, day),
    pieces: store.pieces.filter(
      (p) => !p.discardedAt || Date.now() - p.discardedAt < 30 * 86400000,
    ),
  };
}
export const WASTEBASKET_CAPACITY = 5;

/** Remove one discarded paper after it passes through the shredder. */
export function shredPaper(store: Store, id: string): Store {
  return {
    ...store,
    pieces: store.pieces.filter((p) => p.id !== id || !p.discardedAt),
  };
}

/** Shreds every discarded paper for good. The active paper and filed papers
 * are never touched. */
export function emptyWastebasket(store: Store) {
  const shredded = store.pieces.filter((p) => p.discardedAt);
  return {
    store: { ...store, pieces: store.pieces.filter((p) => !p.discardedAt) },
    shredded: shredded.map((p) => p.id),
  };
}
export function pauseDuration(previous: number, next: number, speed: number) {
  const gap = Math.max(0, next - previous);
  return (gap > 5000 ? 2000 : gap) / speed;
}

// Lines are derived from stable marks, so edits before a heading cannot orphan it.
export function documentLines(doc: Document) {
  const marks = editorMarks(doc),
    offsets = markOffsets(marks);
  const lines: {
    marks: Mark[];
    from: number;
    to: number;
    block: Block;
    prefix: number;
    initial: boolean;
  }[] = [];
  let start = 0,
    initial = true;
  for (let i = 0; i <= marks.length; i++) {
    if (i < marks.length && marks[i].text !== "\n") continue;
    const row = marks.slice(start, i),
      text = row.map((m) => m.overprints?.at(-1) ?? m.text).join("");
    const auto =
      text.startsWith("### ") || text.startsWith("## ")
        ? "h2"
        : text.startsWith("# ")
          ? "h1"
          : /^\*\s?\*\s?\*$/.test(text)
            ? "dinkus"
            : "body";
    const block =
      row[0]?.block ||
      marks[i]?.block ||
      (start === marks.length ? doc.pendingBlock : undefined) ||
      auto;
    const prefix =
      block === auto && (auto === "h1" || auto === "h2")
        ? text.startsWith("### ")
          ? 4
          : auto === "h1"
            ? 2
            : 3
        : 0;
    const hasInitial =
      !!doc.paper?.initials &&
      initial &&
      block === "body" &&
      !!text.trim() &&
      !row[0]?.clipId;
    lines.push({
      marks: row,
      from: offsets[start],
      to: offsets[i],
      block,
      prefix,
      initial: hasInitial,
    });
    if (text.trim()) initial = block !== "body";
    start = i + 1;
  }
  return lines;
}
function styledMarkdown(marks: Mark[]) {
  let out = "",
    run: Mark[] = [],
    signature = "";
  const flush = () => {
    if (!run.length) return;
    let value = plainMarkdown({ marks: run, cursor: 0 });
    const first = run[0],
      leading = value.match(/^\s*/)?.[0] || "",
      trailing = value.match(/\s*$/)?.[0] || "";
    value = value.trim();
    if (value) {
      if (first.code) value = `\`${value}\``;
      if (first.element === "italic") value = `*${value}*`;
      if (first.strike === "double") value = `**${value}**`;
      if (first.underline) value = `<u>${value}</u>`;
      if (first.ribbon === "red") value = `<mark>${value}</mark>`;
      out += leading + value + trailing;
    } else out += plainMarkdown({ marks: run, cursor: 0 });
    run = [];
  };
  for (const mark of marks) {
    const key = JSON.stringify([
      mark.strike,
      mark.element,
      mark.underline,
      mark.ribbon,
      mark.code,
    ]);
    if (key !== signature) {
      flush();
      signature = key;
    }
    run.push(mark);
  }
  flush();
  return out;
}
export function markdown(doc: Document): string {
  const formatted = doc.marks.some(
    (m) =>
      m.strike || m.element || m.underline || m.ribbon || m.block || m.code,
  );
  // Preserve the byte-for-byte v1 export, including clipping whitespace.
  const body = !formatted
    ? plainMarkdown(doc)
    : documentLines(doc)
        .map((line) => {
          if (line.marks.some((m) => m.kind === "seam")) return "\n---\n";
          if (line.block === "dinkus") return "***";
          const text = styledMarkdown(line.marks.slice(line.prefix));
          return (
            (line.block === "h1" ? "# " : line.block === "h2" ? "## " : "") +
            text
          );
        })
        .join("\n");
  return (doc.title?.trim() ? `# ${doc.title.trim()}\n\n` : "") + body;
}
export function exportMarkdown(piece: Piece) {
  const stamp = piece.document.stamp;
  return (
    (stamp
      ? `---\nauthor: ${JSON.stringify(stamp.name)}\ndate: ${new Date(stamp.at).toISOString()}\n---\n\n`
      : "") + markdown(piece.document)
  );
}
export function writtenRows(doc: Document) {
  const rows = new Set<number>();
  for (const { mark, row, rows: height } of layout(doc).placed) {
    if (mark.kind === "seam" || !mark.text.trim()) continue;
    if (mark.kind === "clipping") {
      let offset = 0;
      for (const line of mark.text.split("\n")) {
        const count = Math.max(1, Math.ceil(Array.from(line).length / 52));
        if (line.trim())
          for (let n = 0; n < count; n++) rows.add(row + offset + n);
        offset += count;
      }
    } else for (let i = 0; i < height; i++) rows.add(row + i);
  }
  return rows.size;
}
export const addedLines = (before: Document, after: Document) =>
  Math.max(0, writtenRows(after) - writtenRows(before));
export function indexPiece(piece: Piece): Piece {
  const searchText =
    `${piece.document.title || ""}\n${editingText(piece.document)}`.toLocaleLowerCase();
  return {
    ...piece,
    searchText,
    words: [...new Set(searchText.match(/[\p{L}\p{N}]+/gu) || [])],
  };
}
export function stampAppearance(seed: number) {
  return {
    angle: (seed % 601) / 100 - 3,
    x: ((seed >>> 8) % 5) - 2,
    y: ((seed >>> 16) % 5) - 2,
    opacity: 0.56 + ((seed >>> 5) % 18) / 100,
    maskX: seed % 90,
  };
}
export function styleClass(mark: Mark) {
  return [
    mark.strike === "double" ? "double-strike" : "",
    mark.element ? `element-${mark.element}` : "",
    mark.underline ? "underscore" : "",
    mark.ribbon === "red" ? "red-ribbon" : "",
    mark.code ? "code-mark" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
