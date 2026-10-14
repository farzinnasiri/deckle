import { test } from "node:test";
import assert from "node:assert/strict";
import { newPiece, defaultPaper, documentLines } from "../lib/writing";

test("documentLines auto-detects # h1, ## h2, and ### h2 markdown headings", () => {
  const piece = newPiece(defaultPaper);
  const text = "# Main Section\n## Sub Section\n### Sub Sub Section\nNormal body line";
  piece.document.marks = Array.from(text).map((char, i) => ({
    id: `m-${i}`,
    text: char,
    kind: "glyph",
    seed: i,
    density: 1,
    mode: "draft",
  }));

  const lines = documentLines(piece.document);
  assert.equal(lines.length, 4);

  // Line 1: # Main Section -> h1, prefix 2
  assert.equal(lines[0].block, "h1");
  assert.equal(lines[0].prefix, 2);

  // Line 2: ## Sub Section -> h2, prefix 3
  assert.equal(lines[1].block, "h2");
  assert.equal(lines[1].prefix, 3);

  // Line 3: ### Sub Sub Section -> h2, prefix 4
  assert.equal(lines[2].block, "h2");
  assert.equal(lines[2].prefix, 4);

  // Line 4: Normal body line -> body, prefix 0
  assert.equal(lines[3].block, "body");
  assert.equal(lines[3].prefix, 0);
});
