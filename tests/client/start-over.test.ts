import { expect, test, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: async () => {} }),
}));
import { StartOver } from "../../components/start-over";

test("permanent deletion explains its scope and requires explicit typed confirmation", () => {
  const html = renderToStaticMarkup(
    createElement(StartOver, { userId: "user_a" }),
  );
  expect(html).toContain(
    "Permanently delete your Deckle account and all its cloud data",
  );
  expect(html).toContain("including other local desks, cookies and caches");
  expect(html).toContain("This cannot be undone");
  expect(html).toContain("Type DELETE to confirm");
  expect(html).toMatch(/disabled=""[^>]*>Delete permanently/);
  expect(html).toContain("Keep my desk");
  const retry = renderToStaticMarkup(
    createElement(StartOver, { userId: "user_a", pending: true }),
  );
  expect(retry).toContain("Retry permanent deletion");
  expect(retry).not.toContain("Keep my desk");
});
