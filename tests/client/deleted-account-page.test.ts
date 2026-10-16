import { beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({ cloud: vi.fn(), check: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "user_a" }),
  currentUser: async () => ({
    fullName: "A",
    primaryEmailAddress: { emailAddress: "a@example.com" },
    imageUrl: "",
  }),
  clerkClient: async () => ({ users: { getUserList: state.check } }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/cloud/backend", () => ({ backend: state.cloud }));
vi.mock("../../components/account-desk", () => ({ AccountDesk: () => null }));
import Page from "../../app/page";

beforeEach(() => {
  state.cloud
    .mockReset()
    .mockImplementation(async (operation) =>
      operation === "features" ? { ghostwriter: true } : true,
    );
  state.check.mockReset();
  vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
  vi.stubEnv("DECKLE_BRIDGE_SECRET", "test-bridge");
});
test("a delayed login cannot retain an account row after identity deletion", async () => {
  state.check.mockResolvedValue({ data: [] });
  const page = await Page();
  expect(page.props.userId).toBeNull();
  expect(state.check).toHaveBeenCalledWith({ userId: ["user_a"], limit: 1 });
  expect(state.cloud.mock.calls.map((call) => call[0])).toEqual([
    "login",
    "finish-deletion",
  ]);
});
test("a current account is preserved after the fresh identity check", async () => {
  state.check.mockResolvedValue({ data: [{ id: "user_a" }] });
  const page = await Page();
  expect(page.props.userId).toBe("user_a");
  expect(state.cloud).toHaveBeenCalledTimes(2);
  expect(page.props.features).toEqual({ ghostwriter: true });
});
test("feature lookup failures leave writing available with unreleased features hidden", async () => {
  state.check.mockResolvedValue({ data: [{ id: "user_a" }] });
  state.cloud.mockImplementation(async (operation) => {
    if (operation === "features") throw new Error("backend unavailable");
    return true;
  });
  const page = await Page();
  expect(page.props.userId).toBe("user_a");
  expect(page.props.features).toEqual({ ghostwriter: false });
});
