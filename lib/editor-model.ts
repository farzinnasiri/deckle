import type { Document, KeyEvent, Mark } from "./writing";

export type TextSelection = { anchor: number; head: number };
export type EditRange = { from: number; to: number };
const glyphText = (mark: Mark) => mark.overprints?.at(-1) ?? mark.text;

// Expand legacy clipping blocks for editing without changing saved v1 pieces.
// Each character keeps its provenance, so editing a quote doesn't turn it into typing.
export function editorMarks(doc: Document): Mark[] {
  return doc.marks.flatMap((mark) => {
    if (mark.kind === "seam") return [{ ...mark, text: "\n" }];
    if (mark.kind !== "clipping") return [mark];
    const base = { ...mark, kind: "glyph" as const, overprints: undefined };
    return [
      { ...base, id: `${mark.id}/before`, text: "\n" },
      ...Array.from(mark.text).map((text, i) => ({
        ...base,
        id: `${mark.id}/${i}`,
        text,
        clipId: mark.id,
      })),
      { ...base, id: `${mark.id}/after`, text: "\n" },
    ];
  });
}
export function editingText(doc: Document) {
  return editorMarks(doc).map(glyphText).join("");
}
export function markOffsets(marks: Mark[]) {
  const offsets = [0];
  for (const mark of marks)
    offsets.push(offsets.at(-1)! + glyphText(mark).length);
  return offsets;
}
export function indexAtOffset(marks: Mark[], offset: number) {
  const offsets = markOffsets(marks);
  const index = offsets.findIndex((value) => value >= offset);
  return index < 0 ? marks.length : index;
}
export function caretOffset(doc: Document) {
  if (doc.selection) return doc.selection.head;
  // Old cursors are token indexes. Translate before expanding legacy clippings.
  return editingText({ marks: doc.marks.slice(0, doc.cursor), cursor: 0 })
    .length;
}
export function editDocument(doc: Document, event: KeyEvent): Document {
  const marks = [...editorMarks(doc)];
  const text = marks.map(glyphText).join("");
  const from = Math.max(0, Math.min(text.length, event.range!.from));
  const to = Math.max(from, Math.min(text.length, event.range!.to));
  let start = indexAtOffset(marks, from),
    end = indexAtOffset(marks, to);
  const selected =
    !!event.selection && event.selection.anchor !== event.selection.head;
  const previous = marks[start - 1],
    next = marks[start];
  const clip = next?.clipId || previous?.clipId;
  const inheritedClip =
    clip && marks.slice(start, end).every((mark) => mark.clipId === clip)
      ? clip
      : undefined;
  if (event.mode === "ink" && event.action === "backspace" && !selected) {
    const offset = markOffsets(marks)[start];
    return {
      ...doc,
      marks,
      cursor: start,
      selection: { anchor: offset, head: offset },
    };
  }
  if (
    event.mode === "ink" &&
    (selected || to > from || event.action === "strike-word")
  ) {
    for (let i = start; i < end; i++) {
      if (marks[i].text !== "\n") marks[i] = { ...marks[i], crossed: true };
    }
    // Crossing out leaves the head after the word, ready to keep going.
    if (event.key || event.action === "strike-word") start = end;
  } else marks.splice(start, end - start);

  let inserted: Mark[] = [];
  if (event.key) {
    if (event.action === "paste") {
      const clipId = event.id;
      const make = (text: string, i: number, clipped = false): Mark => ({
        id: `${event.id}-${i}`,
        text,
        kind: "glyph",
        seed: (event.seed + i * 7919) >>> 0,
        density: event.density,
        mode: event.mode,
        ...doc.typingStyle,
        ...(doc.pendingBlock ? { block: doc.pendingBlock } : {}),
        ...(clipped ? { clipId } : {}),
      });
      if (start > 0 && marks[start - 1].text !== "\n")
        inserted.push(make("\n", -1));
      inserted.push(
        ...Array.from(event.key).map((char, i) => make(char, i, true)),
      );
      if (event.key.at(-1) !== "\n")
        inserted.push(make("\n", event.key.length + 1));
    } else {
      inserted = Array.from(event.key).map((char, i) => ({
        id: `${event.id}-${i}`,
        text: char,
        kind: "glyph",
        seed: (event.seed + i * 7919) >>> 0,
        density: event.density,
        mode: event.mode,
        ...doc.typingStyle,
        ...(doc.pendingBlock ? { block: doc.pendingBlock } : {}),
        ...(inheritedClip ? { clipId: inheritedClip } : {}),
      }));
    }
  }
  if (
    event.mode === "ink" &&
    !selected &&
    from === to &&
    event.action === "type"
  ) {
    for (const mark of inserted) {
      const existing = marks[start];
      if (
        existing?.kind === "glyph" &&
        existing.text !== "\n" &&
        mark.text !== "\n"
      )
        marks[start] = {
          ...existing,
          overprints: [...(existing.overprints || []), mark.text],
        };
      else marks.splice(start, 0, mark);
      start++;
    }
  } else {
    marks.splice(start, 0, ...inserted);
    start += inserted.length;
  }
  const offset = markOffsets(marks)[start];
  return {
    ...doc,
    marks,
    cursor: start,
    selection: { anchor: offset, head: offset },
    pendingBlock: event.key.includes("\n") ? undefined : doc.pendingBlock,
  };
}

// The reading strip keeps clipping blocks, while the editor works with their characters.
export function readingDocument(doc: Document): Document {
  const marks: Mark[] = [];
  for (let i = 0; i < doc.marks.length; i++) {
    const mark = doc.marks[i];
    if (!mark.clipId) {
      marks.push(mark);
      continue;
    }
    let text = glyphText(mark);
    while (doc.marks[i + 1]?.clipId === mark.clipId)
      text += glyphText(doc.marks[++i]);
    marks.push({
      ...mark,
      id: mark.clipId,
      kind: "clipping",
      text,
      clipId: undefined,
    });
  }
  return { ...doc, marks, cursor: marks.length };
}
