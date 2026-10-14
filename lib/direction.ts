// Right-to-left writing. A line takes the direction of its first letter, the
// way a typist would set the carriage for it; an empty line keeps the
// direction of the line above, so Return after Persian stays on the right.

const RTL_LETTER = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LETTER = /\p{L}/u;
// Arabic-script letters join to their neighbours; nudging each one by its own
// strike offset would break the joins.
const JOINING = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export type Direction = "ltr" | "rtl";

/** The direction of the first letter in `text`, if it has one. */
export function textDirection(text: string): Direction | undefined {
  for (const char of text)
    if (LETTER.test(char)) return RTL_LETTER.test(char) ? "rtl" : "ltr";
  return undefined;
}

/** One direction per line; lines without letters inherit from above. */
export function lineDirections(lines: string[], start: Direction = "ltr") {
  let previous = start;
  return lines.map((line) => (previous = textDirection(line) ?? previous));
}

export function isJoiningGlyph(char: string) {
  return JOINING.test(char);
}
