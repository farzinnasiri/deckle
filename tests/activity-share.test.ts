import { test } from "node:test";
import assert from "node:assert/strict";
import { characterCount, recordWriting, settleActivity } from "../lib/activity";
import { newStore, newPiece, appendEvent, makeEvent } from "../lib/writing";
import { migrateStore } from "../lib/archive";
import {
  shareExcerpt,
  SHARE_FORMATS,
  imageName,
  xPostUrl,
  mobileSharingDevice,
} from "../lib/share";
import { editingText } from "../lib/editor-model";

test("writing charges once per day, counts spaces and user-perceived Unicode characters", () => {
  let activity = recordWriting(undefined, "2026-10-11", "Hi 👩‍👩‍👧‍👦");
  assert.equal(activity.charge, 20);
  assert.equal(activity.characters, 4);
  activity = recordWriting(activity, "2026-10-11", " ");
  activity = recordWriting(activity, "2026-10-11", "Again");
  assert.equal(activity.charge, 20);
  assert.equal(activity.characters, 10);
  assert.equal(characterCount("é\n🎉"), 2);
  assert.equal(recordWriting(undefined, "2026-10-11", "\n ").charge, 0);
});
test("only completed inactive days drain charge; repeated reads and clock changes never charge or drain again", () => {
  const active = recordWriting(undefined, "2026-10-11", "Writing");
  const tomorrow = settleActivity(active, "2026-10-12");
  assert.equal(tomorrow.charge, 20);
  assert.equal(tomorrow.characters, 0);
  const next = settleActivity(tomorrow, "2026-10-13");
  assert.equal(next.charge, 15);
  assert.deepEqual(settleActivity(next, "2026-10-13"), next);
  assert.equal(settleActivity(active, "2027-1-1").charge, 0);
  assert.equal(settleActivity(active, "2026-10-1").charge, 20);
  assert.equal(recordWriting(next, "2026-10-13", "Hello").charge, 35);
});
test("charge stays bounded across month/year and daylight-saving boundaries, and backup migration retains activity", () => {
  const charged = {
    day: "2026-10-24",
    characters: 100,
    charge: 95,
    charged: true,
  };
  assert.equal(recordWriting(charged, "2026-10-25", "Hello").charge, 100);
  assert.equal(settleActivity(charged, "2026-10-26").charge, 90);
  const desk = { ...newStore(), activity: charged };
  assert.deepEqual(
    migrateStore(JSON.parse(JSON.stringify(desk))).activity,
    charged,
  );
  assert.throws(
    () => migrateStore({ ...desk, activity: { ...charged, charge: 200 } }),
    /activity/,
  );
});
test("every aspect ratio shares a bounded opening excerpt with an ellipsis without changing the saved document", () => {
  const piece = appendEvent(
    newPiece(),
    makeEvent("type", "A thoughtful sentence. ".repeat(170), "draft"),
  );
  const before = JSON.stringify(piece.document);
  const original = editingText(piece.document).replace(/\n/g, "");
  for (const format of SHARE_FORMATS) {
    const excerpt = shareExcerpt(piece.document, format);
    const text = editingText(excerpt.document).replace(/\n/g, "");
    assert.equal(excerpt.truncated, true);
    assert.ok(text.endsWith("…"));
    assert.ok(text.length < 750);
    assert.ok(original.startsWith(text.slice(0, -1)));
    assert.equal(excerpt.document.title, undefined);
  }
  assert.equal(JSON.stringify(piece.document), before);
});
test("short papers are shared in full; blank rows do not overflow a wide excerpt", () => {
  const short = appendEvent(
    newPiece(),
    makeEvent("type", "Dear future me,\n\nKeep writing.", "draft"),
  );
  const excerpt = shareExcerpt(short.document, SHARE_FORMATS[0]);
  assert.equal(excerpt.truncated, false);
  assert.equal(editingText(excerpt.document), editingText(short.document));
  const long = appendEvent(
    newPiece(),
    makeEvent("type", "A paragraph\n\n".repeat(80), "draft"),
  );
  const wide = shareExcerpt(long.document, SHARE_FORMATS[3]);
  assert.equal(wide.truncated, true);
  assert.ok(editingText(wide.document).split("\n").length <= 5);
});
test("share excerpts preserve ink formatting, literal text and safe PNG filenames", () => {
  const piece = appendEvent(
    newPiece(),
    makeEvent("type", "<script> **literal**", "draft"),
  );
  piece.document.marks = piece.document.marks.map((m) => ({
    ...m,
    ribbon: "red",
    underline: true,
  }));
  const page = shareExcerpt(piece.document, SHARE_FORMATS[0]).document;
  assert.ok(page.marks.every((m) => m.ribbon === "red" && m.underline));
  assert.equal(editingText(page), "<script> **literal**");
  assert.equal(
    imageName("../Hello <world>", SHARE_FORMATS[2]),
    "Hello world-story.png",
  );
});

test("daily activity survives reload in the account desk and stays separate from another account", async () => {
  const { createDeskStorage } = await import("../lib/storage");
  const { localDay } = await import("../lib/writing");
  const a = createDeskStorage("activity-writer"),
    b = createDeskStorage("activity-other");
  const activity = recordWriting(undefined, localDay(), "Today's writing");
  await a.saveStore({ ...newStore(), activity }, true);
  assert.deepEqual(
    (await createDeskStorage("activity-writer").loadStore()).activity,
    activity,
  );
  assert.equal((await b.loadStore()).activity?.charge, 0);
});
import "fake-indexeddb/auto";

test("sharing zoom keeps every format bounded without changing the original paper", () => {
  const piece = appendEvent(
    newPiece(),
    makeEvent("type", "A thoughtful sentence. ".repeat(170), "draft"),
  );
  const original = JSON.stringify(piece.document);
  for (const format of SHARE_FORMATS) {
    const normal = editingText(
      shareExcerpt(piece.document, format, 1).document,
    );
    const zoomed = editingText(
      shareExcerpt(piece.document, format, 1.4).document,
    );
    assert.ok(zoomed.length < normal.length);
    assert.ok(zoomed.endsWith("…"));
    for (const zoom of [0.8, 1, 1.4]) {
      const excerpt = shareExcerpt(piece.document, format, zoom);
      assert.ok(
        editingText(excerpt.document)
          .split("\n")
          .every((line) => Array.from(line).length <= Math.floor(52 / zoom)),
      );
    }
  }
  assert.equal(JSON.stringify(piece.document), original);
});
test("X composer links contain the paper excerpt with safe encoding and bounded Unicode", () => {
  let piece = appendEvent(
    newPiece(),
    makeEvent("type", "Words & signs # + ? and 👩‍👩‍👧‍👦", "draft"),
  );
  let url = new URL(xPostUrl(piece));
  assert.equal(url.origin + url.pathname, "https://x.com/intent/tweet");
  assert.equal(url.searchParams.get("text"), "Words & signs # + ? and 👩‍👩‍👧‍👦");
  piece = appendEvent(
    newPiece(),
    makeEvent("type", "你好".repeat(300), "draft"),
  );
  url = new URL(xPostUrl(piece));
  assert.ok(Array.from(url.searchParams.get("text")!).length <= 120);
  assert.ok(url.searchParams.get("text")!.endsWith("…"));
});
test("Instagram file sharing is offered to phones and iPads, not desktop share sheets", () => {
  assert.equal(mobileSharingDevice("Mozilla Android", "Linux", 5), true);
  assert.equal(mobileSharingDevice("Mozilla iPhone", "iPhone", 5), true);
  assert.equal(mobileSharingDevice("Mozilla Mac", "MacIntel", 5), true);
  assert.equal(mobileSharingDevice("Mozilla Mac", "MacIntel", 0), false);
  assert.equal(mobileSharingDevice("Windows", "Win32", 0), false);
});
