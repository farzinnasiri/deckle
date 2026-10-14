import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { StartOver } from "@/components/start-over";
import { DELETION_COOKIE, readDeletionReceipt } from "@/lib/account-deletion";

export default async function StartOverPage() {
  const { userId } = await auth();
  const pending = readDeletionReceipt(
    (await cookies()).get(DELETION_COOKIE)?.value,
    process.env.CLERK_SECRET_KEY,
  );
  return <StartOver userId={pending ?? userId} pending={!!pending} />;
}
