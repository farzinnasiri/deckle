import {
  minimalGhostEdit,
  type GhostEdit,
  type GhostFinding,
  type GhostScope,
} from "./ghostwriter";

export type GhostSuggestion = GhostFinding & {
  id: number;
  selected: number;
  resolved: boolean;
  dismissed: boolean;
  /** Smallest word regions a writer can correct without invalidating the pass. */
  regions: GhostScope[];
};
type Snapshot = { text: string; suggestions: GhostSuggestion[] };
export type GhostReviewState = Snapshot & { history: Snapshot[] };

function correctionRegion(text: string, edit: GhostEdit): GhostScope {
  const change = minimalGhostEdit(edit);
  let from = change.from,
    to = change.to;
  const word = (character: string) =>
    /[\p{L}\p{N}\p{M}_'’\u200c-]/u.test(character);
  while (from > edit.from && word(text[from - 1])) from--;
  while (to < edit.to && word(text[to])) to++;
  return { from, to };
}
export function startGhostReview(
  text: string,
  findings: GhostFinding[],
): GhostReviewState {
  return {
    text,
    suggestions: findings.map((finding, id) => ({
      ...finding,
      id,
      selected: 0,
      resolved: false,
      dismissed: false,
      regions: finding.alternatives.flatMap((a) =>
        a.edits.map((edit) => correctionRegion(text, edit)),
      ),
    })),
    history: [],
  };
}
export const pendingGhostSuggestions = (review: GhostReviewState) =>
  review.suggestions.filter((s) => !s.resolved && !s.dismissed);
export function chosenGhostEdits(suggestion: GhostSuggestion): GhostEdit[] {
  if (
    suggestion.kind === "review" ||
    suggestion.resolved ||
    suggestion.dismissed
  )
    return [];
  return (suggestion.alternatives[suggestion.selected]?.edits ?? [])
    .map(minimalGhostEdit)
    .filter((edit) => edit.before !== edit.after);
}
export function chooseGhostAlternative(
  review: GhostReviewState,
  id: number,
  choice: number,
): GhostReviewState {
  return {
    ...review,
    suggestions: review.suggestions.map((s) =>
      s.id === id &&
      s.kind === "style" &&
      Number.isInteger(choice) &&
      choice >= 0 &&
      choice < s.alternatives.length
        ? { ...s, selected: choice }
        : s,
    ),
  };
}
export function dismissGhostFinding(
  review: GhostReviewState,
  id: number,
): GhostReviewState {
  return {
    ...review,
    suggestions: review.suggestions.map((s) =>
      s.id === id ? { ...s, dismissed: true } : s,
    ),
  };
}
/** Paper decorations share the editor's existing edit-highlighting path.
 * Feedback uses unchanged evidence, and never enters the application path. */
export function reviewGhostEdits(suggestions: GhostSuggestion[]) {
  const edits: GhostEdit[] = [],
    findingIds: number[] = [];
  for (const suggestion of suggestions) {
    const passages =
      suggestion.kind === "review"
        ? suggestion.anchors.map((a) => ({
            ...a,
            before: a.quote,
            after: a.quote,
            kind: suggestion.kind,
            reason: suggestion.reason,
          }))
        : (suggestion.alternatives[suggestion.selected]?.edits ?? []);
    for (const edit of passages) {
      edits.push(edit);
      findingIds.push(suggestion.id);
    }
  }
  return { edits, findingIds };
}
const whitespace = (character: string) => /\s/u.test(character);
const letters = (text: string) => text.replace(/\s/gu, "");
const remember = (review: GhostReviewState) =>
  [
    ...review.history,
    { text: review.text, suggestions: review.suggestions },
  ].slice(-40);

/** Unchanged snapshots, formatting and whitespace keep the review. Local fixes
 * resolve their own occurrences; unrelated prose requires a fresh reading. */
export function reconcileGhostReview(
  review: GhostReviewState,
  text: string,
): GhostReviewState | null {
  if (text === review.text) return review;
  const history = remember(review);
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
    for (let i = 0; i < text.length; i++)
      if (!whitespace(text[i])) positions.push(i);
    const counts = [0];
    for (let i = 0; i < review.text.length; i++)
      counts.push(counts.at(-1)! + (whitespace(review.text[i]) ? 0 : 1));
    map = (offset) => {
      if (offset === 0) return 0;
      if (offset === review.text.length) return text.length;
      const count = counts[offset];
      if (!whitespace(review.text[offset]))
        return positions[count] ?? text.length;
      const end = count ? positions[count - 1] + 1 : 0;
      return !whitespace(review.text[offset - 1])
        ? end
        : Math.min(positions[count] ?? text.length, end + 1);
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
    const contains = (region: GhostScope) => {
      let left = region.from,
        right = region.to;
      while (left > 0 && whitespace(review.text[left - 1])) left--;
      while (right < review.text.length && whitespace(review.text[right]))
        right++;
      return from >= left && to <= right;
    };
    const candidates = review.suggestions.filter((s) =>
      s.regions.some(contains),
    );
    if (candidates.length !== 1) return null;
    changed = candidates[0];
    map = (offset) =>
      offset <= from ? offset : offset >= to ? offset + delta : from;
  }
  const touched = (range: GhostScope) => from <= range.to && to >= range.from;
  const moveRange = (range: GhostScope, expand = false): GhostScope => ({
    from: expand ? Math.min(range.from, from) : map(range.from),
    to: expand ? Math.max(range.to, to) + delta : map(range.to),
  });
  const suggestions = review.suggestions.map((suggestion) => {
    const changedHere = suggestion === changed;
    // Grammar fixes preserve reader feedback. Rephrasing its evidence requires
    // the critic to read that passage again, rather than retain stale advice.
    const staleFeedback =
      suggestion.kind === "review" &&
      changed?.kind === "style" &&
      suggestion.anchors.some(touched);
    const alternatives = suggestion.alternatives.map((option) => ({
      ...option,
      edits: option.edits.flatMap((edit) => {
        const region = correctionRegion(review.text, edit);
        if (changedHere && touched(region)) return [];
        const change = minimalGhostEdit(edit);
        const range = moveRange(edit),
          minimal = moveRange(change);
        const before = text.slice(range.from, range.to);
        const after =
          text.slice(range.from, minimal.from) +
          change.after +
          text.slice(minimal.to, range.to);
        return before === after ? [] : [{ ...edit, ...range, before, after }];
      }),
    }));
    const anchors = suggestion.anchors.map((a) => {
      const range = moveRange(a, changedHere && touched(a));
      return { ...range, quote: text.slice(range.from, range.to) };
    });
    const regions = suggestion.regions.map((r) =>
      moveRange(r, changedHere && touched(r)),
    );
    return {
      ...suggestion,
      alternatives,
      anchors,
      regions,
      resolved:
        suggestion.resolved ||
        staleFeedback ||
        (suggestion.kind !== "review" &&
          !alternatives[suggestion.selected]?.edits.length),
    };
  });
  return { text, suggestions, history };
}

/** A completed playback may touch several occurrences of a single finding.
 * Keep the group's initial state as one editor undo step, however many edits. */
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
  return { ...next, history: remember(review) };
}
