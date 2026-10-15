import { spawnSync } from "node:child_process";

// All app builds currently use development Clerk and Convex. Sync the
// development backend with `npx convex dev --once` when its functions change.
const result = spawnSync("npm", ["run", "build"], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
