import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PaperArchiveDossier } from "../components/paper-archive-dossier";
import { newPiece, defaultPaper, type Piece } from "../lib/writing";

test("PaperArchiveDossier renders empty state when pieces is empty", () => {
  const html = renderToStaticMarkup(
    React.createElement(PaperArchiveDossier, {
      pieces: [],
      waste: false,
      search: "",
      setSearch: () => {},
      searchRef: { current: null },
      onOpen: async () => {},
      onWasteChange: () => {},
      onDiscard: () => {},
      onRestore: () => {},
      onClose: () => {},
      closing: false,
      onBackup: () => {},
      onImport: async () => {},
    }),
  );

  assert.ok(html.includes('class="archive '));
  // The empty archive is still a drawer, with a note lying in it.
  assert.ok(html.includes("archive-empty-note"));
  assert.ok(html.includes("Nothing filed yet"));
  assert.ok(html.includes("archive-drawer-stage"));
  assert.ok(html.includes("Search papers"));
  assert.ok(!html.includes("archive-title"));
});

test("PaperArchiveDossier renders filed papers as labeled folders before opening a preview", () => {
  const piece1 = newPiece(defaultPaper);
  piece1.document.marks = [
    {
      id: "1",
      text: "The mechanical typing sound was crisp.",
      kind: "glyph",
      seed: 1,
      density: 1,
      mode: "draft",
    },
  ];
  piece1.searchText =
    "a dispatch from zurich the mechanical typing sound was crisp.";
  piece1.document.title = "A Dispatch from Zurich";

  const piece2 = newPiece({ ...defaultPaper, stock: "onionskin" });
  piece2.document.title = "Second Dispatch";
  piece2.searchText = "Letters folded into quiet pages.";

  const html = renderToStaticMarkup(
    React.createElement(PaperArchiveDossier, {
      pieces: [piece1, piece2],
      waste: false,
      search: "",
      setSearch: () => {},
      searchRef: { current: null },
      onOpen: async () => {},
      onWasteChange: () => {},
      onDiscard: () => {},
      onRestore: () => {},
      onClose: () => {},
      closing: false,
      onBackup: () => {},
      onImport: async () => {},
    }),
  );

  assert.ok(html.includes("archive-drawer-hit"));
  assert.ok(html.includes("A Dispatch from Zurich"));
  assert.ok(html.includes("Second Dispatch"));
  assert.ok(!html.includes('aria-label="Discard paper"'));
  assert.ok(!html.includes("The mechanical typing sound was crisp."));
  assert.ok(!html.includes("a dispatch from zurich the mechanical"));
  assert.ok(html.includes("Download backup"));
  assert.ok(
    html.includes('aria-label="Preview paper A Dispatch from Zurich"') ||
      html.includes('aria-label="Select folder A Dispatch from Zurich"'),
  );
  assert.ok(!html.includes('class="archive-open"'));
  assert.ok(!html.includes("archive-drawer-controls"));
  assert.ok(!html.includes('aria-label="Peek inside selected folder"'));
  assert.ok(!html.includes('aria-label="Previous folder"'));
  assert.ok(!html.includes('aria-label="Next folder"'));
  assert.equal((html.match(/aria-current="true"/g) || []).length, 1);
  assert.ok(!html.includes("Preview <"));
  assert.ok(html.includes("Archive drawer. Scroll, swipe or use arrow keys"));
  assert.equal((html.match(/<summary/g) || []).length, 1);
  assert.ok(!html.includes("line<"));
  // The basket is available only inside the archive.
  assert.ok(html.includes('class="desk-bin'));
  assert.ok(html.includes('aria-label="More actions"'));
  assert.ok(!html.includes("Continue writing"));
});

test("PaperArchiveDossier renders wastebasket mode when waste is true", () => {
  const discardedPiece = newPiece(defaultPaper);
  discardedPiece.discardedAt = Date.now() - 5000;
  discardedPiece.document.title = "Discarded Manuscript";

  const html = renderToStaticMarkup(
    React.createElement(PaperArchiveDossier, {
      pieces: [discardedPiece],
      waste: true,
      search: "",
      setSearch: () => {},
      searchRef: { current: null },
      onOpen: async () => {},
      onWasteChange: () => {},
      onDiscard: () => {},
      onRestore: () => {},
      onClose: () => {},
      closing: false,
      onBackup: () => {},
      onImport: async () => {},
      onShred: () => {},
    }),
  );

  assert.ok(html.includes("Wastebasket"));
  assert.ok(html.includes("Empty wastebasket"));
  assert.ok(html.includes("Discarded Manuscript"));
  assert.ok(html.includes("Restore"));
});
