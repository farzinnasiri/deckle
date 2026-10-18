import test from "node:test";
import assert from "node:assert/strict";
import {
  ghostFindings,
  ghostHighlight,
  type GhostRequest,
} from "../lib/ghostwriter";
import {
  startGhostReview,
  chooseGhostAlternative,
  dismissGhostFinding,
  chosenGhostEdits,
  pendingGhostSuggestions,
  reconcileGhostReview,
  finishGhostReview,
  reviewGhostEdits,
} from "../lib/ghost-review";

const text =
  "She have a dog. At this point in time, I was really tired. It was really cold. Mara left.";
const input = (value = text): GhostRequest => ({
  text: value,
  scope: { from: 0, to: value.length },
  options: { fix: true, style: true, review: true },
  protected: [],
});
const fix = {
  kind: "fix",
  title: "Verb agreement",
  reason: "Match the singular subject.",
  anchors: ["She have a dog."],
  alternatives: [
    { label: "Correction", edits: [{ before: "She have", after: "She has" }] },
  ],
};
const style = {
  kind: "style",
  title: "Repeated emphasis",
  reason: "Two nearby uses of really weaken the emphasis.",
  anchors: ["I was really tired.", "It was really cold."],
  alternatives: [
    {
      label: "Trim the repetition",
      edits: [
        { before: "I was really tired.", after: "I was tired." },
        { before: "It was really cold.", after: "It was cold." },
      ],
    },
    {
      label: "Keep the intensity",
      edits: [
        { before: "I was really tired.", after: "I was exhausted." },
        { before: "It was really cold.", after: "It was freezing." },
      ],
    },
  ],
};
const feedback = {
  kind: "review",
  title: "An abrupt departure",
  reason:
    "I cannot tell why Mara leaves or how her departure relates to this scene.",
  anchors: ["Mara left."],
  alternatives: [],
};
const findings = () =>
  ghostFindings(input(), { findings: [fix, style, feedback] });

test("a mixed editorial pass anchors fixes, alternatives and non-executable feedback", () => {
  const found = findings();
  assert.equal(found.length, 3);
  assert.equal(found[1].alternatives.length, 2);
  assert.equal(found[1].alternatives[0].edits.length, 2);
  const review = startGhostReview(text, found);
  assert.deepEqual(chosenGhostEdits(review.suggestions[2]), []);
  const highlights = reviewGhostEdits(review.suggestions);
  assert.deepEqual(highlights.findingIds, [0, 1, 1, 2]);
  assert.deepEqual(
    ghostHighlight(highlights.edits[3]),
    found[2].anchors[0] && {
      from: found[2].anchors[0].from,
      to: found[2].anchors[0].to,
    },
  );
});
test("choosing a nonrecommended alternative changes no ink and Apply all respects it", () => {
  const initial = startGhostReview(text, findings());
  const selected = chooseGhostAlternative(initial, 1, 1);
  assert.equal(selected.text, text);
  const edits = pendingGhostSuggestions(selected).flatMap(chosenGhostEdits);
  const finished = finishGhostReview(selected, edits, edits.length)!;
  assert.ok(finished);
  assert.equal(
    finished.text,
    text
      .replace("have", "has")
      .replace("really tired", "exhausted")
      .replace("really cold", "freezing"),
  );
  assert.deepEqual(
    pendingGhostSuggestions(finished).map((s) => s.kind),
    ["review"],
  );
  const undo = reconcileGhostReview(finished, text)!;
  assert.equal(undo.suggestions[1].selected, 1);
  assert.equal(pendingGhostSuggestions(undo).length, 3);
  const redo = reconcileGhostReview(undo, finished.text)!;
  assert.equal(pendingGhostSuggestions(redo).length, 1);
});
test("dismissed corrections and style suggestions never enter bulk application", () => {
  let review = startGhostReview(text, findings());
  review = dismissGhostFinding(review, 0);
  review = dismissGhostFinding(review, 1);
  assert.deepEqual(
    pendingGhostSuggestions(review).flatMap(chosenGhostEdits),
    [],
  );
  assert.equal(pendingGhostSuggestions(review).length, 1);
  review = dismissGhostFinding(review, 2);
  assert.equal(pendingGhostSuggestions(review).length, 0);
  assert.equal(review.text, text);
});
test("manual correction of one occurrence keeps the remaining pattern and alternatives", () => {
  const review = startGhostReview(text, findings());
  const updated = reconcileGhostReview(
    review,
    text.replace("really tired", "tired"),
  )!;
  assert.ok(updated);
  assert.equal(pendingGhostSuggestions(updated).length, 3);
  const pattern = updated.suggestions[1];
  assert.equal(pattern.alternatives[0].edits.length, 1);
  assert.equal(pattern.alternatives[1].edits.length, 1);
  const edit = chosenGhostEdits(pattern)[0];
  assert.equal(updated.text.slice(edit.from, edit.to), edit.before);
  const done = finishGhostReview(updated, [edit], 1)!;
  assert.equal(done.suggestions[1].resolved, true);
  assert.equal(done.text.includes("really"), false);
});
test("grammar preserves reader feedback, while rephrasing its evidence invalidates it", () => {
  const attached = {
    ...feedback,
    anchors: ["She have a dog.", "I was really tired."],
  };
  const review = startGhostReview(
    text,
    ghostFindings(input(), { findings: [fix, style, attached] }),
  );
  const fixed = finishGhostReview(
    review,
    chosenGhostEdits(review.suggestions[0]),
    1,
  )!;
  assert.ok(pendingGhostSuggestions(fixed).some((s) => s.kind === "review"));
  const styled = finishGhostReview(
    fixed,
    chosenGhostEdits(fixed.suggestions.find((s) => s.kind === "style")!),
    2,
  )!;
  assert.ok(styled);
  assert.equal(
    pendingGhostSuggestions(styled).some((s) => s.kind === "review"),
    false,
  );
});
test("whitespace rebases every alternative and reader anchor without changing selections", () => {
  const original = chooseGhostAlternative(
    startGhostReview(text, findings()),
    1,
    1,
  );
  const spaced = reconcileGhostReview(
    original,
    "  " + text.replace(". At", ".\n\nAt"),
  )!;
  assert.ok(spaced);
  assert.equal(spaced.suggestions[1].selected, 1);
  for (const s of spaced.suggestions) {
    for (const a of s.anchors)
      assert.equal(spaced.text.slice(a.from, a.to), a.quote);
    for (const a of s.alternatives)
      for (const e of a.edits)
        assert.equal(spaced.text.slice(e.from, e.to), e.before);
  }
});
test("feedback-only passes are valid and cannot create any editing operation", () => {
  const request = {
    ...input(),
    options: { fix: false, style: false, review: true },
  };
  const review = startGhostReview(
    text,
    ghostFindings(request, { findings: [feedback] }),
  );
  assert.equal(pendingGhostSuggestions(review).length, 1);
  assert.deepEqual(
    pendingGhostSuggestions(review).flatMap(chosenGhostEdits),
    [],
  );
});
test("invalid alternative counts, duplicated rewrites and unanchored advice are rejected", () => {
  assert.throws(
    () =>
      ghostFindings(
        { ...input(), options: { fix: false, style: false, review: true } },
        { findings: [fix] },
      ),
    /beyond/,
  );
  for (const finding of [
    { ...fix, alternatives: [] },
    { ...fix, alternatives: [fix.alternatives[0], fix.alternatives[0]] },
    { ...style, alternatives: Array(4).fill(style.alternatives[0]) },
    { ...style, alternatives: [style.alternatives[0], style.alternatives[0]] },
    { ...feedback, alternatives: fix.alternatives },
    {
      ...style,
      alternatives: [
        {
          label: "Short context",
          edits: [{ before: "really tired", after: "tired" }],
        },
        {
          label: "Full context",
          edits: [{ before: "I was really tired.", after: "I was tired." }],
        },
      ],
    },
    { ...feedback, anchors: [] },
    { ...feedback, anchors: ["Invented quotation."] },
    { ...style, anchors: ["Mara left."] },
  ])
    assert.throws(() => ghostFindings(input(), { findings: [finding] }));
});
test("conflicts are checked across every alternative, not just the recommended choice", () => {
  const conflict = {
    ...style,
    anchors: ["She have a dog.", ...style.anchors],
    alternatives: [
      style.alternatives[0],
      {
        label: "Conflicting variant",
        edits: [{ before: "She have", after: "She owns" }],
      },
    ],
  };
  assert.throws(
    () => ghostFindings(input(), { findings: [fix, conflict] }),
    /overlap/,
  );
});
test("quotes and feedback respect the editable selection and protected clippings", () => {
  assert.throws(
    () =>
      ghostFindings(
        {
          ...input(),
          protected: [{ from: text.indexOf("Mara"), to: text.length }],
        },
        { findings: [feedback] },
      ),
    /clipping/,
  );
  assert.throws(
    () =>
      ghostFindings(
        { ...input(), scope: { from: 0, to: 15 } },
        { findings: [feedback] },
      ),
    /exactly/,
  );
  const forged = {
    ...feedback,
    anchors: [{ from: 0, to: 2, quote: "Mara left." }],
  };
  const anchored = ghostFindings(input(), { findings: [forged] });
  assert.equal(anchored[0].anchors[0].from, text.indexOf("Mara"));
});

test("adjacent independent changes are valid while two insertions at one point conflict", () => {
  const original = "ab";
  const make = (before: string, after: string) => ({
    kind: "style",
    title: "A change",
    reason: "Test.",
    anchors: [before],
    alternatives: [{ label: "Alternative", edits: [{ before, after }] }],
  });
  assert.equal(
    ghostFindings(input(original), {
      findings: [make("a", "x"), make("b", "y")],
    }).length,
    2,
  );
  assert.throws(
    () =>
      ghostFindings(input(original), {
        findings: [make("a", "az"), make("ab", "azb")],
      }),
    /overlap/,
  );
});

test("playback refuses reader feedback before moving the carriage or writing", async () => {
  const { playGhostEdits } = await import("../lib/ghost-playback");
  let writes = 0,
    moves = 0;
  const result = await playGhostEdits(
    [
      {
        from: 0,
        to: 3,
        before: "abc",
        after: "xyz",
        kind: "review",
        reason: "Feedback",
      },
    ],
    {
      text: () => "abc",
      available: () => true,
      move: () => {
        moves++;
      },
      write: () => {
        writes++;
      },
      checkpoint: () => () => {},
      voice: () => {},
    },
    {
      signal: new AbortController().signal,
      reduced: () => true,
      progress: () => {},
    },
  );
  assert.equal(writes, 0);
  assert.equal(moves, 0);
  assert.equal(result.completed, 0);
  assert.match(result.error!, /feedback cannot/);
});

test("the published desk receives non-overlapping quotations when findings share context", async () => {
  const { legacyGhostPlan } = await import("../lib/ghostwriter-legacy");
  const original =
    "At this point in time, I didn't want another additional problem.";
  const make = (before: string, after: string) => ({
    kind: "style",
    title: "Tighten the phrase",
    reason: "Remove redundancy.",
    anchors: [before],
    alternatives: [{ label: "Trim", edits: [{ before, after }] }],
  });
  const request = input(original);
  const found = ghostFindings(request, {
    findings: [
      make(
        "At this point in time, I didn't want",
        "At that moment, I didn't want",
      ),
      make(
        "I didn't want another additional problem.",
        "I didn't want another problem.",
      ),
    ],
  });
  const legacy = legacyGhostPlan(request, {
    model: "fixture",
    findings: found,
  });
  assert.equal(legacy.edits.length, 1);
  assert.equal(
    legacy.edits[0].after,
    "At that moment, I didn't want another problem.",
  );
  assert.equal(legacy.edits[0].kind, "wording");
  assert.equal(legacy.edits[0].before, original);
});
