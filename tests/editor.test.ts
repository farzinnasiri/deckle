import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyEvent,
  replay,
  markdown,
  type KeyEvent,
  type Document,
} from "../lib/writing";
import {
  editingText,
  editorMarks,
  caretOffset,
  readingDocument,
} from "../lib/editor-model";

let serial = 0;
const empty = (): Document => ({ marks: [], cursor: 0 });
function edit(
  action: KeyEvent["action"],
  key: string,
  from: number,
  to = from,
  mode: KeyEvent["mode"] = "draft",
  selected = to !== from,
): KeyEvent {
  return {
    version: 1,
    id: `edit-${++serial}`,
    at: serial * 100,
    action,
    key,
    seed: serial * 7919,
    density: 0.96,
    mode,
    range: { from, to },
    selection: { anchor: from, head: selected ? to : from },
  };
}

test("Draft replaces an earlier selection without changing surrounding strike records", () => {
  const first = edit("type", "Some days\nA little space.", 0);
  const original = applyEvent(empty(), first);
  const replacement = edit("type", "Quiet", 0, 4);
  const doc = applyEvent(original, replacement);
  assert.equal(editingText(doc), "Quiet days\nA little space.");
  assert.deepEqual(doc.marks.slice(5), original.marks.slice(4));
  assert.equal(caretOffset(doc), 5);
  assert.deepEqual(
    replay(JSON.parse(JSON.stringify([first, replacement]))),
    doc,
  );
});

test("cursor ranges use UTF-16 offsets and preserve Unicode glyphs", () => {
  const first = edit("type", "A🌿 café\nsecond", 0);
  const replacement = edit("type", "☀️", 1, 3);
  const doc = replay([first, replacement, edit("type", "!", 9)]);
  assert.equal(editingText(doc), "A☀️ café\n!second");
  assert.equal(doc.marks.filter((m) => m.text === "☀").length, 1);
  assert.equal(caretOffset(doc), 10);
});

test("deleting a multiline range and restoring undo snapshots replays exactly", () => {
  const first = edit("type", "one\ntwo\nthree", 0);
  const original = applyEvent(empty(), first);
  const deletion = edit("delete", "", 3, 8);
  assert.equal(editingText(applyEvent(original, deletion)), "onethree");
  const restore: KeyEvent = { ...edit("restore", "", 0), snapshot: original };
  const events = [first, deletion, restore, edit("type", "!", 13)];
  const final = replay(events);
  assert.equal(editingText(final), "one\ntwo\nthree!");
  assert.deepEqual(replay(JSON.parse(JSON.stringify(events))), final);
});

test("legacy clippings remain editable with quote provenance and reading blocks", () => {
  const legacy: KeyEvent = {
    ...edit("paste", "quoted words", 0),
    range: undefined,
    selection: undefined,
  };
  const original = applyEvent(empty(), legacy);
  assert.equal(original.marks[0].kind, "clipping");
  const doc = applyEvent(original, edit("type", "new", 1, 7));
  assert.equal(editingText(doc), "\nnew words\n");
  assert.ok(doc.marks.slice(1, 4).every((m) => m.clipId === legacy.id));
  assert.equal(
    readingDocument(doc).marks.find((m) => m.kind === "clipping")?.text,
    "new words",
  );
  assert.ok(markdown(doc).includes("> new words"));
  assert.equal(original.marks[0].text, "quoted words");
  assert.equal(editorMarks(original)[1].seed, original.marks[0].seed);
});

test("pasting into an earlier range creates a distinct clipping and replays", () => {
  const events = [
    edit("type", "Before after", 0),
    edit("paste", "a quote\nsecond line", 7),
  ];
  const doc = replay(events);
  assert.equal(editingText(doc), "Before \na quote\nsecond line\nafter");
  assert.ok(markdown(doc).includes("> a quote\n> second line"));
  assert.deepEqual(replay(JSON.parse(JSON.stringify(events))), doc);
});

test("Ink backspace preserves the original and typing overprints it", () => {
  const events = [
    edit("type", "cat", 0),
    edit("backspace", "", 2, 3, "ink", false),
    edit("type", "x", 2, 2, "ink"),
  ];
  const doc = replay(events);
  assert.equal(editingText(doc), "cax");
  assert.equal(doc.marks[2].text, "t");
  assert.deepEqual(doc.marks[2].overprints, ["x"]);
  assert.equal(markdown(doc), "ca~~t~~x");
});

test("Ink selection replacement visibly crosses the original instead of erasing it", () => {
  const events = [
    edit("type", "one two", 0),
    edit("type", "three", 4, 7, "ink"),
  ];
  const doc = replay(events);
  assert.equal(editingText(doc), "one twothree");
  assert.ok(doc.marks.slice(4, 7).every((m) => m.crossed));
  assert.equal(markdown(doc), "one ~~two~~three");
  assert.equal(caretOffset(doc), 12);
});

test("Ink word crossing leaves the head after the word, so writing continues", () => {
  const events = [
    edit("type", "one two", 0),
    edit("strike-word", "", 4, 7, "ink"),
    edit("type", " three", 7, 7, "ink"),
  ];
  const doc = replay(events);
  assert.equal(editingText(doc), "one two three");
  assert.ok(doc.marks.slice(4, 7).every((m) => m.crossed));
  assert.equal(markdown(doc), "one ~~two~~ three");
});

test("paper ruling survives replay and archive migration without changing writing", async () => {
  const { paperRuling, paperRulings, defaultPaper, newStore } =
    await import("../lib/writing");
  const { migrateStore } = await import("../lib/archive");
  const typed = edit("type", "Keep these words.", 0);
  for (const ruling of Object.keys(
    paperRulings,
  ) as (keyof typeof paperRulings)[]) {
    const event: KeyEvent = {
      ...edit("paper", "", 0),
      paper: { ...defaultPaper, ruling },
    };
    const doc = replay([typed, event]);
    assert.equal(editingText(doc), "Keep these words.");
    assert.equal(paperRuling(doc.paper), ruling);
    const store = newStore();
    store.active.document = doc;
    store.active.events = [typed, event];
    assert.equal(
      migrateStore(JSON.parse(JSON.stringify(store))).active.document.paper
        ?.ruling,
      ruling,
    );
  }
  assert.equal(paperRuling({ ...defaultPaper, stock: "ledger" }), "narrow");
  assert.equal(
    paperRuling({ ...defaultPaper, stock: "ledger", ruling: "blank" }),
    "blank",
  );
});
