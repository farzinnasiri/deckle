import { beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  userId: "user_a" as string | null,
  backend: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.userId }),
}));
vi.mock("@/lib/cloud/backend", () => ({ backend: state.backend }));
import { POST, maxDuration } from "../../app/api/ghostwriter/route";
import { StorageError } from "../../lib/cloud/http";
const body = {
  text: "He walk.",
  scope: { from: 0, to: 8 },
  options: { grammar: true, wording: true, structure: false },
  protected: [],
};
function request(
  account = "user_a",
  origin = "https://deckle.test",
  input: unknown = body,
) {
  return new Request("https://deckle.test/api/ghostwriter", {
    method: "POST",
    headers: {
      Origin: origin,
      "X-Deckle-Account": account,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}
beforeEach(() => {
  state.userId = "user_a";
  state.backend.mockReset().mockResolvedValue({ model: "test", edits: [] });
  vi.stubEnv("APP_URL", "https://deckle.test");
});
test("AI calls require authentication, the current account and the app origin", async () => {
  expect((await POST(request("user_b"))).status).toBe(403);
  expect((await POST(request(""))).status).toBe(403);
  expect((await POST(request("user_a", "https://attacker.test"))).status).toBe(
    403,
  );
  state.userId = null;
  const signedOut = await POST(request());
  expect(signedOut.status).toBe(401);
  expect((await signedOut.json()).error).toMatch(/Ghostwriter/);
  expect(state.backend).not.toHaveBeenCalled();
});
test("invalid scope and text never reach paid inference", async () => {
  for (const input of [
    { ...body, text: "x".repeat(12001) },
    { ...body, scope: { from: 0, to: 99 } },
    {},
    null,
  ])
    expect(
      (await POST(request("user_a", "https://deckle.test", input))).status,
    ).toBe(400);
  expect(state.backend).not.toHaveBeenCalled();
});
test("only the authenticated user is forwarded and failures preserve the paper", async () => {
  const response = await POST(
    request("user_a", "https://deckle.test", { ...body, userId: "attacker" }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(state.backend.mock.calls[0][1]).toEqual({ ...body, userId: "user_a" });
  state.backend.mockRejectedValue(new Error("provider secret diagnostic"));
  const failed = await POST(request());
  expect(failed.status).toBe(503);
  expect((await failed.json()).error).toMatch(/paper is unchanged/);
});
test("the bridge can finish all inference attempts before the route expires", async () => {
  const current = request();
  expect((await POST(current)).status).toBe(200);
  const options = state.backend.mock.calls[0][2];
  expect(options.timeoutMs).toBeGreaterThan(3 * 90000 + 1000 + 2000);
  expect(options.timeoutMs).toBeLessThan(maxDuration * 1000);
  expect(options.signal).toBe(current.signal);
  expect(state.backend).toHaveBeenCalledTimes(1);
});
test.each([422, 503])(
  "the final backend error reaches the user with status %s and no extra retry",
  async (status) => {
    const message =
      "Ghostwriter could not finish after three attempts. Your paper is unchanged. Try again shortly.";
    state.backend.mockRejectedValue(new StorageError(message, status));
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: message });
    expect(state.backend).toHaveBeenCalledTimes(1);
  },
);
