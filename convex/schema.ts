import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { deskSettings } from "./validators";
export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    name: v.string(),
    email: v.string(),
    imageUrl: v.string(),
    lastLoginAt: v.number(),
    settings: v.union(deskSettings, v.null()),
    settingsRevision: v.number(),
    settingsMutationId: v.union(v.string(), v.null()),
    deleting: v.optional(v.boolean()),
    features: v.optional(v.record(v.string(), v.boolean())),
    ghostwriter: v.optional(
      v.object({
        day: v.string(),
        count: v.number(),
        startedAt: v.number(),
        requestId: v.optional(v.string()),
      }),
    ),
  }).index("by_clerkUserId", ["clerkUserId"]),
  desks: defineTable({
    userId: v.string(),
    storageId: v.id("_storage"),
    revision: v.number(),
    mutationId: v.string(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
  deskUploads: defineTable({
    userId: v.string(),
    ticket: v.string(),
    origin: v.string(),
    expiresAt: v.number(),
    storageId: v.optional(v.id("_storage")),
    settings: v.optional(deskSettings),
    expiryJob: v.optional(v.id("_scheduled_functions")),
  })
    .index("by_ticket", ["ticket"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_storageId", ["userId", "storageId"]),
});
