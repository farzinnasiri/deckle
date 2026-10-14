import { spawnSync } from "node:child_process";

// Only production builds may deploy the production database. Preview builds
// use their separately configured development services.
const production = process.env.VERCEL_ENV === "production";
if (production && !process.env.CONVEX_DEPLOY_KEY) {
  throw new Error("Set CONVEX_DEPLOY_KEY in Vercel's Production environment.");
}
const result = production
  ? spawnSync("npx", ["convex", "deploy", "--cmd", "npm run build"], {
      stdio: "inherit",
    })
  : spawnSync("npm", ["run", "build"], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
