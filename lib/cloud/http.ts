import { auth } from "@clerk/nextjs/server";
export class StorageError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export async function user(request: Request) {
  const { userId } = await auth();
  if (!userId) throw new StorageError("Sign in to save your desk.", 401);
  const account = request.headers.get("X-Deckle-Account");
  if ((account && account !== userId) || (request.method !== "GET" && !account))
    throw new StorageError(
      "The signed-in account changed. Reopen your desk.",
      403,
    );
  if (
    request.method !== "GET" &&
    request.headers.get("origin") !==
      new URL(process.env.APP_URL ?? request.url).origin
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
