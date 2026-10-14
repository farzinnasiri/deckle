import { backend } from "@/lib/cloud/backend";
import { user, reply, errorReply, StorageError } from "@/lib/cloud/http";
export async function GET(request: Request) {
  try {
    return reply(await backend("desk", { userId: await user(request) }));
  } catch (error) {
    return errorReply(error);
  }
}
export async function POST(request: Request) {
  try {
    const userId = await user(request);
    if (Number(request.headers.get("content-length") ?? 0) > 10000)
      throw new StorageError("Invalid request.", 413);
    const raw = await request.text();
    if (raw.length > 10000) throw new StorageError("Invalid request.", 413);
    const input = JSON.parse(raw);
    if (input.action === "upload") {
      const ticket = crypto.randomUUID();
      await backend("upload-ticket", {
        userId,
        ticket,
        origin: new URL(process.env.APP_URL ?? request.url).origin,
      });
      return reply({
        ticket,
        url: new URL(
          "/desk/upload",
          process.env.CONVEX_SITE_URL ??
            process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
        ).href,
      });
    }
    if (input.action !== "save") throw new StorageError("Invalid request.");
    return reply(
      await backend("save-desk", {
        userId,
        storageId: input.storageId,
        baseRevision: input.baseRevision,
        mutationId: input.mutationId,
      }),
    );
  } catch (error) {
    return errorReply(error);
  }
}
