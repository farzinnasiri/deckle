import { auth } from "@clerk/nextjs/server";
export class StorageError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export async function user(
  request: Request,
  signInMessage = "Sign in to save your desk.",
) {
  const { userId } = await auth();
  if (!userId) throw new StorageError(signInMessage, 401);
  const account = request.headers.get("X-Deckle-Account");
  if ((account && account !== userId) || (request.method !== "GET" && !account))
    throw new StorageError(
      "The signed-in account changed. Reopen your desk.",
      403,
    );
  // Portless supplies the public origin; its upstream port is different.
  const appUrl =
    (process.env.NODE_ENV === "development" && process.env.PORTLESS_URL) ||
    process.env.APP_URL ||
    request.url;
  if (
    request.method !== "GET" &&
    request.headers.get("origin") !== new URL(appUrl).origin
  )
    throw new StorageError("Invalid request origin.", 403);
  return userId;
}
export function reply(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function errorReply(error: unknown) {
  return reply(
    {
      error:
        error instanceof StorageError
          ? error.message
          : "Cloud storage is unavailable. Your browser copy is safe.",
    },
    error instanceof StorageError ? error.status : 503,
  );
}
