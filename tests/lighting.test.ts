import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newStore } from "../lib/writing";
import {
  RoomWallSwitch,
  DeskLampDimmer,
  RailLightFader,
} from "../components/lighting-controls";
import { migrateStore } from "../lib/archive";
import {
  reflectedLight,
  transmittedLight,
  type LampGeometry,
} from "../lib/light-beam";
import { desks, lightColor } from "../lib/materials";

test("new desks open with the room light and both lamps on", () => {
  const { settings } = newStore();
  assert.equal(settings.roomLight, true);
  assert.ok(settings.deskLightIntensity! > 0);
  assert.ok(settings.railLightIntensity! > 0);
  assert.equal(settings.light, "lamp");
  assert.equal(settings.deskLightTone, "tungsten");
});

const overhead: LampGeometry = {
  source: "overhead",
  x: 640,
  y: 54,
  aperture: 280,
  spread: 0.5,
  reach: 0.6,
  availableReach: 700,
};

test("overhead illumination falls off from the source and respects surface orientation", () => {
  const sample = (x: number, y: number) =>
    reflectedLight(overhead, { x, y, surface: "paper" }, 600);
  assert.equal(sample(640, 40).diffuse, 0, "shade prevents upward emission");
  assert.ok(sample(640, 350).diffuse > sample(640, 600).diffuse);
  assert.ok(sample(640, 450).diffuse > sample(100, 450).diffuse);
  assert.ok(
    Math.abs(sample(440, 450).diffuse - sample(840, 450).diffuse) < 1e-9,
  );
  const deck = reflectedLight(
    overhead,
    { x: 640, y: 600, surface: "deck", curvature: 0 },
    600,
  );
  const face = reflectedLight(
    overhead,
    { x: 640, y: 600, surface: "face" },
    600,
  );
  assert.ok(
    deck.diffuse > face.diffuse,
    "upward facing lip catches more light than front panel",
  );
  assert.equal(sample(640, 450).specular, 0, "paper has no polished highlight");
});

test("rail light reads as a full strip and diffuses upward through the sheet", () => {
  const rail: LampGeometry = {
    ...overhead,
    source: "rail",
    y: 600,
    aperture: 860,
  };
  const sample = (x: number, y: number) =>
    transmittedLight(rail, { x, y, surface: "paper" }, 300, 224);
  assert.ok(sample(640, 590).diffuse > sample(640, 450).diffuse * 2);
  assert.ok(sample(640, 450).diffuse > sample(640, 300).diffuse);
  assert.ok(
    sample(350, 590).diffuse > sample(640, 590).diffuse * 0.9,
    "source spans the slot rather than forming a central spot",
  );
  const moved = transmittedLight(
    { ...rail, y: 400 },
    { x: 640, y: 390, surface: "paper" },
    300,
    224,
  );
  assert.equal(
    moved.diffuse,
    sample(640, 590).diffuse,
    "source follows the machine",
  );
});

test("rail spill reaches the desk and the machine occludes the forward light", () => {
  const rail: LampGeometry = {
    ...overhead,
    source: "rail",
    y: 600,
    aperture: 860,
  };
  const sample = (x: number, y: number) =>
    transmittedLight(rail, { x, y, surface: "wood" }, 300, 224);
  assert.ok(
    sample(1170, 650).diffuse > 0.05,
    "light escapes around the housing ends",
  );
  assert.ok(
    sample(1170, 840).diffuse > sample(640, 840).diffuse * 4,
    "housing casts a shadow in front",
  );
  assert.ok(sample(1170, 650).diffuse > sample(1700, 650).diffuse);
  for (const x of [0, 640, 1170, 2000])
    for (const y of [54, 300, 600, 824, 1200]) {
      const response = sample(x, y);
      assert.ok(Number.isFinite(response.diffuse) && response.diffuse >= 0);
      assert.ok(Number.isFinite(response.specular) && response.specular >= 0);
    }
});

test("custom lamp colours are safe channels and affect both source types", () => {
  assert.equal(lightColor("amber", "#48b9df"), "72 185 223");
  assert.equal(lightColor("amber", "not a colour"), "255 195 119");
  assert.equal(lightColor("tungsten", "#48b9df"), "72 185 223");
});

test("lighting controls expose their state and value without relying on visual styling", () => {
  for (const on of [false, true]) {
    const html = renderToStaticMarkup(
      React.createElement(RoomWallSwitch, {
        on,
        onToggle: () => {},
        hidden: false,
      }),
    );
    assert.match(html, /role="switch"/);
    assert.ok(html.includes(`aria-checked="${on}"`));
  }
  for (const intensity of [0, 0.8]) {
    const lamp = renderToStaticMarkup(
      React.createElement(DeskLampDimmer, {
        intensity,
        onChange: () => {},
        hidden: false,
      }),
    );
    assert.match(lamp, /role="slider"/);
    assert.ok(lamp.includes(`aria-valuenow="${intensity * 100}"`));
    const rail = renderToStaticMarkup(
      React.createElement(RailLightFader, {
        intensity,
        onChange: () => {},
      }),
    );
    assert.match(rail, /type="range"/);
    assert.match(rail, /aria-label="Rail light brightness"/);
    assert.ok(
      rail.includes(
        intensity ? 'aria-valuetext="80 percent"' : 'aria-valuetext="Off"',
      ),
    );
  }
});

test("lamp settings survive reload independently and legacy rail selection keeps its light", () => {
  const desk = newStore();
  desk.settings = {
    ...desk.settings,
    roomLight: false,
    deskLightIntensity: 0.8,
    railLightIntensity: 0.45,
    deskLightColor: "#ffd6a0",
    railLightColor: "#b5d8ff",
    deskLightSpread: 0.3,
    railLightSpread: 0.75,
  };
  const restored = migrateStore(JSON.parse(JSON.stringify(desk)));
  assert.equal(restored.settings.roomLight, false);
  assert.equal(restored.settings.deskLightIntensity, 0.8);
  assert.equal(restored.settings.railLightIntensity, 0.45);
  assert.equal(restored.settings.deskLightColor, "#ffd6a0");
  assert.equal(restored.settings.railLightColor, "#b5d8ff");
  const legacy = newStore();
  legacy.settings.deskLightSource = "rail";
  legacy.settings.deskLightIntensity = 0.7;
  delete legacy.settings.railLightIntensity;
  const migrated = migrateStore(legacy);
  assert.equal(migrated.settings.deskLightIntensity, 0);
  assert.equal(migrated.settings.railLightIntensity, 0.7);
  assert.equal(migrated.settings.deskLightSource, undefined);
  assert.throws(
    () =>
      migrateStore({
        ...desk,
        settings: { ...desk.settings, railLightIntensity: 4 },
      }),
    /lamp settings/,
  );
});

test("Cherry is the default for unconfigured desks, while all saved surfaces survive backup import", () => {
  assert.equal(newStore().settings.desk, "cherry");
  const unconfigured = newStore();
  delete unconfigured.settings.desk;
  assert.equal(migrateStore(unconfigured).settings.desk, "cherry");
  assert.equal(Object.keys(desks).length, 8);
  for (const desk of Object.keys(desks) as (keyof typeof desks)[]) {
    const store = newStore();
    store.settings.desk = desk;
    assert.equal(
      migrateStore(JSON.parse(JSON.stringify(store))).settings.desk,
      desk,
    );
  }
});
