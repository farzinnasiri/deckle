/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
vi.mock("convex/server", async (original) => ({
  ...(await original<typeof import("convex/server")>()),
  getServiceToken: async () => "test-service-token",
}));
const modules = import.meta.glob("../../convex/**/*.{ts,js}");
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const finding = (kind: "fix" | "style", before: string, after: string) => ({
  kind,
  title: "Correction",
  reason: "Remove redundancy or fix agreement.",
  anchors: [before],
  alternatives: [{ label: "Recommended", edits: [{ before, after }] }],
});
test.each([
  "editorial",
  "legacy grammar",
  "legacy structure",
  "legacy oversized",
])(
  "the shared bridge handles %s without losing corrections or hiding errors",
  async (scenario) => {
    const t = convexTest(schema, modules);
    vi.stubEnv("DECKLE_BRIDGE_SECRET", "test-bridge");
    await t.mutation(internal.users.login, {
      userId: "writer",
      name: "Writer",
      email: "writer@example.com",
      imageUrl: "",
    });
    await t.mutation(internal.features.set, {
      userId: "writer",
      feature: "ghostwriter",
      enabled: true,
    });
    const oversized = scenario === "legacy oversized";
    const structure = scenario === "legacy structure";
    const text = oversized ? "one shared two" : "She have a dog.";
    const findings = oversized
      ? [
          finding("style", "one shared ", "a".repeat(2500) + " shared "),
          finding("style", " shared two", " shared " + "b".repeat(2500)),
        ]
      : [finding(structure ? "style" : "fix", "She have", "She has")];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify({ findings }) },
            },
          ],
        }),
      ),
    );
    const response = await t.fetch("/desk", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-bridge",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operation: "ghostwriter",
        args: {
          userId: "writer",
          text,
          scope: { from: 0, to: text.length },
          protected: [],
          options:
            scenario === "editorial"
              ? { fix: true, style: true, review: false }
              : {
                  grammar: !structure && !oversized,
                  wording: oversized,
                  structure,
                },
        },
      }),
    });
    const body = await response.json();
    if (oversized) {
      expect(response.status).toBe(422);
      expect(body.error).toMatch(/older desk.*paper is unchanged/i);
    } else {
      expect(response.status).toBe(200);
      if (scenario === "editorial") {
        expect(body.result.findings[0].alternatives[0].edits[0]).toMatchObject({
          after: "She has",
        });
        expect(body.result.edits).toBeUndefined();
      } else {
        expect(body.result.edits[0]).toMatchObject({
          before: "She have",
          after: "She has",
          kind: structure ? "structure" : "grammar",
        });
        expect(body.result.findings).toBeUndefined();
      }
    }
  },
);
