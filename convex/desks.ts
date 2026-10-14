import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { deskSettings } from "./validators";
import { v, ConvexError } from "convex/values";
import { requireActiveUser } from "./users";
export const get = internalQuery({
  args: { userId: v.string() },
  returns: v.object({
    revision: v.number(),
    url: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { userId }) => {
    await requireActiveUser(ctx, userId);
    const desk = await ctx.db
      .query("desks")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return {
      revision: desk?.revision ?? 0,
      url: desk ? await ctx.storage.getUrl(desk.storageId) : null,
    };
  },
});
export const ticket = internalMutation({
  args: { userId: v.string(), ticket: v.string(), origin: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireActiveUser(ctx, args.userId);
    const expiryJob = await ctx.scheduler.runAfter(
      600000,
      internal.desks.expire,
      {
        ticket: args.ticket,
      },
    );
    await ctx.db.insert("deskUploads", {
      ...args,
      expiresAt: Date.now() + 300000,
      expiryJob,
    });
    return null;
  },
});
export const uploadTicket = internalQuery({
  args: { ticket: v.string(), now: v.number() },
  returns: v.union(
    v.object({ userId: v.string(), origin: v.string() }),
    v.null(),
  ),
  handler: async (ctx, a) => {
    const ticket = await ctx.db
      .query("deskUploads")
      .withIndex("by_ticket", (q) => q.eq("ticket", a.ticket))
      .unique();
    return ticket && !ticket.storageId && ticket.expiresAt > a.now
      ? { userId: ticket.userId, origin: ticket.origin }
      : null;
  },
});
export const uploaded = internalMutation({
  args: {
    ticket: v.string(),
    storageId: v.id("_storage"),
    settings: deskSettings,
  },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    const ticket = await ctx.db
      .query("deskUploads")
      .withIndex("by_ticket", (q) => q.eq("ticket", a.ticket))
      .unique();
    if (!ticket || ticket.storageId || ticket.expiresAt < Date.now()) {
      await ctx.storage.delete(a.storageId);
      return false;
    }
    await ctx.db.patch(ticket._id, {
      storageId: a.storageId,
      settings: a.settings,
    });
    return true;
  },
});
export const save = internalMutation({
  args: {
    userId: v.string(),
    storageId: v.id("_storage"),
    baseRevision: v.number(),
    mutationId: v.string(),
  },
  returns: v.object({ revision: v.number() }),
  handler: async (ctx, a) => {
    await requireActiveUser(ctx, a.userId);
    const desk = await ctx.db
      .query("desks")
      .withIndex("by_userId", (q) => q.eq("userId", a.userId))
      .unique();
    if (desk?.mutationId === a.mutationId) return { revision: desk.revision };
    const upload = await ctx.db
      .query("deskUploads")
      .withIndex("by_userId_and_storageId", (q) =>
        q.eq("userId", a.userId).eq("storageId", a.storageId),
      )
      .unique();
    if (!upload)
      throw new ConvexError({
        message: "This upload belongs to another account or has expired.",
        status: 403,
      });
    if (
      !Number.isSafeInteger(a.baseRevision) ||
      a.baseRevision !== (desk?.revision ?? 0)
    )
      throw new ConvexError({
        message:
          "This desk changed in another browser. Both copies are safe; combine them before saving.",
        status: 409,
      });
    const revision = (desk?.revision ?? 0) + 1;
    const value = {
      userId: a.userId,
      storageId: a.storageId,
      revision,
      mutationId: a.mutationId,
      updatedAt: Date.now(),
    };
    if (desk) {
      await ctx.db.patch(desk._id, value);
      await ctx.storage.delete(desk.storageId);
    } else await ctx.db.insert("desks", value);
    if (upload.settings) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", a.userId))
        .unique();
      if (user)
        await ctx.db.patch(user._id, {
          settings: upload.settings,
          settingsRevision: user.settingsRevision + 1,
          settingsMutationId: a.mutationId,
        });
    }
    if (upload.expiryJob) await ctx.scheduler.cancel(upload.expiryJob);
    await ctx.db.delete(upload._id);
    return { revision };
  },
});

export const expire = internalMutation({
  args: { ticket: v.string() },
  returns: v.null(),
  handler: async (ctx, { ticket }) => {
    const upload = await ctx.db
      .query("deskUploads")
      .withIndex("by_ticket", (q) => q.eq("ticket", ticket))
      .unique();
    if (upload) {
      if (upload.storageId) await ctx.storage.delete(upload.storageId);
      await ctx.db.delete(upload._id);
    }
    return null;
  },
});
