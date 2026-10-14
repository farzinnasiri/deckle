import { internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { deskSettings } from "./validators";
const preferences = v.object({
  settings: v.union(deskSettings, v.null()),
  revision: v.number(),
});
export async function requireActiveUser(
  ctx: MutationCtx | QueryCtx,
  userId: string,
) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
    .unique();
  if (!user || user.deleting)
    throw new ConvexError({
      message: "This account is unavailable. Sign in again.",
      status: 401,
    });
  return user;
}

async function eraseDesk(ctx: MutationCtx, userId: string) {
  const desks = await ctx.db
    .query("desks")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(100);
  const uploads = await ctx.db
    .query("deskUploads")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(100);
  const files = new Set([
    ...desks.map((d) => d.storageId),
    ...uploads.flatMap((u) => (u.storageId ? [u.storageId] : [])),
  ]);
  for (const id of files) await ctx.storage.delete(id);
  for (const upload of uploads) {
    if (upload.expiryJob) await ctx.scheduler.cancel(upload.expiryJob);
    await ctx.db.delete(upload._id);
  }
  for (const desk of desks) await ctx.db.delete(desk._id);
  return desks.length < 100 && uploads.length < 100;
}

// Only the authenticated server bridge calls these. The temporary gate prevents
// uploads from repopulating the desk while Clerk deletion is in progress.
export const beginDeletion = internalMutation({
  args: { userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
      .unique();
    if (user)
      await ctx.db.patch(user._id, {
        deleting: true,
        name: "",
        email: "",
        imageUrl: "",
        settings: null,
        settingsRevision: 0,
        settingsMutationId: null,
      });
    return eraseDesk(ctx, userId);
  },
});
export const finishDeletion = internalMutation({
  args: { userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId }) => {
    if (!(await eraseDesk(ctx, userId))) return false;
    const users = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
      .collect();
    for (const user of users) await ctx.db.delete(user._id);
    return true;
  },
});
export const login = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    email: v.string(),
    imageUrl: v.string(),
  },
  returns: preferences,
  handler: async (ctx, a) => {
    const current = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", a.userId))
      .unique();
    const profile = {
      name: a.name.slice(0, 200),
      email: a.email.slice(0, 320),
      imageUrl: a.imageUrl.slice(0, 2000),
      lastLoginAt: Date.now(),
    };
    if (current?.deleting)
      throw new ConvexError({
        message: "Account deletion is in progress.",
        status: 409,
      });
    if (current) {
      await ctx.db.patch(current._id, profile);
      return { settings: current.settings, revision: current.settingsRevision };
    }
    await ctx.db.insert("users", {
      clerkUserId: a.userId,
      ...profile,
      settings: null,
      settingsRevision: 0,
      settingsMutationId: null,
    });
    return { settings: null, revision: 0 };
  },
});
