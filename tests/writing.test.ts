import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyEvent,
  replay,
  markdown,
  layout,
  pauseDuration,
  cleanStore,
  emptyWastebasket,
  shredPaper,
  newStore,
  type KeyEvent,
  type Document,
} from "../lib/writing";
let serial = 0;
function event(
  action: KeyEvent["action"],
  key = "",
  mode: KeyEvent["mode"] = "draft",
): KeyEvent {
  return {
    version: 1,
    id: String(serial++),
    at: serial * 120,
    action,
    key,
    mode,
    seed: 435 + serial,
    density: 0.96,
  };
}
const empty = (): Document => ({ marks: [], cursor: 0 });
test("draft corrections erase; replay reproduces document and stored imperfections", () => {
  const events = [
    event("type", "Hello"),
    event("backspace"),
    event("type", "a"),
  ];
  const doc = events.reduce(applyEvent, empty());
  assert.equal(markdown(doc), "Hella");
  assert.deepEqual(replay(JSON.parse(JSON.stringify(events))), doc);
  assert.equal(doc.marks[0].seed, events[0].seed);
});
test("ink backspace moves the head without removing the underlying mark", () => {
  const doc = replay([
    event("type", "cat", "ink"),
    event("backspace", "", "ink"),
    event("type", "x", "ink"),
  ]);
  assert.equal(doc.marks[2].text, "t");
  assert.deepEqual(doc.marks[2].overprints, ["x"]);
  assert.equal(markdown(doc), "ca~~t~~x");
});
test("ink word crossing keeps the previous word and draft word deletion removes it", () => {
  assert.equal(
    markdown(
      replay([event("type", "one two"), event("strike-word", "", "ink")]),
    ),
    "one ~~two~~",
  );
  assert.equal(
    markdown(replay([event("type", "one two "), event("strike-word")])),
    "one ",
  );
});
test("clippings export as quote blocks and remain separate from keystrokes", () => {
  const doc = replay([
    event("type", "A quote:"),
    event("paste", "First line\nSecond line"),
  ]);
  assert.equal(doc.marks.at(-1)?.kind, "clipping");
  assert.equal(markdown(doc), "A quote:\n\n> First line\n> Second line\n\n");
  assert.ok(layout(doc).rows >= 5);
});
test("whole words wrap at sixty columns; long words still fit", () => {
  const doc = replay([event("type", "a".repeat(55) + " hello")]);
  const result = layout(doc);
  assert.equal(result.placed[56].row, 1);
  assert.equal(result.placed[56].col, 0);
  assert.ok(
    layout(replay([event("type", "x".repeat(150))])).placed.every(
      (m) => m.col < 60,
    ),
  );
});
test("return feeds blank lines, and continuing preserves a seam in the replay", () => {
  const doc = replay([
    event("type", "hello\n\n"),
    event("seam"),
    event("type", "again"),
  ]);
  assert.equal(layout(doc).rows, 4);
  assert.ok(markdown(doc).includes("---"));
});
test("long replay pauses compress and respect playback speed", () => {
  assert.equal(pauseDuration(1000, 11000, 1), 2000);
  assert.equal(pauseDuration(1000, 5000, 4), 1000);
  assert.equal(pauseDuration(1000, 11000, 16), 125);
});
test("discard retention never deletes active or recent papers; daily count resets", () => {
  const store = newStore();
  const recent = {
    ...store.active,
    id: "recent",
    discardedAt: Date.now() - 86400000,
  };
  const old = {
    ...store.active,
    id: "old",
    discardedAt: Date.now() - 31 * 86400000,
  };
  const kept = { ...store.active, id: "kept" };
  const cleaned = cleanStore({
    ...store,
    day: "2000-1-1",
    linesToday: 22,
    pieces: [recent, old, kept],
  });
  assert.deepEqual(
    cleaned.pieces.map((p) => p.id),
    ["recent", "kept"],
  );
  assert.equal(cleaned.active.id, store.active.id);
  assert.equal(cleaned.linesToday, 0);
});

test("With no title set, the first few words of the writing become the title", async () => {
  const { autoTitle, title, newPiece } = await import("../lib/writing");
  const doc = replay([
    event(
      "type",
      "The morning was quiet and I did not know yet what I wanted to say.",
    ),
  ]);
  assert.equal(autoTitle(doc), "The morning was quiet and I…");
  assert.equal(autoTitle(replay([event("type", "Short line")])), "Short line");
  assert.equal(autoTitle(replay([])), "");
  const piece = { ...newPiece(), document: doc };
  assert.equal(title(piece), "The morning was quiet and I…");
  assert.equal(
    title({ ...piece, document: { ...doc, title: "  My title " } }),
    "My title",
  );
});

test("emptying the wastebasket shreds only discarded papers", () => {
  const store = newStore();
  const binned = { ...store.active, id: "binned", discardedAt: Date.now() };
  const filed = { ...store.active, id: "filed", discardedAt: null };
  const { store: after, shredded } = emptyWastebasket({
    ...store,
    pieces: [binned, filed],
  });
  assert.deepEqual(shredded, ["binned"]);
  assert.deepEqual(
    after.pieces.map((p) => p.id),
    ["filed"],
  );
  assert.equal(after.active.id, store.active.id);
});

test("sequential shredding removes only the selected discarded paper", () => {
  const store = newStore();
  const first = { ...store.active, id: "first", discardedAt: Date.now() };
  const second = { ...store.active, id: "second", discardedAt: Date.now() };
  const filed = { ...store.active, id: "filed", discardedAt: null };
  const before = { ...store, pieces: [first, second, filed] };
  assert.deepEqual(
    shredPaper(before, "first").pieces.map((p) => p.id),
    ["second", "filed"],
  );
  assert.deepEqual(shredPaper(before, "filed").pieces, before.pieces);
  assert.equal(shredPaper(before, store.active.id).active, store.active);
});
