/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { defaultSettings } from "../../lib/writing";
const modules = import.meta.glob("../../convex/**/*.{ts,js}");
test("cloud revisions prevent stale overwrites and uploads cannot cross accounts", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.users.login, {
    userId: "a",
    name: "A",
    email: "a@example.com",
    imageUrl: "",
  });
  await t.mutation(internal.users.login, {
    userId: "b",
    name: "B",
    email: "b@example.com",
    imageUrl: "",
  });
  await t.mutation(internal.desks.ticket, {
    userId: "a",
    ticket: "first",
    origin: "https://deckle.localhost",
  });
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["snapshot"])),
  );
  await t.mutation(internal.desks.uploaded, {
    ticket: "first",
    storageId,
    settings: defaultSettings,
  });
  await expect(
    t.mutation(internal.desks.save, {
      userId: "b",
      storageId,
      baseRevision: 0,
      mutationId: "one",
    }),
  ).rejects.toThrow(/another account/);
  const args = { userId: "a", storageId, baseRevision: 0, mutationId: "one" };
  expect(await t.mutation(internal.desks.save, args)).toEqual({ revision: 1 });
  expect(await t.mutation(internal.desks.save, args)).toEqual({ revision: 1 });
  expect((await t.query(internal.desks.get, { userId: "b" })).url).toBeNull();
  await t.mutation(internal.desks.ticket, {
    userId: "a",
    ticket: "second",
    origin: "https://deckle.localhost",
  });
  const secondId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["second"])),
  );
  await t.mutation(internal.desks.uploaded, {
    ticket: "second",
    storageId: secondId,
    settings: defaultSettings,
  });
  await expect(
    t.mutation(internal.desks.save, {
      userId: "a",
      storageId: secondId,
      baseRevision: 0,
      mutationId: "two",
    }),
  ).rejects.toThrow(/another browser/);
  expect((await t.query(internal.desks.get, { userId: "a" })).revision).toBe(1);
  const user = await t.run((ctx) =>
    ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", "a"))
      .unique(),
  );
  expect(user?.settings).toEqual(defaultSettings);
});
