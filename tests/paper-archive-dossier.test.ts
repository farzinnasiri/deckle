import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PaperArchiveDossier } from "../components/paper-archive-dossier";
import { appendEvent, makeEvent, newPiece } from "../lib/writing";

function render(
  patch: Partial<React.ComponentProps<typeof PaperArchiveDossier>>,
) {
  return renderToStaticMarkup(
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
      ...patch,
    }),
  );
}

test("archive folders expose their titles without opening or leaking the paper body", () => {
  assert.ok(render({}).includes("Nothing filed yet"));
  const piece = appendEvent(
    newPiece(),
    makeEvent("type", "The private body of this paper.", "draft"),
  );
  piece.document.title = "A Dispatch from Zurich";
  piece.searchText = "internal search index";
  const html = render({ pieces: [piece] });
  assert.match(
    html,
    /aria-label="(?:Select folder|Preview paper) A Dispatch from Zurich"/,
  );
  assert.ok(!html.includes("The private body of this paper."));
  assert.ok(!html.includes("internal search index"));
});

test("discarded papers offer restore and permanent removal only in the wastebasket", () => {
  const piece = newPiece();
  piece.discardedAt = Date.now();
  piece.document.title = "Discarded Manuscript";
  const html = render({ pieces: [piece], waste: true, onShred: () => {} });
  assert.ok(html.includes("Discarded Manuscript"));
  assert.ok(html.includes("Restore"));
  assert.ok(html.includes("Empty wastebasket"));
  assert.ok(!render({}).includes("Empty wastebasket"));
});
