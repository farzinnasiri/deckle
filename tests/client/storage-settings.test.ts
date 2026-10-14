import { expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  StorageSettings,
  type CloudStorage,
} from "../../components/storage-settings";

test("signed-out storage offers local saving and optional sign-in without cloud controls", () => {
  const sync: CloudStorage = {
    mode: "local",
    status: "Saved in this browser",
    signedIn: false,
    busy: false,
    error: "",
    conflict: false,
    change: async () => {},
    retry: () => {},
  };
  const html = renderToStaticMarkup(createElement(StorageSettings, { sync }));
  expect(html).toContain("Saved in this browser");
  expect(html).toContain("Export a backup from the archive");
  expect(html).toContain('href="/sign-in"');
  expect(html).not.toContain("storage-options");
  expect(html).not.toContain("aria-pressed=");
});
