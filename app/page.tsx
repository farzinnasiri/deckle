import { AccountDesk } from "@/components/account-desk";
import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DELETION_COOKIE, readDeletionReceipt } from "@/lib/account-deletion";
import { backend } from "@/lib/cloud/backend";
export default async function Page() {
  if (
    readDeletionReceipt(
      (await cookies()).get(DELETION_COOKIE)?.value,
      process.env.CLERK_SECRET_KEY,
    )
  )
    redirect("/start-over");
  let { userId } = await auth();
  if (
    userId &&
    (process.env.CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL) &&
    process.env.DECKLE_BRIDGE_SECRET
  ) {
    try {
      const user = await currentUser();
      if (user) {
        await backend("login", {
          userId,
          name: user.fullName ?? user.username ?? "",
          email: user.primaryEmailAddress?.emailAddress ?? "",
          imageUrl: user.imageUrl ?? "",
        });
        // A page request can have fetched its profile before deletion and reach
        // Convex afterward. Verify after the write so it cannot retain that row.
        // Use the filtered list endpoint so request memoization cannot reuse
        // currentUser's earlier GET /users/:id response for this check.
        const checked = await (
          await clerkClient()
        ).users.getUserList({ userId: [userId], limit: 1 });
        if (!checked.data.some((account) => account.id === userId)) {
          while (!(await backend<boolean>("finish-deletion", { userId }))) {
            /* Bounded batches. */
          }
          userId = null;
        }
      } else userId = null;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 404
      )
        userId = null;
      /* Local writing remains available during a backend outage. */
    }
  }
  return <AccountDesk key={userId ?? "local"} userId={userId} />;
}
