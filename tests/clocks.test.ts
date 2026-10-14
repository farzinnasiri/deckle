import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clockStyles,
  clockStyleList,
  getClockStyle,
  type ClockStyleId,
} from "../lib/clocks";
import { migrateStore } from "../lib/archive";
import { defaultSettings, newStore } from "../lib/writing";

test("all 6 clock styles exist with distinct properties", () => {
  const expectedIds: ClockStyleId[] = [
    "studio",
    "flip",
    "bauhaus",
    "deco",
    "chronometer",
    "digital",
  ];

  assert.equal(clockStyleList.length, 6);

  for (const id of expectedIds) {
    const style = clockStyles[id];
    assert.ok(style, `Clock style ${id} should exist`);
    assert.equal(style.id, id);
    assert.ok(style.name.length > 0, `Clock ${id} should have a name`);
    assert.ok(style.short.length > 0, `Clock ${id} should have a short name`);
    assert.ok(style.era.length > 0, `Clock ${id} should have an era`);
    assert.ok(style.year > 1900, `Clock ${id} should have a valid year`);
    assert.ok(style.origin.length > 0, `Clock ${id} should have an origin`);
    assert.ok(
      style.description.length > 0,
      `Clock ${id} should have a description`,
    );
    assert.ok(
      style.caseMaterial.length > 0,
      `Clock ${id} should have a case material`,
    );
    assert.ok(["analog", "flip", "digital"].includes(style.faceType));
  }
});

test("face types reflect mechanical configurations", () => {
  assert.equal(clockStyles.studio.faceType, "analog");
  assert.equal(clockStyles.flip.faceType, "flip");
  assert.equal(clockStyles.bauhaus.faceType, "analog");
  assert.equal(clockStyles.deco.faceType, "analog");
  assert.equal(clockStyles.chronometer.faceType, "analog");
  assert.equal(clockStyles.digital.faceType, "digital");
});

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

test("default desk stands a studio clock that can be switched off", () => {
  assert.equal(defaultSettings.clockStyle, "studio");
  assert.equal(defaultSettings.clock, true);
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

test("DeskClock renders face up with distinct markup for all 6 styles", () => {
  const time = new Date(2026, 9, 8, 14, 30, 45);

  // 1. Studio
  const studioHtml = renderToStaticMarkup(
    React.createElement(DeskClock, {
      time,
      hidden: false,
      style: "studio",
    }),
  );
  assert.ok(studioHtml.includes("clock-style-studio"));
  assert.ok(studioHtml.includes("studio-dial"));
  assert.ok(studioHtml.includes("DECKLE"));

  // 2. Flip
  const flipHtml = renderToStaticMarkup(
    React.createElement(DeskClock, {
      time,
      hidden: false,
      style: "flip",
    }),
  );
  assert.ok(flipHtml.includes("clock-style-flip"));
  assert.ok(flipHtml.includes("clock-flip-assembly"));
  assert.ok(flipHtml.includes("flip-housing-bezel"));
  assert.ok(flipHtml.includes("flip-hours"));
  assert.ok(flipHtml.includes("flip-minutes"));
  assert.ok(flipHtml.includes("CIFRA · DECKLE"));

  // 3. Bauhaus
  const bauhausHtml = renderToStaticMarkup(
    React.createElement(DeskClock, {
      time,
      hidden: false,
      style: "bauhaus",
    }),
  );
  assert.ok(bauhausHtml.includes("clock-style-bauhaus"));
  assert.ok(bauhausHtml.includes("bauhaus-dial"));
  assert.ok(bauhausHtml.includes("radial-batons"));
  assert.ok(bauhausHtml.includes("JUNGHANS"));

  // 4. Deco
  const decoHtml = renderToStaticMarkup(
    React.createElement(DeskClock, {
      time,
      hidden: false,
      style: "deco",
    }),
  );
  assert.ok(decoHtml.includes("clock-style-deco"));
  assert.ok(decoHtml.includes("deco-dial"));
  assert.ok(decoHtml.includes("deco-inner-ring"));
  assert.ok(decoHtml.includes("TELECHRON"));

  // 5. Chronometer
  const chronoHtml = renderToStaticMarkup(
    React.createElement(DeskClock, {
      time,
      hidden: false,
      style: "chronometer",
    }),
  );
  assert.ok(chronoHtml.includes("clock-style-chronometer"));
  assert.ok(chronoHtml.includes("marine-dial"));
  assert.ok(chronoHtml.includes("marine-subdial"));
  assert.ok(chronoHtml.includes("DECKLE · 17 RUBIS"));

  // 6. Digital
  const digitalHtml = renderToStaticMarkup(
    React.createElement(DeskClock, {
      time,
      hidden: false,
      style: "digital",
    }),
  );
  assert.ok(digitalHtml.includes("clock-style-digital"));
  assert.ok(digitalHtml.includes("clock-digital-assembly"));
  assert.ok(digitalHtml.includes("vfd-bezel"));
  assert.ok(digitalHtml.includes("LUMITRON"));
});

test("every analog clock displays seconds and clocks have no caseback", () => {
  for (const style of [
    "studio",
    "bauhaus",
    "deco",
    "chronometer",
    "flip",
    "digital",
  ] as ClockStyleId[]) {
    const html = renderToStaticMarkup(
      React.createElement(DeskClock, {
        time: new Date(2026, 9, 8, 14, 30, 45),
        hidden: false,
        style,
      }),
    );
    assert.ok(!html.includes("caseback"));
    assert.ok(!html.includes("face-down"));
    assert.ok(
      html.includes(
        style === "chronometer"
          ? "subdial-hand"
          : style === "digital"
            ? "vfd-seconds"
            : style === "flip"
              ? "flip-seconds"
              : "clock-hand second",
      ),
    );
  }
});

test("DeskClock renders tactile on-clock sound toggle crown and handles position", () => {
  const time = new Date(2026, 9, 8, 14, 30, 45);

  // When ticking is false
  const mutedHtml = renderToStaticMarkup(
    React.createElement(DeskClock, {
      time,
      hidden: false,
      style: "chronometer",
      ticking: false,
      position: { x: 45, y: -30 },
    }),
  );
  assert.ok(mutedHtml.includes("clock-sound-crown"));
  assert.ok(mutedHtml.includes("crown-chronometer"));
  assert.ok(mutedHtml.includes("ticking-muted"));
  assert.ok(mutedHtml.includes("translate:45px -30px"));
  assert.ok(mutedHtml.includes("--clock-drag-x:45px"));
  assert.ok(mutedHtml.includes("--clock-drag-y:-30px"));

  // When ticking is true
  const activeHtml = renderToStaticMarkup(
    React.createElement(DeskClock, {
      time,
      hidden: false,
      style: "studio",
      ticking: true,
    }),
  );
  assert.ok(activeHtml.includes("clock-sound-crown"));
  assert.ok(activeHtml.includes("ticking-active"));
  assert.ok(activeHtml.includes('aria-pressed="true"'));
});

test("MachineAudio has clock audio methods for lift, place, button and tick", () => {
  const { machineAudio } = require("../lib/audio");
  assert.equal(typeof machineAudio.clockTick, "function");
  assert.equal(typeof machineAudio.clockLift, "function");
  assert.equal(typeof machineAudio.clockPlace, "function");
  assert.equal(typeof machineAudio.clockButton, "function");
});
