import { documentLines, type Document, type Mark, type Piece } from "./writing";
import { editingText } from "./editor-model";
export const SHARE_FORMATS = [
  {
    id: "portrait",
    name: "Portrait",
    ratio: "4:5",
    width: 1080,
    height: 1350,
  },
  { id: "square", name: "Square", ratio: "1:1", width: 1080, height: 1080 },
  {
    id: "story",
    name: "Story",
    ratio: "9:16",
    width: 1080,
    height: 1920,
  },
  {
    id: "landscape",
    name: "Wide",
    ratio: "16:9",
    width: 1200,
    height: 675,
  },
] as const;
export type ShareFormat = (typeof SHARE_FORMATS)[number];
// Sharing is a bounded opening excerpt, never a smaller photograph of a whole long paper.
export function shareExcerpt(
  document: Document,
  format: ShareFormat,
  zoom = 1,
): { document: Document; truncated: boolean } {
  const rows: Mark[][] = [];
  const scale = Math.max(0.8, Math.min(1.4, zoom));
  const columns = Math.floor(52 / scale);
  for (const line of documentLines(document)) {
    const marks = line.marks.slice(line.prefix);
    if (!marks.length) {
      rows.push([]);
      continue;
    }
    let remaining = marks;
    while (remaining.length) {
      let end = Math.min(columns, remaining.length);
      if (end < remaining.length) {
        const space = remaining
          .slice(0, end)
          .findLastIndex((m) => m.text === " ");
        if (space > columns / 2) end = space + 1;
      }
      const row = remaining.slice(0, end);
      row[0] = { ...row[0], block: line.block };
      rows.push(row);
      remaining = remaining.slice(end);
    }
  }
  while (rows.length && !rows[0].some((m) => m.text.trim())) rows.shift();
  const rowBudget = Math.max(
    1,
    Math.floor(
      { portrait: 10, square: 8, story: 14, landscape: 5 }[format.id] / scale,
    ),
  );
  const excerpt = rows.slice(0, rowBudget);
  const truncated = rows
    .slice(rowBudget)
    .some((row) => row.some((m) => m.text.trim()));
  while (excerpt.length && !excerpt.at(-1)!.some((m) => m.text.trim()))
    excerpt.pop();
  if (truncated) {
    let last = excerpt.at(-1) || [];
    while (last.length && !last.at(-1)!.text.trim()) last = last.slice(0, -1);
    if (last.length > columns - 2) {
      const space = last.findLastIndex((m) => m.text === " ");
      last = last.slice(0, space > columns / 2 ? space : columns - 2);
    }
    last = [
      ...last,
      {
        id: "share-ellipsis",
        text: "…",
        kind: "glyph",
        seed: 0,
        density: 1,
        mode: "draft",
      },
    ];
    if (excerpt.length) excerpt[excerpt.length - 1] = last;
    else excerpt.push(last);
  }
  const marks = excerpt.flatMap((row, index) => {
    const newline: Mark = {
      id: `share-break-${index}`,
      text: "\n",
      kind: "glyph",
      seed: 0,
      density: 1,
      mode: "draft",
    };
    return index ? [newline, ...row] : row;
  });
  return {
    document: {
      ...document,
      title: undefined,
      marks,
      cursor: 0,
      selection: undefined,
    },
    truncated,
  };
}

/** A conservative weighted excerpt, preserving whole emoji graphemes. X's
 * composer remains the place to edit and confirm the post. */
export function xPostUrl(piece: Piece) {
  const text = [
    piece.document.title?.trim(),
    editingText(piece.document).trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
  let excerpt = "",
    weight = 0;
  for (const { segment } of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(text)) {
    const next = Array.from(segment).reduce((sum, char) => {
      const c = char.codePointAt(0)!;
      return (
        sum +
        (c <= 4351 ||
        (c >= 8192 && c <= 8205) ||
        (c >= 8208 && c <= 8223) ||
        (c >= 8242 && c <= 8247)
          ? 1
          : 2)
      );
    }, 0);
    if (weight + next > 238) {
      excerpt = excerpt.trimEnd() + "…";
      break;
    }
    excerpt += segment;
    weight += next;
  }
  const url = new URL("https://x.com/intent/tweet");
  url.searchParams.set("text", excerpt);
  return url.toString();
}

export function mobileSharingDevice(
  userAgent: string,
  platform: string,
  touchPoints: number,
) {
  return (
    /Android|iPhone|iPad|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && touchPoints > 1)
  );
}

export function imageName(name: string, format: ShareFormat) {
  const safe =
    name
      .replace(/[^\p{L}\p{N} -]/gu, "")
      .trim()
      .slice(0, 60) || "Deckle";
  return `${safe}-${format.id}.png`;
}
