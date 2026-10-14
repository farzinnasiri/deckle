import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addedLines,
  applyEvent,
  defaultPaper,
  documentLines,
  exportMarkdown,
  makeEvent,
  markdown,
  newPiece,
  replay,
  stampAppearance,
  type Document,
  type KeyEvent,
} from "../lib/writing";
import { editingText } from "../lib/editor-model";
import { migrateStore, mergeArchive } from "../lib/archive";
import fixture from "./fixtures/v1-desk.json";
const empty = (): Document => ({ marks: [], cursor: 0 });
function edit(doc: Document, text: string) {
  const from = editingText(doc).length;
  return applyEvent(doc, {
    ...makeEvent("type", text, "draft"),
    range: { from, to: from },
    selection: { anchor: from, head: from },
  });
}
test("blank Returns count zero; the first visible glyph on a row counts one; deletion never subtracts", () => {
  const blank = edit(empty(), "\n".repeat(10));
  assert.equal(addedLines(empty(), blank), 0);
  const spaces = edit(blank, "  \t");
  assert.equal(addedLines(blank, spaces), 0);
  const first = edit(spaces, "a");
  assert.equal(addedLines(spaces, first), 1);
  const second = edit(first, "b");
  assert.equal(addedLines(first, second), 0);
  const deleted = applyEvent(second, {
    ...makeEvent("delete", "", "draft"),
    range: { from: 0, to: editingText(second).length },
  });
  assert.equal(addedLines(second, deleted), 0);
});
test("each style exports as one contiguous Markdown span and replays exactly", () => {
  for (const [style, output] of [
    [{ strike: "double" }, "**hello**"],
    [{ element: "italic" }, "*hello*"],
    [{ underline: true }, "<u>hello</u>"],
    [{ ribbon: "red" }, "<mark>hello</mark>"],
  ] as const) {
    const events: KeyEvent[] = [
      makeEvent("type", "hello", "draft"),
      { ...makeEvent("style", "", "draft"), range: { from: 0, to: 5 }, style },
    ];
    const doc = replay(events);
    assert.equal(markdown(doc), output);
    assert.deepEqual(replay(JSON.parse(JSON.stringify(events))), doc);
  }
});
test("no-selection formatting affects later typing; Draft removes styles and Ink keeps them", () => {
  const on: KeyEvent = {
    ...makeEvent("style", "", "draft"),
    style: {
      strike: "double",
      underline: true,
      element: "italic",
      ribbon: "red",
    },
  };
  const doc = replay([on, makeEvent("type", "hello", "draft")]);
  const off = {
    ...makeEvent("style", "", "draft"),
    range: { from: 0, to: 5 },
    style: {
      strike: "single",
      underline: false,
      element: "mono",
      ribbon: "black",
    },
  } as KeyEvent;
  assert.equal(markdown(applyEvent(doc, off)), "hello");
  assert.equal(
    markdown(applyEvent(doc, { ...off, mode: "ink" })),
    "<mark><u>***hello***</u></mark>",
  );
});
test("title, blocks, initials, materials and stamp survive replay without changing text", () => {
  const piece = newPiece({ ...defaultPaper, initials: true });
  const events: KeyEvent[] = [
    ...piece.events,
    {
      ...makeEvent("stamp", "", "draft"),
      stamp: { name: "Farzin", seed: 2147483, at: 1791370800000 },
    },
    makeEvent("title", "A title", "draft"),
    makeEvent("type", "Opening\nA section\nSecond paragraph", "draft"),
    {
      ...makeEvent("block", "", "draft"),
      block: "h1",
      range: { from: 8, to: 17 },
    },
  ];
  const doc = replay(events);
  assert.equal(
    markdown(doc),
    "# A title\n\nOpening\n# A section\nSecond paragraph",
  );
  assert.equal(documentLines(doc).filter((l) => l.initial).length, 2);
  assert.ok(
    exportMarkdown({ ...piece, document: doc, events }).includes(
      'author: "Farzin"',
    ),
  );
  const lateStamp = applyEvent(doc, {
    ...makeEvent("stamp", "", "draft"),
    stamp: { name: "Changed", seed: 1, at: 1 },
  });
  assert.deepEqual(lateStamp.stamp, doc.stamp);
  assert.deepEqual(replay(JSON.parse(JSON.stringify(events))), doc);
});
test("typed heading conventions derive headings and dinkus without duplicating export prefixes", () => {
  const doc = edit(empty(), "# First\n## Second\n***\nbody");
  assert.deepEqual(
    documentLines(doc).map((l) => l.block),
    ["h1", "h2", "dinkus", "body"],
  );
  const formatted = applyEvent(doc, {
    ...makeEvent("style", "", "draft"),
    range: { from: 2, to: 7 },
    style: { strike: "double" },
  });
  assert.equal(markdown(formatted), "# **First**\n## Second\n***\nbody");
});
test("stamp appearance is deterministic and varies with its saved seed", () => {
  assert.deepEqual(
    stampAppearance(12519),
    stampAppearance(JSON.parse("12519")),
  );
  assert.notDeepEqual(stampAppearance(12519), stampAppearance(218710));
});
test("real v1 serializer fixture migrates without changing marks, settings, or logs", () => {
  const before = JSON.stringify(fixture),
    migrated = migrateStore(fixture);
  assert.deepEqual(migrated.active.document, fixture.active.document);
  assert.deepEqual(migrated.active.events, fixture.active.events);
  assert.deepEqual(migrated.pieces[0].document, fixture.pieces[0].document);
  assert.equal(migrated.settings.paper?.element, "book");
  assert.equal(migrated.settings.volume, 0.22);
  assert.equal(JSON.stringify(fixture), before);
});
test("archive import preserves the current desk and never overwrites a conflicting paper", () => {
  const current = migrateStore(fixture),
    incoming = structuredClone(current);
  incoming.active.id = "imported";
  incoming.settings.volume = 0.8;
  const merged = mergeArchive(current, incoming);
  assert.equal(merged.imported, 1);
  assert.equal(merged.store.active.id, current.active.id);
  assert.equal(merged.store.settings.volume, 0.22);
  assert.deepEqual(
    merged.store.pieces.find((p) => p.id === current.pieces[0].id)?.document,
    current.pieces[0].document,
  );
  assert.equal(mergeArchive(merged.store, incoming).imported, 0);
  assert.throws(() =>
    migrateStore({
      ...fixture,
      active: { ...fixture.active, events: [{ action: "oops" }] },
    }),
  );
});
