/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { defaultSettings } from "../../lib/writing";
const modules = import.meta.glob("../../convex/**/*.{ts,js}");

test("account deletion removes snapshots, pending uploads, profile and settings while preserving another account", async () => {
  const t = convexTest(schema, modules);
  const profile = (userId: string) => ({
    userId,
    name: userId,
    email: `${userId}@example.com`,
    imageUrl: "https://example.com/avatar",
  });
  for (const id of ["a", "b"])
    await t.mutation(internal.users.login, profile(id));
  const upload = async (userId: string, ticket: string) => {
    await t.mutation(internal.desks.ticket, {
      userId,
      ticket,
      origin: "https://deckle.test",
    });
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob([`secret writing ${ticket}`])),
    );
    await t.mutation(internal.desks.uploaded, {
      ticket,
      storageId,
      settings: defaultSettings,
    });
    return storageId;
  };
  const a = await upload("a", "saved-a");
  const b = await upload("b", "saved-b");
  for (const [userId, storageId] of [
    ["a", a],
    ["b", b],
  ] as const)
    await t.mutation(internal.desks.save, {
      userId,
      storageId,
      baseRevision: 0,
      mutationId: userId,
    });
  const pending = await upload("a", "pending-a");
  await t.mutation(internal.desks.ticket, {
    userId: "a",
    ticket: "still-uploading",
    origin: "https://deckle.test",
  });
  expect(await t.mutation(internal.users.beginDeletion, { userId: "a" })).toBe(
    true,
  );
  for (const id of [a, pending])
    expect(await t.run((ctx) => ctx.storage.get(id))).toBeNull();
  expect(await t.run(async (ctx) => !!(await ctx.storage.get(b)))).toBe(true);
  await expect(
    t.mutation(internal.desks.ticket, {
      userId: "a",
      ticket: "new",
      origin: "https://deckle.test",
    }),
  ).rejects.toThrow(/unavailable/);
  await expect(
    t.mutation(internal.desks.save, {
      userId: "a",
      storageId: a,
      baseRevision: 1,
      mutationId: "stale",
    }),
  ).rejects.toThrow(/unavailable/);
  await expect(t.mutation(internal.users.login, profile("a"))).rejects.toThrow(
    /deletion/,
  );
  // An HTTP upload that started before deletion must discard its arriving file.
  const late = await t.run((ctx) =>
    ctx.storage.store(new Blob(["late words"])),
  );
  expect(
    await t.mutation(internal.desks.uploaded, {
      ticket: "still-uploading",
      storageId: late,
      settings: defaultSettings,
    }),
  ).toBe(false);
  expect(await t.run((ctx) => ctx.storage.get(late))).toBeNull();
  expect(await t.mutation(internal.users.finishDeletion, { userId: "a" })).toBe(
    true,
  );
  expect(await t.mutation(internal.users.finishDeletion, { userId: "a" })).toBe(
    true,
  );
  const remaining = await t.run(async (ctx) => ({
    users: await ctx.db.query("users").collect(),
    desks: await ctx.db.query("desks").collect(),
    uploads: await ctx.db.query("deskUploads").collect(),
  }));
  expect(remaining.users.map((u) => u.clerkUserId)).toEqual(["b"]);
  expect(remaining.desks.map((d) => d.userId)).toEqual(["b"]);
  expect(remaining.uploads).toHaveLength(0);
  expect((await t.query(internal.desks.get, { userId: "b" })).revision).toBe(1);
});

test("large pending-upload queues are completely erased through bounded batches", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.users.login, {
    userId: "a",
    name: "",
    email: "",
    imageUrl: "",
  });
  await t.run(async (ctx) => {
    for (let i = 0; i < 205; i++)
      await ctx.db.insert("deskUploads", {
        userId: "a",
        ticket: `ticket-${i}`,
        origin: "https://deckle.test",
        expiresAt: 1,
      });
  });
  expect(await t.mutation(internal.users.beginDeletion, { userId: "a" })).toBe(
    false,
  );
  expect(await t.mutation(internal.users.beginDeletion, { userId: "a" })).toBe(
    false,
  );
  expect(await t.mutation(internal.users.beginDeletion, { userId: "a" })).toBe(
    true,
  );
  await t.mutation(internal.users.finishDeletion, { userId: "a" });
  expect(await t.run((ctx) => ctx.db.query("deskUploads").collect())).toEqual(
    [],
  );
  expect(await t.run((ctx) => ctx.db.query("users").collect())).toEqual([]);
});
