import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fitsPaper,
  paperLineCount,
  textLineCount,
  PAPER_LINE_LIMIT,
} from "../lib/paper-capacity";
import { paperClipboard, copyPaper } from "../lib/clipboard";
import { appendEvent, newPiece, makeEvent, defaultPaper } from "../lib/writing";
test("paper rows include consecutive and trailing Returns but ignore visual wrapping", () => {
  assert.equal(textLineCount(""), 1);
  assert.equal(textLineCount("\n\n"), 3);
  assert.equal(textLineCount("word\n\nword\n"), 4);
  assert.equal(textLineCount("x".repeat(10000)), 1);
  const piece = appendEvent(
    newPiece(defaultPaper),
    makeEvent("type", "a\n\n", "draft"),
  );
  assert.equal(paperLineCount(piece.document), 3);
});
test("the finite paper accepts its last Return, rejects oversized paste, and permits edits on legacy papers", () => {
  const atLimit = "\n".repeat(PAPER_LINE_LIMIT - 1);
  assert.equal(fitsPaper(atLimit.slice(1), atLimit), true);
  assert.equal(fitsPaper(atLimit, atLimit + "\n"), false);
  assert.equal(fitsPaper(atLimit, atLimit + "more text"), true);
  assert.equal(fitsPaper("", atLimit + "\n"), false);
  const legacy = atLimit + "\n\n";
  assert.equal(fitsPaper(legacy, legacy + "still readable"), true);
  assert.equal(fitsPaper(legacy, legacy + "\n"), false);
  assert.equal(fitsPaper(legacy, atLimit), true);
});
test("rich clipboard contains escaped writing, headings, marks, red ink, and blank lines", () => {
  let piece = appendEvent(
    newPiece(defaultPaper),
    makeEvent("title", "<A & title>", "draft"),
  );
  piece = appendEvent(piece, {
    ...makeEvent("type", "# Heading\n\nHello <script>\n", "draft"),
    range: { from: 0, to: 0 },
  });
  piece = appendEvent(piece, {
    ...makeEvent("style", "", "draft"),
    range: { from: 11, to: 16 },
    style: {
      strike: "double",
      element: "italic",
      underline: true,
      ribbon: "red",
    },
  });
  const content = paperClipboard(piece.document);
  assert.ok(content.html.includes("&lt;A &amp; title&gt;"));
  assert.ok(
    content.html.includes(
      '<h1 style="white-space:pre-wrap;margin:0">Heading</h1>',
    ),
  );
  assert.ok(
    content.html.includes(
      '<span style="color:#b23a2c"><u><em><strong>Hello</strong></em></u></span>',
    ),
  );
  assert.ok(content.html.includes("&lt;script&gt;"));
  assert.ok(content.html.includes("<br>"));
  assert.equal(content.text, "<A & title>\n\nHeading\n\nHello <script>\n");
});
test("copy provides both clipboard MIME types and falls back when rich text is unavailable", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(
      globalThis,
      "navigator",
    ),
    originalItem = Object.getOwnPropertyDescriptor(globalThis, "ClipboardItem");
  const written: unknown[] = [];
  Object.defineProperty(globalThis, "ClipboardItem", {
    configurable: true,
    value: class {
      constructor(readonly data: unknown) {
        written.push(data);
      }
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        write: async (items: unknown[]) => assert.equal(items.length, 1),
        writeText: async (text: string) => written.push(text),
      },
    },
  });
  try {
    const doc = appendEvent(
      newPiece(defaultPaper),
      makeEvent("type", "Copied", "draft"),
    ).document;
    assert.equal(await copyPaper(doc), "formatted");
    const data = written[0] as Record<string, Blob>;
    assert.equal(await data["text/plain"].text(), "Copied");
    assert.ok((await data["text/html"].text()).includes("Copied"));
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: undefined,
    });
    assert.equal(await copyPaper(doc), "plain");
    assert.equal(written.at(-1), "Copied");
  } finally {
    if (originalNavigator)
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (originalItem)
      Object.defineProperty(globalThis, "ClipboardItem", originalItem);
    else Reflect.deleteProperty(globalThis, "ClipboardItem");
  }
});
