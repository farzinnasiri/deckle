import "server-only";
import { StorageError } from "./http";
export async function backend<T>(
  operation: string,
  args: Record<string, unknown>,
): Promise<T> {
  const url =
    process.env.CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  const secret = process.env.DECKLE_BRIDGE_SECRET;
  if (!url || !secret)
    throw new StorageError("Cloud storage is not configured yet.", 503);
  const response = await fetch(new URL("/desk", url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ operation, args }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new StorageError(
      result.error ?? "Cloud storage is unavailable.",
      response.status,
    );
  return result.result as T;
}
