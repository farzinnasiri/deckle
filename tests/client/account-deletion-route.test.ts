import { beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  userId: "user_a" as string | null,
  cookies: new Map<string, string>(),
  cloud: vi.fn(),
  identity: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.userId }),
  clerkClient: async () => ({ users: { deleteUser: state.identity } }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name) ? { value: state.cookies.get(name) } : undefined,
    getAll: () => [...state.cookies].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => state.cookies.set(name, value),
    delete: (name: string) => state.cookies.delete(name),
  }),
}));
vi.mock("@/lib/cloud/backend", () => ({ backend: state.cloud }));
import { DELETE } from "../../app/api/account/route";
import {
  DELETION_COOKIE,
  readDeletionReceipt,
} from "../../lib/account-deletion";

beforeEach(() => {
  state.userId = "user_a";
  state.cookies.clear();
  state.cloud.mockReset().mockResolvedValue(true);
  state.identity.mockReset().mockResolvedValue({});
  vi.stubEnv("APP_URL", "https://deckle.test");
  vi.stubEnv("CLERK_SECRET_KEY", "test-secret");
});
function request(
  account = "user_a",
  origin = "https://deckle.test",
  confirmation = "DELETE",
) {
  return new Request("https://deckle.test/api/account", {
    method: "DELETE",
    headers: {
      Origin: origin,
      "X-Deckle-Account": account,
      "X-Deckle-Confirm": confirmation,
    },
  });
}

test("cross-origin requests, missing confirmation and a changed account cannot delete data", async () => {
  for (const req of [
    request("user_a", "https://attacker.test"),
    request("user_a", "https://deckle.test", ""),
    request("user_b"),
  ])
    expect((await DELETE(req)).status).toBe(403);
  expect(state.cloud).not.toHaveBeenCalled();
  expect(state.identity).not.toHaveBeenCalled();
  state.userId = null;
  expect((await DELETE(request())).status).toBe(401);
});

test("a successful deletion removes identity, finishes cloud cleanup and expires browser cookies", async () => {
  state.cookies.set("__session", "session");
  const response = await DELETE(request());
  expect(response.status).toBe(200);
  expect(state.cloud.mock.calls).toEqual([
    ["begin-deletion", { userId: "user_a" }],
    ["finish-deletion", { userId: "user_a" }],
  ]);
  expect(state.identity).toHaveBeenCalledWith("user_a");
  expect(state.cookies.size).toBe(0);
  expect(response.headers.get("Clear-Site-Data")).toBe(
    '"cache", "cookies", "storage"',
  );
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

test("an interrupted cleanup can finish after Clerk no longer recognizes the account", async () => {
  state.cloud
    .mockResolvedValueOnce(true)
    .mockRejectedValueOnce(new Error("outage"));
  const failed = await DELETE(request());
  expect(failed.status).toBe(503);
  expect(failed.headers.get("Clear-Site-Data")).toBeNull();
  expect(
    readDeletionReceipt(state.cookies.get(DELETION_COOKIE), "test-secret"),
  ).toBe("user_a");
  state.userId = null;
  state.identity.mockRejectedValue({ status: 404 });
  expect((await DELETE(request("user_b"))).status).toBe(403);
  expect((await DELETE(request())).status).toBe(200);
  expect(state.cookies.size).toBe(0);
});

test("accountless erasure clears the browser without calling either cloud or identity deletion", async () => {
  state.userId = null;
  expect((await DELETE(request("local"))).status).toBe(200);
  expect(state.cloud).not.toHaveBeenCalled();
  expect(state.identity).not.toHaveBeenCalled();
});
