import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
  test: {
    include: ["tests/convex/**/*.test.ts", "tests/client/**/*.test.ts"],
    environment: "edge-runtime",
  },
});
