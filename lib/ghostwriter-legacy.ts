import { ConvexError } from "convex/values";
import {
  minimalGhostEdit,
  type GhostPlan,
  type GhostRequest,
} from "./ghostwriter";

/** The published desk still reads a flat edit list. Coalesce overlapping
 * quotations so its existing validator can accept the recommended changes.
 * Remove this adapter once that frontend has moved to editorial findings. */
export function legacyGhostPlan(
  input: GhostRequest,
  plan: GhostPlan,
  styleKind: "wording" | "structure" = "wording",
) {
  const edits = plan.findings
    .flatMap((finding) => finding.alternatives[0]?.edits ?? [])
    .sort((a, b) => a.from - b.from);
  const groups: (typeof edits)[] = [];
  for (const edit of edits) {
    const previous = groups.at(-1);
    if (previous && edit.from < Math.max(...previous.map((e) => e.to)))
      previous.push(edit);
    else groups.push([edit]);
  }
  return {
    model: plan.model,
    edits: groups.map((group) => {
      const from = group[0].from,
        to = Math.max(...group.map((edit) => edit.to));
      const before = input.text.slice(from, to);
      let after = before;
      for (const edit of group
        .map(minimalGhostEdit)
        .sort((a, b) => b.from - a.from))
        after =
          after.slice(0, edit.from - from) +
          edit.after +
          after.slice(edit.to - from);
      if (after.length > 4000)
        throw new ConvexError({
          status: 422,
          message:
            "This older desk cannot display the complete editorial result. Your paper is unchanged. Refresh the desk and check again.",
        });
      return {
        from,
        to,
        before,
        after,
        reason: group
          .map((e) => e.reason)
          .join(" ")
          .slice(0, 160),
        kind: group.some((e) => e.kind === "style") ? styleKind : "grammar",
      };
    }),
  };
}
