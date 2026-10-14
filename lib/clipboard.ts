import { documentLines, type Document, type Mark } from "./writing";
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
function styled(text: string, mark: Mark, doc: Document) {
  let html = escape(text);
  if (mark.code) html = `<code>${html}</code>`;
  if (mark.crossed) html = `<s>${html}</s>`;
  if (mark.strike === "double") html = `<strong>${html}</strong>`;
  if ((mark.element ?? doc.paper?.element) === "italic")
    html = `<em>${html}</em>`;
  if (mark.underline) html = `<u>${html}</u>`;
  const color =
    mark.ribbon === "red"
      ? "#b23a2c"
      : doc.paper?.ribbon === "blue"
        ? "#203c59"
        : doc.paper?.ribbon === "sepia"
          ? "#69462e"
          : undefined;
  if (color) html = `<span style="color:${color}">${html}</span>`;
  return html;
}
export function paperClipboard(doc: Document): { html: string; text: string } {
  const plain: string[] = [],
    blocks: string[] = [];
  if (doc.title?.trim()) {
    plain.push(doc.title.trim(), "");
    blocks.push(`<h1>${escape(doc.title.trim())}</h1>`);
  }
  for (const line of documentLines(doc)) {
    if (line.block === "dinkus") {
      plain.push("***");
      blocks.push("<p>✦ ✦ ✦</p>");
      continue;
    }
    const marks = line.marks.slice(line.prefix);
    plain.push(marks.map((m) => m.overprints?.at(-1) ?? m.text).join(""));
    let html = "",
      run = "",
      last: Mark | undefined,
      signature = "";
    const flush = () => {
      if (last && run) html += styled(run, last, doc);
      run = "";
    };
    for (const mark of marks) {
      const key = JSON.stringify([
        mark.crossed,
        mark.strike,
        mark.element,
        mark.underline,
        mark.ribbon,
        mark.code,
      ]);
      if (key !== signature) {
        flush();
        signature = key;
        last = mark;
      }
      run += mark.overprints?.at(-1) ?? mark.text;
    }
    flush();
    const tag = line.block === "h1" ? "h1" : line.block === "h2" ? "h2" : "p";
    const block = `<${tag} style="white-space:pre-wrap;margin:0">${html || "<br>"}</${tag}>`;
    blocks.push(
      marks.some((m) => m.clipId) ? `<blockquote>${block}</blockquote>` : block,
    );
  }
  return { text: plain.join("\n"), html: `<div>${blocks.join("")}</div>` };
}
export async function copyPaper(doc: Document): Promise<"formatted" | "plain"> {
  const content = paperClipboard(doc);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    // Construct synchronously inside the click so WebKit retains the user gesture.
    const item = new ClipboardItem({
      "text/html": new Blob([content.html], { type: "text/html" }),
      "text/plain": new Blob([content.text], { type: "text/plain" }),
    });
    try {
      await navigator.clipboard.write([item]);
      return "formatted";
    } catch {
      /* Some browsers accept plain text but reject rich clipboard items. */
    }
  }
  if (!navigator.clipboard?.writeText)
    throw new Error(
      "Clipboard access is unavailable. Use your browser's copy command.",
    );
  await navigator.clipboard.writeText(content.text);
  return "plain";
}

// ---- Cut, copy and paste on the paper ---------------------------------------
// What you copy from your own paper stays yours when it comes back; what
// arrives from anywhere else is foreign material, taped in as a clipping
// unless it is a short fragment or you ask for it to be typed in.

/** Private clipboard type carrying provenance alongside the plain text. */
export const DECKLE_CLIPBOARD = "application/x-deckle-text";
/** Pasted text up to this length, on one line, is typed in by default. */
export const SHORT_PASTE = 48;

export type ClipboardPayload = {
  v: 1;
  /** "paper": your own writing (including its clippings); "source": research
   * text from the copy holder, which is someone else's. */
  from: "paper" | "source";
  text: string;
  /** Character ranges of `text` that were clippings on the paper. */
  clips: [number, number][];
};
export type PasteRun = { text: string; as: "typed" | "clipping" };
export type PastePlan = {
  runs: PasteRun[];
  /** Text from outside your own writing: the paste tag offers the other form. */
  external: boolean;
};

// Keep ZWNJ/ZWJ: Persian needs them inside words.
const INVISIBLE = /[​⁠﻿]/g;
export function normalizePaste(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE, "")
    .replace(/[   ]/g, " ")
    .replace(/\t/g, "    ")
    .replace(/[ ]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}

/** The selection as it should travel: plain text plus which parts were quotes. */
export function selectionPayload(
  marks: Mark[],
  from: number,
  to: number,
  source: ClipboardPayload["from"] = "paper",
): ClipboardPayload {
  let offset = 0,
    text = "";
  const clips: [number, number][] = [];
  for (const mark of marks) {
    const glyph = mark.overprints?.at(-1) ?? mark.text;
    const start = offset,
      end = offset + glyph.length;
    offset = end;
    if (end <= from || start >= to) continue;
    const at = text.length;
    text += glyph.slice(Math.max(0, from - start), to - start);
    if (mark.clipId && glyph !== "\n") {
      const last = clips.at(-1);
      if (last && last[1] === at) last[1] = text.length;
      else clips.push([at, text.length]);
    }
  }
  return { v: 1, from: source, text, clips };
}

export function readPayload(data: DataTransfer | null) {
  try {
    const raw = data?.getData(DECKLE_CLIPBOARD);
    const value = raw ? JSON.parse(raw) : null;
    return value?.v === 1 && typeof value.text === "string"
      ? (value as ClipboardPayload)
      : null;
  } catch {
    return null;
  }
}

/**
 * Decide how pasted text lands. `typedRequest` is ⌘⇧V (paste as your own
 * typing); `payload` is Deckle's provenance, when the text came from here.
 */
export function planPaste(
  raw: string,
  payload: ClipboardPayload | null,
  typedRequest = false,
): PastePlan {
  // Your own writing comes back exactly as it left: typed text as typing,
  // quotes as quotes. The payload only counts if the text is still the same.
  raw = raw.replace(/\r\n?/g, "\n");
  if (payload?.from === "paper" && payload.text === raw) {
    const runs: PasteRun[] = [];
    let at = 0;
    for (const [start, end] of payload.clips) {
      if (start > at) runs.push({ text: raw.slice(at, start), as: "typed" });
      const quote = normalizePaste(raw.slice(start, end));
      if (quote) runs.push({ text: quote, as: "clipping" });
      at = end;
    }
    if (at < raw.length) runs.push({ text: raw.slice(at), as: "typed" });
    return { runs: runs.filter((run) => run.text), external: false };
  }
  const text = normalizePaste(raw);
  if (!text) return { runs: [], external: true };
  const short = !text.includes("\n") && Array.from(text).length <= SHORT_PASTE;
  // Research from the copy holder is always a quote unless you ask otherwise.
  const typed = typedRequest || (payload?.from !== "source" && short);
  return { runs: [{ text, as: typed ? "typed" : "clipping" }], external: true };
}

// Some browsers drop private clipboard types; remember the last copy here so
// a paste of exactly the same text still knows where it came from.
let remembered: ClipboardPayload | null = null;
export function rememberCopy(payload: ClipboardPayload) {
  remembered = payload;
}
/** What this page last cut or copied, whatever the clipboard holds now. */
export function lastCopy() {
  return remembered;
}
export function rememberedCopy(text: string) {
  return remembered && remembered.text === text.replace(/\r\n?/g, "\n")
    ? remembered
    : null;
}
