import { createHmac, timingSafeEqual } from "node:crypto";

export const DELETION_COOKIE = "deckle-delete-account";
export const DELETION_COOKIE_AGE = 7 * 24 * 60 * 60;

// A short-lived, deletion-only credential allows cleanup to be retried even if
// Clerk has deleted the account and the final Convex request was interrupted.
export function deletionReceipt(
  userId: string,
  secret: string,
  now = Date.now(),
) {
  const payload = Buffer.from(
    JSON.stringify({ userId, expires: now + DELETION_COOKIE_AGE * 1000 }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`deckle-delete:${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}
export function readDeletionReceipt(
  value: string | undefined,
  secret: string | undefined,
  now = Date.now(),
): string | null {
  if (!value || !secret || value.length > 2000) return null;
  try {
    const [payload, signature, extra] = value.split(".");
    if (!payload || !signature || extra) return null;
    const expected = createHmac("sha256", secret)
      .update(`deckle-delete:${payload}`)
      .digest();
    const supplied = Buffer.from(signature, "base64url");
    if (
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied)
    )
      return null;
    const { userId, expires } = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    );
    return typeof userId === "string" &&
      userId.startsWith("user_") &&
      Number.isFinite(expires) &&
      expires > now
      ? userId
      : null;
  } catch {
    return null;
  }
}

export async function permanentlyDeleteAccount(
  userId: string,
  services: {
    cloud: (
      operation: "begin-deletion" | "finish-deletion",
      userId: string,
    ) => Promise<boolean>;
    identity: (userId: string) => Promise<unknown>;
  },
) {
  while (!(await services.cloud("begin-deletion", userId))) {
    /* Bounded batches. */
  }
  try {
    await services.identity(userId);
  } catch (error) {
    // A retry after Clerk succeeded must still finish removing the cloud row.
    if (
      !error ||
      typeof error !== "object" ||
      !("status" in error) ||
      error.status !== 404
    )
      throw error;
  }
  while (!(await services.cloud("finish-deletion", userId))) {
    /* Bounded batches. */
  }
}
