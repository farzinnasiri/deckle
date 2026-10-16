/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
const modules = import.meta.glob("../../convex/**/*.{ts,js}");

test("feature assignments are per account, off by default and independent of profile updates", async () => {
  const t = convexTest(schema, modules);
  const login = (userId: string) =>
    t.mutation(internal.users.login, {
      userId,
      name: "Writer",
      email: "writer@example.com",
      imageUrl: "",
    });
  await login("owner");
  await login("tester");
  const flags = (userId: string) => t.query(internal.features.get, { userId });
  expect(await flags("owner")).toEqual({ ghostwriter: false });
  await t.mutation(internal.features.set, {
    userId: "owner",
    feature: "ghostwriter",
    enabled: true,
  });
  await login("owner");
  expect(await flags("owner")).toEqual({ ghostwriter: true });
  expect(await flags("tester")).toEqual({ ghostwriter: false });
  await t.mutation(internal.features.set, {
    userId: "tester",
    feature: "ghostwriter",
    enabled: true,
  });
  await t.mutation(internal.features.set, {
    userId: "owner",
    feature: "ghostwriter",
    enabled: false,
  });
  expect(await flags("tester")).toEqual({ ghostwriter: true });
  expect(await flags("owner")).toEqual({ ghostwriter: false });
});

test("unknown features and unavailable accounts cannot receive assignments", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(internal.features.set, {
      userId: "missing",
      feature: "ghostwriter",
      enabled: true,
    }),
  ).rejects.toThrow(/unavailable/);
  await expect(
    t.mutation(internal.features.set, {
      userId: "missing",
      feature: "invented",
      enabled: true,
    }),
  ).rejects.toThrow(/Unknown feature/);
});
