import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError } from "convex/values";
import { legacyGhostPlan } from "../lib/ghostwriter-legacy";
import { ghostRequest } from "../lib/ghostwriter";
import { migrateStore } from "../lib/archive";
const http = httpRouter();
http.route({
  path: "/desk",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.DECKLE_BRIDGE_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const raw = await request.text();
      if (raw.length > 500000)
        return Response.json({ error: "Request too large" }, { status: 413 });
      const { operation, args } = JSON.parse(raw);
      if (!args || typeof args.userId !== "string" || !args.userId)
        return Response.json({ error: "Invalid account" }, { status: 400 });
      let result;
      if (operation === "login")
        result = await ctx.runMutation(internal.users.login, args);
      else if (operation === "begin-deletion")
        result = await ctx.runMutation(internal.users.beginDeletion, args);
      else if (operation === "finish-deletion")
        result = await ctx.runMutation(internal.users.finishDeletion, args);
      else if (operation === "desk")
        result = await ctx.runQuery(internal.desks.get, args);
      else if (operation === "upload-ticket")
        result = await ctx.runMutation(internal.desks.ticket, args);
      else if (operation === "save-desk")
        result = await ctx.runMutation(internal.desks.save, args);
      else if (operation === "ghostwriter") {
        // The shared backend also serves the currently published frontend.
        // Keep its flat response working while the editorial UI is rolled out.
        const legacy = typeof args.options?.grammar === "boolean";
        const input = ghostRequest({
          ...args,
          options: legacy
            ? {
                fix: args.options.grammar,
                style: args.options.wording || args.options.structure,
                review: false,
              }
            : args.options,
        });
        const plan = await ctx.runAction(internal.ghostwriter.polish, {
          ...input,
          userId: args.userId,
        });
        result = legacy
          ? legacyGhostPlan(
              input,
              plan,
              args.options.structure && !args.options.wording
                ? "structure"
                : "wording",
            )
          : plan;
      } else if (operation === "features")
        result = await ctx.runQuery(internal.features.get, args);
      else
        return Response.json({ error: "Unknown operation" }, { status: 400 });
      return Response.json(
        { result },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      const data =
        error instanceof ConvexError &&
        typeof error.data === "object" &&
        error.data
          ? (error.data as { message?: string; status?: number })
          : null;
      return Response.json(
        { error: data?.message ?? "Cloud storage is unavailable." },
        { status: data?.status ?? 503 },
      );
    }
  }),
});
const cors = (request: Request) => ({
  "Access-Control-Allow-Origin": request.headers.get("origin") ?? "",
  Vary: "Origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Deckle-Upload",
});
http.route({
  path: "/desk/upload",
  method: "OPTIONS",
  handler: httpAction(
    async (_ctx, request) =>
      new Response(null, { status: 204, headers: cors(request) }),
  ),
});
http.route({
  path: "/desk/upload",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const headers = cors(request);
    const ticket = request.headers.get("X-Deckle-Upload") ?? "";
    const allowed = await ctx.runQuery(internal.desks.uploadTicket, {
      ticket,
      now: Date.now(),
    });
    if (!allowed || allowed.origin !== request.headers.get("origin"))
      return Response.json(
        { error: "Upload expired. Try saving again." },
        { status: 403, headers },
      );
    if (Number(request.headers.get("content-length") ?? 0) > 20_000_000)
      return Response.json(
        {
          error:
            "This desk exceeds the 20 MB cloud limit. Export a backup; local storage still works.",
        },
        { status: 413, headers },
      );
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > 20_000_000)
      return Response.json(
        {
          error:
            "This desk exceeds the 20 MB cloud limit. Export a backup; local storage still works.",
        },
        { status: 413, headers },
      );
    let desk;
    try {
      desk = migrateStore(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      return Response.json(
        {
          error:
            "This desk could not be read. Your existing cloud copy was preserved.",
        },
        { status: 400, headers },
      );
    }
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: "application/json" }),
    );
    let registered;
    try {
      registered = await ctx.runMutation(internal.desks.uploaded, {
        ticket,
        storageId,
        settings: desk.settings,
      });
    } catch (error) {
      await ctx.storage.delete(storageId);
      throw error;
    }
    if (!registered)
      return Response.json(
        { error: "Upload expired. Try again." },
        { status: 403, headers },
      );
    return Response.json({ storageId }, { headers });
  }),
});
export default http;
