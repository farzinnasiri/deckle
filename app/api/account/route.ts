import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { backend } from "@/lib/cloud/backend";
import {
  DELETION_COOKIE,
  DELETION_COOKIE_AGE,
  deletionReceipt,
  readDeletionReceipt,
  permanentlyDeleteAccount,
} from "@/lib/account-deletion";

export async function DELETE(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (
    request.headers.get("origin") !==
      new URL(process.env.APP_URL ?? request.url).origin ||
    request.headers.get("X-Deckle-Confirm") !== "DELETE"
  )
    return Response.json(
      { error: "Invalid deletion request." },
      { status: 403, headers },
    );
  const { userId } = await auth();
  const jar = await cookies();
  const pending = readDeletionReceipt(
    jar.get(DELETION_COOKIE)?.value,
    process.env.CLERK_SECRET_KEY,
  );
  const account = request.headers.get("X-Deckle-Account");
  if ((userId && account !== userId) || (pending && account !== pending))
    return Response.json(
      { error: "The signed-in account changed. Reopen the deletion page." },
      { status: 403, headers },
    );
  if (!userId && !pending && account !== "local")
    return Response.json(
      { error: "Sign in again to delete your account." },
      { status: 401, headers },
    );
  const target = pending ?? userId;
  try {
    if (target) {
      if (!process.env.CLERK_SECRET_KEY)
        throw new Error("Account deletion is unavailable.");
      jar.set(
        DELETION_COOKIE,
        deletionReceipt(target, process.env.CLERK_SECRET_KEY),
        {
          httpOnly: true,
          secure: new URL(request.url).protocol === "https:",
          sameSite: "strict",
          path: "/",
          maxAge: DELETION_COOKIE_AGE,
        },
      );
      const client = await clerkClient();
      await permanentlyDeleteAccount(target, {
        cloud: (operation, userId) => backend<boolean>(operation, { userId }),
        identity: (userId) => client.users.deleteUser(userId),
      });
    }
    // Browser caches and cookies cannot all be removed from JavaScript.
    // Explicit browser cleanup also runs for engines that ignore this header.
    for (const { name } of jar.getAll()) jar.delete(name);
    return Response.json(
      { deleted: true },
      {
        headers: {
          ...headers,
          "Clear-Site-Data": '"cache", "cookies", "storage"',
        },
      },
    );
  } catch {
    return Response.json(
      {
        error:
          "Deletion did not finish. Retry to permanently remove the remaining account data.",
      },
      { status: 503, headers },
    );
  }
}
