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
const input = {
  userId: "writer",
  text: "He walk.",
  scope: { from: 0, to: 8 },
  options: { fix: true, style: true, review: false },
  protected: [],
};
async function setup(enabled = true) {
  const t = convexTest(schema, modules);
  await t.mutation(internal.users.login, {
    userId: "writer",
    name: "Writer",
    email: "writer@example.com",
    imageUrl: "",
  });
  if (enabled)
    await t.mutation(internal.features.set, {
      userId: "writer",
      feature: "ghostwriter",
      enabled: true,
    });
  return t;
}
function finding(before = "He walk.", after = "He walks.") {
  return {
    kind: "fix",
    title: "Verb agreement",
    reason: "Fix agreement.",
    anchors: [before],
    alternatives: [{ label: "Correction", edits: [{ before, after }] }],
  };
}
function proposal(before = "He walk.") {
  return Response.json({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({ findings: [finding(before)] }),
        },
      },
    ],
  });
}
async function usage(t: Awaited<ReturnType<typeof setup>>) {
  const user = await t.run((ctx) =>
    ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", "writer"))
      .unique(),
  );
  return user?.ghostwriter;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
test("unassigned and revoked accounts cannot start inference or consume a pass", async () => {
  const t = await setup(false);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(await t.query(internal.features.get, { userId: "writer" })).toEqual({
    ghostwriter: false,
  });
  for (const enabled of [false, true, false]) {
    await t.mutation(internal.features.set, {
      userId: "writer",
      feature: "ghostwriter",
      enabled,
    });
    if (enabled) {
      expect(
        await t.query(internal.features.get, { userId: "writer" }),
      ).toEqual({
        ghostwriter: true,
      });
      continue;
    }
    await expect(t.action(internal.ghostwriter.polish, input)).rejects.toThrow(
      /not enabled/,
    );
    expect(await usage(t)).toBeUndefined();
  }
  expect(fetch).not.toHaveBeenCalled();
});
test("unknown and deleting accounts cannot reserve inference; concurrent requests are blocked", async () => {
  const t = await setup();
  await expect(
    t.mutation(internal.ghostwriter.reserve, {
      userId: "unknown",
      requestId: "a",
    }),
  ).rejects.toThrow(/unavailable/);
  await t.mutation(internal.ghostwriter.reserve, {
    userId: "writer",
    requestId: "one",
  });
  await expect(
    t.mutation(internal.ghostwriter.reserve, {
      userId: "writer",
      requestId: "two",
    }),
  ).rejects.toThrow(/already reading/);
  await t.mutation(internal.ghostwriter.release, {
    userId: "writer",
    requestId: "stale",
  });
  await expect(
    t.mutation(internal.ghostwriter.reserve, {
      userId: "writer",
      requestId: "three",
    }),
  ).rejects.toThrow(/already reading/);
  await t.mutation(internal.users.beginDeletion, { userId: "writer" });
  await expect(
    t.mutation(internal.ghostwriter.reserve, {
      userId: "writer",
      requestId: "four",
    }),
  ).rejects.toThrow(/unavailable/);
});
test("a successful action requests a capped low-effort model and returns anchored edits", async () => {
  const t = await setup();
  const fetch = vi.fn().mockImplementation(async () => proposal());
  vi.stubGlobal("fetch", fetch);
  const result = await t.action(internal.ghostwriter.polish, input);
  expect(result.findings[0].alternatives[0].edits[0]).toMatchObject({
    from: 0,
    to: 8,
    after: "He walks.",
  });
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.model).toBe("z-ai/glm-5.3-flash");
  expect(body.reasoning.effort).toBe("low");
  const branches =
    body.response_format.json_schema.schema.properties.findings.items.anyOf;
  expect(
    branches.map(
      (branch: {
        properties: {
          kind: { enum: string[] };
          alternatives: { minItems: number; maxItems: number };
        };
      }) => ({
        kind: branch.properties.kind.enum[0],
        min: branch.properties.alternatives.minItems,
        max: branch.properties.alternatives.maxItems,
      }),
    ),
  ).toEqual([
    { kind: "fix", min: 1, max: 1 },
    { kind: "style", min: 1, max: 3 },
    { kind: "review", min: 0, max: 0 },
  ]);
  expect(
    body.response_format.json_schema.schema.properties.findings,
  ).not.toHaveProperty("maxItems");
  expect(body.max_tokens).toBeGreaterThanOrEqual(16000);
  expect(body.provider.zdr).toBe(true);
  expect(body.provider.max_price.completion).toBe(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await usage(t)).toMatchObject({ count: 1 });
  expect((await usage(t))?.requestId).toBeUndefined();
});
test("provider failures retry after 1s then 2s and count as one pass", async () => {
  const t = await setup();
  vi.useFakeTimers();
  const times: number[] = [];
  const fetch = vi.fn().mockImplementation(async () => {
    times.push(Date.now());
    if (times.length === 1) return new Response("unavailable", { status: 503 });
    if (times.length === 2) throw new Error("private provider diagnostic");
    return proposal();
  });
  vi.stubGlobal("fetch", fetch);
  let settled = false;
  const request = t.action(internal.ghostwriter.polish, input).finally(() => {
    settled = true;
  });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect((await usage(t))?.requestId).toBeTruthy();
  expect(settled).toBe(false);
  await vi.runAllTimersAsync();
  expect((await request).findings[0].alternatives[0].edits[0]).toMatchObject({
    after: "He walks.",
  });
  expect(times).toHaveLength(3);
  expect(times[1] - times[0]).toBe(1000);
  expect(times[2] - times[1]).toBe(2000);
  expect((await usage(t))?.count).toBe(1);
  expect((await usage(t))?.requestId).toBeUndefined();
});
test.each([
  ["unsafe anchored edit", () => proposal("invented passage")],
  ["malformed provider JSON", () => new Response("private malformed output")],
  [
    "malformed generated JSON",
    () =>
      Response.json({
        choices: [
          { finish_reason: "stop", message: { content: "private bad output" } },
        ],
      }),
  ],
  [
    "truncated generation",
    () =>
      Response.json({
        choices: [
          { finish_reason: "length", message: { content: '{"edits":[' } },
        ],
      }),
  ],
])("%s is retried before any edits are returned", async (_label, failure) => {
  const t = await setup();
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockImplementationOnce(async () => failure())
    .mockImplementation(async () => proposal());
  vi.stubGlobal("fetch", fetch);
  const request = t.action(internal.ghostwriter.polish, input);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await vi.runAllTimersAsync();
  expect((await request).findings[0].alternatives[0].edits[0]).toMatchObject({
    after: "He walks.",
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect((await usage(t))?.count).toBe(1);
  expect((await usage(t))?.requestId).toBeUndefined();
});
test.each([
  [
    "provider failure",
    () => new Response("private diagnostic", { status: 429 }),
    503,
  ],
  ["invalid changes", () => proposal("private invented passage"), 422],
])(
  "third %s escalates a safe error and releases the reservation",
  async (_label, failure, status) => {
    const t = await setup();
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(async () => failure());
    vi.stubGlobal("fetch", fetch);
    const request = t.action(internal.ghostwriter.polish, input);
    // Attach the rejection handler before advancing timers to the final attempt.
    const assertion = expect(request).rejects.toThrow(/after three attempts/);
    const error = request.catch((failure: unknown) => failure);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await vi.runAllTimersAsync();
    await assertion;
    const failureData = (await error) as {
      data: { status: number; message: string };
    };
    expect(failureData.data.status).toBe(status);
    expect(failureData.data.message).toMatch(/paper is unchanged/);
    expect(failureData.data.message).not.toMatch(/private/);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect((await usage(t))?.count).toBe(1);
    expect((await usage(t))?.requestId).toBeUndefined();
  },
);
test("three 90s timeouts retain the reservation and finish within the bridge deadline", async () => {
  const t = await setup();
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("private timeout")), ms);
    return controller.signal;
  });
  const times: number[] = [];
  const fetch = vi.fn().mockImplementation((_url, options: RequestInit) => {
    times.push(Date.now());
    return new Promise((_resolve, reject) =>
      options.signal!.addEventListener("abort", () =>
        reject(options.signal!.reason),
      ),
    );
  });
  vi.stubGlobal("fetch", fetch);
  const request = t.action(internal.ghostwriter.polish, input);
  const assertion = expect(request).rejects.toThrow(/after three attempts/);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await vi.advanceTimersByTimeAsync(200000);
  expect(fetch).toHaveBeenCalledTimes(3);
  await expect(
    t.mutation(internal.ghostwriter.reserve, {
      userId: "writer",
      requestId: "second-check",
    }),
  ).rejects.toThrow(/already reading/);
  expect((await usage(t))?.count).toBe(1);
  await vi.runAllTimersAsync();
  await assertion;
  expect(times[1] - times[0]).toBe(91000);
  expect(times[2] - times[1]).toBe(92000);
  expect(Date.now() - times[0]).toBe(273000);
  expect(AbortSignal.timeout).toHaveBeenCalledTimes(3);
  expect((await usage(t))?.requestId).toBeUndefined();
});
test("abandoned reservations expire after five minutes without stale cleanup releasing a new check", async () => {
  const t = await setup();
  vi.useFakeTimers();
  await t.mutation(internal.ghostwriter.reserve, {
    userId: "writer",
    requestId: "abandoned",
  });
  await vi.advanceTimersByTimeAsync(299999);
  await expect(
    t.mutation(internal.ghostwriter.reserve, {
      userId: "writer",
      requestId: "too-soon",
    }),
  ).rejects.toThrow(/already reading/);
  await vi.advanceTimersByTimeAsync(1);
  await t.mutation(internal.ghostwriter.reserve, {
    userId: "writer",
    requestId: "replacement",
  });
  await t.mutation(internal.ghostwriter.release, {
    userId: "writer",
    requestId: "abandoned",
  });
  expect((await usage(t))?.requestId).toBe("replacement");
  expect((await usage(t))?.count).toBe(2);
});
test("invalid input fails before usage admission and never calls inference", async () => {
  const t = await setup();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    t.action(internal.ghostwriter.polish, {
      ...input,
      scope: { from: 0, to: 999 },
    }),
  ).rejects.toThrow(/could not be sent/);
  expect(fetch).not.toHaveBeenCalled();
  expect(await usage(t)).toBeUndefined();
});
test("a successful release preserves the minimum interval between checks", async () => {
  const t = await setup();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => proposal()),
  );
  await t.action(internal.ghostwriter.polish, input);
  await expect(t.action(internal.ghostwriter.polish, input)).rejects.toThrow(
    /moment before another pass/,
  );
  expect((await usage(t))?.count).toBe(1);
});
test("daily allowance blocks further paid calls", async () => {
  const t = await setup();
  await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", "writer"))
      .unique();
    await ctx.db.patch(user!._id, {
      ghostwriter: {
        day: new Date().toISOString().slice(0, 10),
        count: 30,
        startedAt: Date.now() - 15000,
      },
    });
  });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(t.action(internal.ghostwriter.polish, input)).rejects.toThrow(
    /30 passes/,
  );
  expect(fetch).not.toHaveBeenCalled();
});

test("validation retries explain the rejected contract without repeating generated writing", async () => {
  const t = await setup();
  vi.useFakeTimers();
  const invalid = finding();
  invalid.alternatives.push({
    label: "private generated wording",
    edits: [{ before: "He walk.", after: "He strolls." }],
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify({ findings: [invalid] }) },
          },
        ],
      }),
    )
    .mockImplementation(async () => proposal());
  vi.stubGlobal("fetch", fetch);
  const request = t.action(internal.ghostwriter.polish, input);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await vi.runAllTimersAsync();
  expect((await request).findings).toHaveLength(1);
  const retry = JSON.parse(fetch.mock.calls[1][1].body);
  expect(retry.messages.at(-1)).toMatchObject({ role: "system" });
  expect(retry.messages.at(-1).content).toMatch(/fix.*alternatives.*exactly 1/);
  expect(JSON.stringify(retry)).not.toContain("private generated wording");
  expect((await usage(t))?.count).toBe(1);
});
