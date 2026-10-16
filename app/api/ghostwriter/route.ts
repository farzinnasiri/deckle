import { backend } from "@/lib/cloud/backend";
import { user, reply, StorageError } from "@/lib/cloud/http";
import { ghostRequest } from "@/lib/ghostwriter";

export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    const userId = await user(request, "Sign in to use Ghostwriter.");
    if (Number(request.headers.get("content-length") ?? 0) > 100000)
      throw new StorageError("This paper is too long for one pass.", 413);
    const raw = await request.text();
    if (raw.length > 100000)
      throw new StorageError("This paper is too long for one pass.", 413);
    let input;
    try {
      input = ghostRequest(JSON.parse(raw));
    } catch (error) {
      throw new StorageError(
        error instanceof Error ? error.message : "Invalid paper.",
      );
    }
    return reply(
      await backend(
        "ghostwriter",
        { ...input, userId },
        {
          timeoutMs: 285000,
          signal: request.signal,
          unavailableMessage:
            "Ghostwriter is not connected yet. Your paper is unchanged.",
        },
      ),
    );
  } catch (error) {
    return reply(
      {
        error:
          error instanceof StorageError
            ? error.message
            : "Ghostwriter could not finish. Your paper is unchanged. Try again shortly.",
      },
      error instanceof StorageError ? error.status : 503,
    );
  }
}
