import { minimalGhostEdit, type GhostEdit } from "./ghostwriter";

export type GhostSuggestion = {
  id: number;
  edit: GhostEdit;
  change: GhostEdit;
  region: { from: number; to: number };
  resolved: boolean;
};
type Snapshot = { text: string; suggestions: GhostSuggestion[] };
export type GhostReviewState = Snapshot & { history: Snapshot[] };

export function startGhostReview(
  text: string,
  edits: GhostEdit[],
): GhostReviewState {
  return {
    text,
    suggestions: edits.map((edit, id) => {
      const change = minimalGhostEdit(edit);
      let from = change.from,
        to = change.to;
      const word = (character: string) =>
        /[\p{L}\p{N}\p{M}_'’\u200c-]/u.test(character);
      while (from > edit.from && word(text[from - 1])) from--;
      while (to < edit.to && word(text[to])) to++;
      return { id, edit, change, region: { from, to }, resolved: false };
    }),
    history: [],
  };
}
export const pendingGhostSuggestions = (review: GhostReviewState) =>
  review.suggestions.filter((suggestion) => !suggestion.resolved);

const whitespace = (character: string) => /\s/u.test(character);
const letters = (text: string) => text.replace(/\s/gu, "");

/** Text, rather than mark-array identity, owns a pass. Only its correction
 * regions may change; whitespace can change anywhere. Keep a short in-memory
 * history so normal editor undo/redo restores the corresponding suggestions. */
export function reconcileGhostReview(
  review: GhostReviewState,
  text: string,
): GhostReviewState | null {
  if (text === review.text) return review;
  const history = [
    ...review.history,
    { text: review.text, suggestions: review.suggestions },
  ].slice(-40);
  const previous = review.history.findLast(
    (snapshot) => snapshot.text === text,
  );
  if (previous) return { ...previous, history };

  let map: (offset: number) => number;
  let changed: GhostSuggestion | undefined;
  let from = 0,
    to = 0,
    delta = 0;
  if (letters(text) === letters(review.text)) {
    const positions: number[] = [];
    for (let index = 0; index < text.length; index++)
      if (!whitespace(text[index])) positions.push(index);
    const counts = [0];
    for (const character of review.text) {
      // Offsets remain UTF-16, matching CodeMirror and the model contract.
      for (let i = 0; i < character.length; i++)
        counts.push(counts.at(-1)! + (whitespace(character) ? 0 : 1));
    }
    map = (offset) => {
      if (offset === 0) return 0;
      if (offset === review.text.length) return text.length;
      const count = counts[offset];
      if (!whitespace(review.text[offset]))
        return positions[count] ?? text.length;
      const end = count ? positions[count - 1] + 1 : 0;
      if (!whitespace(review.text[offset - 1])) return end;
      return Math.min(positions[count] ?? text.length, end + 1);
    };
  } else {
    const before = Array.from(review.text),
      after = Array.from(text);
    let start = 0,
      endBefore = before.length,
      endAfter = after.length;
    while (
      start < endBefore &&
      start < endAfter &&
      before[start] === after[start]
    )
      start++;
    while (
      endBefore > start &&
      endAfter > start &&
      before[endBefore - 1] === after[endAfter - 1]
    ) {
      endBefore--;
      endAfter--;
    }
    from = before.slice(0, start).join("").length;
    to = from + before.slice(start, endBefore).join("").length;
    delta = text.length - review.text.length;
    const candidates = review.suggestions.filter(({ region }) => {
      let left = region.from,
        right = region.to;
      while (left > 0 && whitespace(review.text[left - 1])) left--;
      while (right < review.text.length && whitespace(review.text[right]))
        right++;
      return from >= left && to <= right;
    });
    if (candidates.length !== 1) return null;
    changed = candidates[0];
    map = (offset) =>
      offset <= from ? offset : offset >= to ? offset + delta : from;
  }
  const suggestions = review.suggestions.map((suggestion) => {
    const touched = suggestion === changed;
    const changeFrom = touched
      ? Math.min(suggestion.change.from, from)
      : map(suggestion.change.from);
    const changeTo = touched
      ? Math.max(suggestion.change.to, to) + delta
      : map(suggestion.change.to);
    const editFrom = touched
      ? Math.min(suggestion.edit.from, from)
      : map(suggestion.edit.from);
    const editTo = touched
      ? Math.max(suggestion.edit.to, to) + delta
      : map(suggestion.edit.to);
    const before = text.slice(changeFrom, changeTo);
    const resolved =
      suggestion.resolved || touched || before === suggestion.change.after;
    const change = {
      ...suggestion.change,
      from: changeFrom,
      to: changeTo,
      before,
    };
    const edit = {
      ...suggestion.edit,
      from: editFrom,
      to: editTo,
      before: text.slice(editFrom, editTo),
      after:
        text.slice(editFrom, changeFrom) +
        change.after +
        text.slice(changeTo, editTo),
    };
    const region = {
      from: touched
        ? Math.min(suggestion.region.from, from)
        : map(suggestion.region.from),
      to: touched
        ? Math.max(suggestion.region.to, to) + delta
        : map(suggestion.region.to),
    };
    return { ...suggestion, edit, change, region, resolved };
  });
  return { text, suggestions, history };
}

/** Playback runs backwards and reports completed corrections. Reconcile those
 * as complete transactions, never its transient erasure/retyping frames. */
export function finishGhostReview(
  review: GhostReviewState,
  edits: GhostEdit[],
  completed: number,
) {
  let next: GhostReviewState | null = review;
  for (const edit of [...edits]
    .sort((a, b) => b.from - a.from)
    .slice(0, completed)) {
    if (!next) break;
    next = reconcileGhostReview(
      next,
      next.text.slice(0, edit.from) + edit.after + next.text.slice(edit.to),
    );
  }
  if (!next || next === review) return next;
  // Fix all is one editor undo step, regardless of its correction count.
  // Intermediate playback states must not crowd out the group's start.
  return {
    ...next,
    history: [
      ...review.history,
      { text: review.text, suggestions: review.suggestions },
    ].slice(-40),
  };
}
