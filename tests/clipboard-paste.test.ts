import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePaste,
  planPaste,
  selectionPayload,
  SHORT_PASTE,
} from "../lib/clipboard";
import type { Mark } from "../lib/writing";

const glyphs = (text: string, clipId?: string): Mark[] =>
  Array.from(text).map((char, i) => ({
    id: `${clipId ?? "t"}-${i}`,
    text: char,
    kind: "glyph",
    seed: i,
    density: 1,
    mode: "draft",
    ...(clipId ? { clipId } : {}),
  }));

test("your own words come back as your own words", () => {
  const marks = glyphs("I wrote this.");
  const payload = selectionPayload(marks, 2, 7);
  assert.equal(payload.text, "wrote");
  assert.deepEqual(planPaste("wrote", payload), {
    runs: [{ text: "wrote", as: "typed" }],
    external: false,
  });
});

test("a quote copied from the paper stays a quote, and the typing around it stays typing", () => {
  const marks = [
    ...glyphs("Before "),
    ...glyphs("quoted words", "c1"),
    ...glyphs(" after"),
  ];
  const payload = selectionPayload(marks, 0, marks.length);
  assert.deepEqual(payload.clips, [[7, 19]]);
  assert.deepEqual(planPaste(payload.text, payload).runs, [
    { text: "Before ", as: "typed" },
    { text: "quoted words", as: "clipping" },
    { text: " after", as: "typed" },
  ]);
});

test("struck-through words are copied as they read", () => {
  const marks = glyphs("abc");
  marks[1] = { ...marks[1], crossed: true };
  assert.equal(selectionPayload(marks, 0, 3).text, "abc");
});

test("outside text: short fragments are typed in, passages are taped in", () => {
  assert.equal(planPaste("Rilke", null).runs[0].as, "typed");
  assert.equal(planPaste("x".repeat(SHORT_PASTE), null).runs[0].as, "typed");
  assert.equal(
    planPaste("x".repeat(SHORT_PASTE + 1), null).runs[0].as,
    "clipping",
  );
  assert.equal(planPaste("one\ntwo", null).runs[0].as, "clipping");
  assert.equal(planPaste("one\ntwo", null).external, true);
});

test("⌘⇧V always types it in", () => {
  assert.equal(
    planPaste("A long passage.\nWith lines.", null, true).runs[0].as,
    "typed",
  );
});

test("research from the copy holder is a quote even when short", () => {
  const payload = {
    v: 1 as const,
    from: "source" as const,
    text: "Rilke",
    clips: [],
  };
  assert.equal(planPaste("Rilke", payload).runs[0].as, "clipping");
  assert.equal(planPaste("Rilke", payload, true).runs[0].as, "typed");
});

test("text edited elsewhere after copying from the paper is treated as outside text", () => {
  const payload = selectionPayload(glyphs("mine"), 0, 4);
  const plan = planPaste("mine, changed", payload);
  assert.equal(plan.external, true);
});

test("pasted text is cleaned without losing Persian joiners", () => {
  assert.equal(normalizePaste("\r\na b​c\t\n\n\n\nd  \n"), "a bc\n\nd");
  assert.equal(normalizePaste("می‌نویسم"), "می‌نویسم");
});
