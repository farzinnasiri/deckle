import { editingText } from "./editor-model";
import type { Document } from "./writing";
export const PAPER_LINE_LIMIT = 120;
export const textLineCount = (text: string) => text.split("\n").length;
export const paperLineCount = (document: Document) =>
  textLineCount(editingText(document));
export function fitsPaper(before: string, after: string) {
  // Existing long papers are never cut down; editing and removing lines still work.
  return (
    textLineCount(after) <= Math.max(PAPER_LINE_LIMIT, textLineCount(before))
  );
}
