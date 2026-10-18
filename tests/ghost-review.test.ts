import test from "node:test";
import assert from "node:assert/strict";
import { ghostEdits, type GhostRequest } from "../lib/ghostwriter";
import {
  startGhostReview as startReview,
  chosenGhostEdits,
  reconcileGhostReview,
  pendingGhostSuggestions,
  finishGhostReview,
} from "../lib/ghost-review";

function startGhostReview(
  text: string,
  edits: import("../lib/ghostwriter").GhostEdit[],
) {
  return startReview(
    text,
    edits.map((edit) => ({
      kind: edit.kind,
      title: "Agreement",
      reason: edit.reason,
      anchors: [{ from: edit.from, to: edit.to, quote: edit.before }],
      alternatives: [{ label: "Correction", edits: [edit] }],
    })),
  );
}
const text = "The rain were loud. The owner have a dog. A quiet afternoon.";
const input: GhostRequest = {
  text,
  scope: { from: 0, to: text.length },
  options: { fix: true, style: true, review: true },
  protected: [],
};
const edits = ghostEdits(input, {
  edits: [
    {
      before: "rain were",
      after: "rain was",
      kind: "fix",
      reason: "Agreement.",
    },
    {
      before: "owner have",
      after: "owner has",
      kind: "fix",
      reason: "Agreement.",
    },
  ],
});
test("a manual correction keeps other suggestions and undo restores the corrected item", () => {
  const review = startGhostReview(text, edits);
  const corrected = text.replace("were", "was");
  const next = reconcileGhostReview(review, corrected)!;
  assert.ok(next);
  assert.equal(pendingGhostSuggestions(next).length, 1);
  const remaining = pendingGhostSuggestions(next)[0].alternatives[0].edits[0];
  assert.equal(corrected.slice(remaining.from, remaining.to), remaining.before);
  assert.equal(remaining.before, "owner have");
  assert.equal(
    pendingGhostSuggestions(reconcileGhostReview(next, text)!).length,
    2,
  );
});
test("manual replacement stays local through deletion, retyping and later corrections", () => {
  for (const [before, words] of [
    ["were", ["wr", "w", "was", "wasn't"]],
    ["have", ["h", "ha", "has"]],
  ] as const) {
    let review = startGhostReview(text, edits);
    for (const word of words) {
      const next = reconcileGhostReview(review, text.replace(before, word));
      assert.ok(next, `${before} -> ${word}`);
      review = next;
      const pending = pendingGhostSuggestions(review);
      assert.equal(pending.length, 1);
      const remaining = chosenGhostEdits(pending[0])[0];
      assert.equal(
        review.text.slice(remaining.from, remaining.to),
        remaining.before,
      );
    }
  }
});
test("partial playback resolves only completed corrections and undo restores the pass", () => {
  const review = startGhostReview(text, edits);
  const changes = pendingGhostSuggestions(review).flatMap(chosenGhostEdits);
  const partial = finishGhostReview(review, changes, 1)!;
  assert.equal(partial.text, text.replace("have", "has"));
  assert.equal(pendingGhostSuggestions(partial).length, 1);
  const all = finishGhostReview(review, changes, 2)!;
  assert.equal(all.text, text.replace("were", "was").replace("have", "has"));
  assert.equal(pendingGhostSuggestions(all).length, 0);
  assert.equal(
    pendingGhostSuggestions(reconcileGhostReview(all, text)!).length,
    2,
  );
});
test("large Fix all groups retain undo and redo states across more than forty corrections", () => {
  const lines = Array.from(
    { length: 80 },
    (_, index) => `At stop ${index + 1}, she wait.`,
  );
  const original = lines.join("\n");
  const edits = ghostEdits(
    { ...input, text: original, scope: { from: 0, to: original.length } },
    {
      edits: lines.map((before) => ({
        before,
        after: before.replace("wait.", "waits."),
        kind: "fix",
        reason: "Agreement.",
      })),
    },
  );
  const review = startGhostReview(original, edits);
  const one = finishGhostReview(
    review,
    [chosenGhostEdits(review.suggestions[0])[0]],
    1,
  )!;
  const all = finishGhostReview(
    one,
    pendingGhostSuggestions(one).flatMap(chosenGhostEdits),
    79,
  )!;
  assert.equal(pendingGhostSuggestions(all).length, 0);
  const undoAll = reconcileGhostReview(all, one.text);
  assert.ok(undoAll);
  assert.equal(pendingGhostSuggestions(undoAll).length, 79);
  const undoOne = reconcileGhostReview(undoAll, original);
  assert.ok(undoOne);
  assert.equal(pendingGhostSuggestions(undoOne).length, 80);
  const redoOne = reconcileGhostReview(undoOne, one.text)!;
  const redoAll = reconcileGhostReview(redoOne, all.text)!;
  assert.equal(pendingGhostSuggestions(redoAll).length, 0);
});
test("unrelated text changes invalidate the pass, including after a partial fix", () => {
  const review = reconcileGhostReview(
    startGhostReview(text, edits),
    text.replace("were", "was"),
  )!;
  assert.equal(
    reconcileGhostReview(review, review.text.replace("quiet", "busy")),
    null,
  );
});
test("resolved deletion and insertion regions accept further local editing", () => {
  for (const [original, before, after, manual] of [
    ["I walk today.", "walk", "walks", "walked"],
    ["A very very quiet day.", "very very", "very", "very nice"],
  ]) {
    const edit = {
      from: original.indexOf(before),
      to: original.indexOf(before) + before.length,
      before,
      after,
      kind: "fix" as const,
      reason: "Test.",
    };
    const review = startGhostReview(original, [edit]);
    const fixed = reconcileGhostReview(review, original.replace(before, after));
    assert.ok(fixed);
    assert.equal(pendingGhostSuggestions(fixed).length, 0);
    assert.ok(reconcileGhostReview(fixed, original.replace(before, manual)));
  }
});
test("Unicode offsets survive whitespace changes and corrections", () => {
  const original = "🌧️ باران. She go home. A calm day.";
  const from = original.indexOf("She go");
  const edit = {
    from,
    to: from + 6,
    before: "She go",
    after: "She goes",
    kind: "fix" as const,
    reason: "Agreement.",
  };
  const review = reconcileGhostReview(
    startGhostReview(original, [edit]),
    " 🌧️\nباران. She go home. A calm day.",
  )!;
  const pending = pendingGhostSuggestions(review)[0];
  assert.equal(
    review.text.slice(
      chosenGhostEdits(pending)[0].from,
      chosenGhostEdits(pending)[0].to,
    ),
    chosenGhostEdits(pending)[0].before,
  );
  assert.ok(
    reconcileGhostReview(review, review.text.replace("She go", "She goes")),
  );
});
test("a selected repeated quotation keeps its own anchor after whitespace changes", () => {
  const original = "He walk. He walk.";
  const edit = {
    from: 9,
    to: 17,
    before: "He walk.",
    after: "He walks.",
    kind: "fix" as const,
    reason: "Agreement.",
  };
  const spaced = reconcileGhostReview(
    startGhostReview(original, [edit]),
    "He walk.\n\nHe walk.",
  )!;
  const fixed = finishGhostReview(
    spaced,
    pendingGhostSuggestions(spaced).flatMap(chosenGhostEdits),
    1,
  )!;
  assert.equal(fixed.text, "He walk.\n\nHe walks.");
});
