import { test } from "node:test";
import assert from "node:assert/strict";
import { getClockStyle } from "../lib/clocks";
import { migrateStore } from "../lib/archive";
import { defaultSettings, newStore } from "../lib/writing";

test("getClockStyle helper resolves known and unknown ids", () => {
  assert.equal(getClockStyle("studio").id, "studio");
  assert.equal(getClockStyle("flip").id, "flip");
  assert.equal(getClockStyle("bauhaus").id, "bauhaus");
  assert.equal(getClockStyle("deco").id, "deco");
  assert.equal(getClockStyle("chronometer").id, "chronometer");
  assert.equal(getClockStyle("digital").id, "digital");

  // Fallback to studio
  assert.equal(getClockStyle(undefined).id, "studio");
  assert.equal(getClockStyle("unknown").id, "studio");
});

test("a desk saved with the clock off shows it again unless the owner chose that", () => {
  const saved = (settings: object) =>
    migrateStore({
      ...newStore(),
      settings: { ...defaultSettings, ...settings },
    }).settings.clock;
  assert.equal(saved({ clock: false }), true);
  assert.equal(saved({ clock: false, clockChosen: true }), false);
  assert.equal(saved({ clock: true, clockChosen: true }), true);
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DeskClock } from "../components/desk-clock";

test("the clock exposes its time and ticking state to assistive technology", () => {
  const time = new Date(2026, 9, 8, 14, 30, 45);
  for (const ticking of [false, true]) {
    const html = renderToStaticMarkup(
      React.createElement(DeskClock, {
        time,
        hidden: false,
        style: "chronometer",
        ticking,
      }),
    );
    assert.ok(html.includes(time.toLocaleTimeString()));
    assert.ok(html.includes(`aria-pressed="${ticking}"`));
    assert.ok(html.includes(ticking ? "Turn off ticking" : "Turn on ticking"));
  }
});
