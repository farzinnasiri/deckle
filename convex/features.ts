import { v, ConvexError } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireActiveUser } from "./users";
import { featureFlags, featureNames } from "../lib/features";

export const get = internalQuery({
  args: { userId: v.string() },
  returns: v.record(v.string(), v.boolean()),
  handler: async (ctx, { userId }) => {
    const user = await requireActiveUser(ctx, userId);
    return featureFlags(user.features);
  },
});

/** Operator-only assignment, called through the authenticated Convex CLI. */
export const set = internalMutation({
  args: { userId: v.string(), feature: v.string(), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { userId, feature, enabled }) => {
    if (!featureNames.some((name) => name === feature))
      throw new ConvexError("Unknown feature.");
    const user = await requireActiveUser(ctx, userId);
    if ((user.features?.[feature] === true) === enabled) return null;
    await ctx.db.patch(user._id, {
      features: { ...user.features, [feature]: enabled },
    });
    return null;
  },
});
