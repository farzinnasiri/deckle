import { test } from "node:test";
import assert from "node:assert/strict";
import { CREST_RADIUS, paperCurlProfile } from "../lib/paper-curl";
import { typeSize, typeSizePatch, TYPE_SIZES } from "../lib/type-size";
import { newStore } from "../lib/writing";
import { migrateStore } from "../lib/archive";

test("fresh sheets stay flat and the crest stays bounded for very long writing", () => {
  assert.deepEqual(paperCurlProfile(100), { crest: 0, strength: 0 });
  assert.deepEqual(paperCurlProfile(0), { crest: 0, strength: 0 });
  let previous = paperCurlProfile(0);
  for (const excess of [0.01, 1, 30, 100, 500, 100_000]) {
    const curl = paperCurlProfile(-excess);
    assert.ok(curl.crest >= previous.crest && curl.crest <= CREST_RADIUS);
    assert.ok(curl.strength >= previous.strength && curl.strength <= 1);
    previous = curl;
  }
  assert.ok(paperCurlProfile(-0.01).crest < 0.01);
  assert.deepEqual(paperCurlProfile(Infinity), paperCurlProfile(0));
});

test("feeding back relaxes the curl along the same path", () => {
  const forward = [-10, -30, -100, -500].map(paperCurlProfile);
  const back = [-500, -100, -30, -10].map(paperCurlProfile).reverse();
  assert.deepEqual(back, forward);
});

test("legacy type sizes remain Standard or Large; all four levels survive backups", () => {
  assert.equal(typeSize({ largeType: false }), 2);
  assert.equal(typeSize({ largeType: true }), 3);
  assert.equal(new Set(TYPE_SIZES.map((s) => s.pixels)).size, 4);
  for (const level of [1, 2, 3, 4] as const) {
    const store = newStore();
    store.settings = { ...store.settings, ...typeSizePatch(level) };
    const restored = migrateStore(JSON.parse(JSON.stringify(store)));
    assert.equal(typeSize(restored.settings), level);
    assert.equal(restored.settings.largeType, level >= 3);
  }
});

test("unsupported font detents cannot enter through an imported backup", () => {
  for (const invalid of [0, 5, 2.5, "2"]) {
    const store = newStore();
    assert.throws(
      () =>
        migrateStore({
          ...store,
          settings: { ...store.settings, typeSize: invalid },
        }),
      /type size/,
    );
  }
});

test("desktop settings center the scaled desk and leave room above the paper fold", async () => {
  const { inspectorPlacement } = await import("../lib/desk-scene");
  for (const [width, height] of [
    [1249, 900],
    [932, 982],
    [1600, 1200],
    [1024, 400],
  ]) {
    const stageWidth = Math.min(1120, width - 48),
      contentHeight = Math.min(916, height - 160);
    const view = inspectorPlacement({
      width,
      height,
      stageWidth,
      contentHeight,
      paddingTop: 76,
    });
    const top = 76 + view.y,
      bottom = top + contentHeight * view.scale;
    assert.ok(view.scale > 0 && view.scale <= 1);
    assert.ok(Math.abs(top - (height - bottom)) < 0.001);
    assert.ok(top - 56 * view.scale >= 20);
    assert.ok(stageWidth * view.scale <= width - 404 + 0.001);
  }
});
test("lighting material bounds remain fixed while the desk camera moves in either direction", async () => {
  const { sceneRectangle } = await import("../lib/desk-scene");
  const original = { left: 184, top: 76, width: 912, height: 444 };
  for (const scale of [1, 0.94, 0.78, 0.62, 1.12]) {
    const camera = {
      scale,
      x: -178 * (1 - scale),
      y: 52 * (1 - scale),
      originX: 530,
      originY: 0,
    };
    const stage = {
      left: 110 + camera.x + camera.originX * (1 - scale),
      top: 76 + camera.y,
    };
    const transformed = {
      left: stage.left + (original.left - 110) * scale,
      top: stage.top,
      width: original.width * scale,
      height: original.height * scale,
    };
    const recovered = sceneRectangle(transformed, stage, camera);
    for (const key of ["left", "top", "width", "height"] as const) {
      assert.ok(Math.abs(recovered[key] - original[key]) < 0.001);
    }
  }
});
