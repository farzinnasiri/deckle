import test from "node:test";
import assert from "node:assert/strict";
import { ghostEdits, type GhostRequest } from "../lib/ghostwriter";
import {
  startGhostReview,
  reconcileGhostReview,
  pendingGhostSuggestions,
  finishGhostReview,
} from "../lib/ghost-review";

const text = "The rain were loud. The owner have a dog. A quiet afternoon.";
const input: GhostRequest = {
  text,
  scope: { from: 0, to: text.length },
  options: { grammar: true, wording: true, structure: true },
  protected: [],
};
const edits = ghostEdits(input, {
  edits: [
    {
      before: "rain were",
      after: "rain was",
      kind: "grammar",
      reason: "Agreement.",
    },
    {
      before: "owner have",
      after: "owner has",
      kind: "grammar",
      reason: "Agreement.",
    },
  ],
});
test("rehydrated copies of unchanged paper keep the review", () => {
  const review = startGhostReview(text, edits);
  assert.equal(
    reconcileGhostReview(review, JSON.parse(JSON.stringify(text))),
    review,
  );
});
test("a manual correction keeps other suggestions and undo restores the corrected item", () => {
  const review = startGhostReview(text, edits);
  const corrected = text.replace("were", "was");
  const next = reconcileGhostReview(review, corrected)!;
  assert.ok(next);
  assert.equal(pendingGhostSuggestions(next).length, 1);
  const remaining = pendingGhostSuggestions(next)[0].edit;
  assert.equal(corrected.slice(remaining.from, remaining.to), remaining.before);
  assert.equal(remaining.before, "owner have");
  assert.equal(
    pendingGhostSuggestions(reconcileGhostReview(next, text)!).length,
    2,
  );
});
test("successive keystrokes in the correction remain allowed after the item is resolved", () => {
  let review = startGhostReview(text, edits);
  for (const word of ["wr", "w", "was", "wasn't"]) {
    const next = reconcileGhostReview(review, text.replace("were", word));
    assert.ok(next, word);
    review = next;
    assert.equal(pendingGhostSuggestions(review).length, 1);
  }
});
test("selecting and retyping a whole incorrect word keeps other suggestions", () => {
  let review = startGhostReview(text, edits);
  for (const word of ["h", "ha", "has"]) {
    const next = reconcileGhostReview(review, text.replace("have", word));
    assert.ok(next, word);
    review = next;
    assert.equal(pendingGhostSuggestions(review).length, 1);
  }
});
test("partial playback resolves only completed corrections and undo restores the pass", () => {
  const review = startGhostReview(text, edits);
  const changes = pendingGhostSuggestions(review).map((s) => s.change);
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
        kind: "grammar",
        reason: "Agreement.",
      })),
    },
  );
  const review = startGhostReview(original, edits);
  const one = finishGhostReview(review, [review.suggestions[0].change], 1)!;
  const all = finishGhostReview(
    one,
    pendingGhostSuggestions(one).map((s) => s.change),
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
test("spaces and paragraph breaks rebase anchors without reverting the writer's layout", () => {
  const changed =
    "  The rain were loud.\n\nThe  owner have a dog. A quiet afternoon.\n";
  const next = reconcileGhostReview(startGhostReview(text, edits), changed)!;
  assert.ok(next);
  assert.equal(pendingGhostSuggestions(next).length, 2);
  for (const { edit, change } of pendingGhostSuggestions(next)) {
    assert.equal(changed.slice(edit.from, edit.to), edit.before);
    assert.equal(changed.slice(change.from, change.to), change.before);
  }
  assert.equal(pendingGhostSuggestions(next)[1].edit.after, "owner has");
});
test("changes to context inside a model quotation invalidate the pass", () => {
  assert.equal(
    reconcileGhostReview(
      startGhostReview(text, edits),
      text.replace("rain", "storm"),
    ),
    null,
  );
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
      kind: "grammar" as const,
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
    kind: "grammar" as const,
    reason: "Agreement.",
  };
  const review = reconcileGhostReview(
    startGhostReview(original, [edit]),
    " 🌧️\nباران. She go home. A calm day.",
  )!;
  const pending = pendingGhostSuggestions(review)[0];
  assert.equal(
    review.text.slice(pending.change.from, pending.change.to),
    pending.change.before,
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
    kind: "grammar" as const,
    reason: "Agreement.",
  };
  const spaced = reconcileGhostReview(
    startGhostReview(original, [edit]),
    "He walk.\n\nHe walk.",
  )!;
  const fixed = finishGhostReview(
    spaced,
    pendingGhostSuggestions(spaced).map((item) => item.change),
    1,
  )!;
  assert.equal(fixed.text, "He walk.\n\nHe walks.");
});
