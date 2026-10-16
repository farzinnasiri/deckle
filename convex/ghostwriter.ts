import { getServiceToken } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActiveUser } from "./users";
import {
  ghostEdits,
  ghostInstructions,
  ghostRequest,
  ghostResponseFormat,
} from "../lib/ghostwriter";

const range = v.object({ from: v.number(), to: v.number() });
const kind = v.union(
  v.literal("grammar"),
  v.literal("wording"),
  v.literal("structure"),
);
const inferenceTimeoutMs = 90000;
// Three attempts plus 1s and 2s backoff fit inside the 285s bridge deadline.
const reservationTimeoutMs = 300000;
const maxAttempts = 3;
const unavailable = () =>
  new ConvexError({
    message:
      "Ghostwriter could not finish after three attempts. Your paper is unchanged. Try again shortly.",
    status: 503,
  });

export const reserve = internalMutation({
  args: { userId: v.string(), requestId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, requestId }) => {
    const user = await requireActiveUser(ctx, userId);
    if (user.features?.ghostwriter !== true)
      throw new ConvexError({
        message: "Ghostwriter is not enabled for this account.",
        status: 403,
      });
    const now = Date.now(),
      day = new Date(now).toISOString().slice(0, 10);
    const previous = user.ghostwriter;
    // A duplicate reservation never starts a second paid request.
    if (previous?.requestId && now - previous.startedAt < reservationTimeoutMs)
      throw new ConvexError({
        message: "Ghostwriter is already reading your paper.",
        status: 409,
      });
    if (previous && now - previous.startedAt < 10000)
      throw new ConvexError({
        message: "Give Ghostwriter a moment before another pass.",
        status: 429,
      });
    const count = previous?.day === day ? previous.count : 0;
    if (count >= 30)
      throw new ConvexError({
        message:
          "You have used today's 30 passes. Ghostwriter returns tomorrow.",
        status: 429,
      });
    await ctx.db.patch(user._id, {
      ghostwriter: { day, count: count + 1, startedAt: now, requestId },
    });
    return null;
  },
});

export const release = internalMutation({
  args: { userId: v.string(), requestId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, requestId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
      .unique();
    if (user?.ghostwriter?.requestId === requestId)
      await ctx.db.patch(user._id, {
        ghostwriter: { ...user.ghostwriter, requestId: undefined },
      });
    return null;
  },
});

export const polish = internalAction({
  args: {
    userId: v.string(),
    text: v.string(),
    scope: range,
    options: v.object({
      grammar: v.boolean(),
      wording: v.boolean(),
      structure: v.boolean(),
    }),
    protected: v.array(range),
  },
  returns: v.object({
    model: v.string(),
    edits: v.array(
      v.object({
        from: v.number(),
        to: v.number(),
        before: v.string(),
        after: v.string(),
        reason: v.string(),
        kind,
      }),
    ),
  }),
  handler: async (ctx, args) => {
    let input;
    try {
      input = ghostRequest(args);
    } catch {
      throw new ConvexError({
        message: "This paper could not be sent for a polish.",
        status: 400,
      });
    }
    const requestId = crypto.randomUUID();
    await ctx.runMutation(internal.ghostwriter.reserve, {
      userId: args.userId,
      requestId,
    });
    try {
      const model = "z-ai/glm-5.3-flash";
      const body = JSON.stringify({
        model,
        max_tokens: 16000,
        temperature: 0.3,
        reasoning: { effort: "low", exclude: true },
        response_format: ghostResponseFormat,
        provider: {
          zdr: true,
          data_collection: "deny",
          require_parameters: true,
          max_price: { prompt: 0.5, completion: 1 },
        },
        messages: [
          { role: "system", content: ghostInstructions },
          {
            role: "user",
            content: JSON.stringify({
              text: input.text,
              scope: input.scope,
              options: input.options,
              protected: input.protected,
            }),
          },
        ],
      });
      // Reserve once for the whole check. An unusable response is retried just
      // like a failed request, and nothing reaches the editor until validated.
      for (let attempt = 1; ; attempt++) {
        let invalidOutput = false;
        try {
          const token = await getServiceToken("ai-gateway");
          const response = await fetch(
            "https://ai-gateway.convex.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              signal: AbortSignal.timeout(inferenceTimeoutMs),
              body,
            },
          );
          if (!response.ok) throw unavailable();
          const result = await response.json();
          invalidOutput = true;
          const choice = result?.choices?.[0];
          if (
            choice?.finish_reason !== "stop" ||
            typeof choice.message?.content !== "string"
          )
            throw unavailable();
          return {
            model,
            edits: ghostEdits(input, JSON.parse(choice.message.content)),
          };
        } catch (error) {
          // Never expose provider diagnostics or generated writing in errors.
          if (attempt === maxAttempts)
            throw invalidOutput || error instanceof SyntaxError
              ? new ConvexError({
                  message:
                    "Ghostwriter could not produce safe changes after three attempts. Your paper is unchanged. Try again shortly.",
                  status: 422,
                })
              : unavailable();
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * 2 ** (attempt - 1)),
          );
        }
      }
    } finally {
      await ctx.runMutation(internal.ghostwriter.release, {
        userId: args.userId,
        requestId,
      });
    }
  },
});
