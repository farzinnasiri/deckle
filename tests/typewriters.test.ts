import { test } from "node:test";
import assert from "node:assert/strict";
import {
  typewriterModels,
  typewriterList,
  getTypewriterModel,
  modelVariation,
  type TypewriterId,
} from "../lib/typewriters";
import { materialProfile } from "../lib/materials";
import { defaultSettings, type Settings } from "../lib/writing";

test("all 6 typewriter models exist with distinct properties", () => {
  const expectedIds: TypewriterId[] = [
    "d01",
    "v19",
    "h03",
    "k44",
    "b18",
    "s77",
  ];
  assert.equal(typewriterList.length, 6);

  for (const id of expectedIds) {
    const model = typewriterModels[id];
    assert.ok(model, `Model ${id} should exist`);
    assert.equal(model.id, id);
    assert.ok(model.name.length > 0);
    assert.ok(model.code.length > 0);
    assert.ok(model.brand.length > 0);
    assert.ok(model.tagline.length > 0);
    assert.ok(model.badge.length > 0);
    assert.ok(model.tearLabel.length > 0);
    assert.ok(model.sound.gain > 0);
    assert.ok(model.sound.tone > 0);
    assert.ok(model.sound.thump > 0);

    // Each model has variations on multiple items/elements
    assert.ok(
      model.variations.finish.length >= 3,
      `${id} should have >= 3 finish variations`,
    );
    assert.ok(
      model.variations.knob.length >= 3,
      `${id} should have >= 3 knob variations`,
    );
    assert.ok(
      model.variations.accent.length >= 3,
      `${id} should have >= 3 accent variations`,
    );

    // Default variations match one of the available options
    assert.ok(
      model.variations.finish.some(
        (f) => f.id === model.defaultVariations.finish,
      ),
      `${id} default finish should be in options`,
    );
    assert.ok(
      model.variations.knob.some((k) => k.id === model.defaultVariations.knob),
      `${id} default knob should be in options`,
    );
    assert.ok(
      model.variations.accent.some(
        (a) => a.id === model.defaultVariations.accent,
      ),
      `${id} default accent should be in options`,
    );
  }
});

test("getTypewriterModel returns correct model or defaults to d01", () => {
  assert.equal(getTypewriterModel("v19").name, "Rossa");
  assert.equal(getTypewriterModel("h03").name, "Voyageur");
  assert.equal(getTypewriterModel("k44").name, "Torpedo");
  assert.equal(getTypewriterModel("b18").name, "Coronet");
  assert.equal(getTypewriterModel("s77").name, "Studio");
  assert.equal(getTypewriterModel("d01").name, "Continuous");

  // Fallbacks
  assert.equal(getTypewriterModel("" as any).id, "d01");
  assert.equal(getTypewriterModel("unknown" as any).id, "d01");
});

test("typewriter models distinctly affect acoustic material profile", () => {
  const d01Settings: Settings = { ...defaultSettings, model: "d01" };
  const k44Settings: Settings = { ...defaultSettings, model: "k44" };
  const h03Settings: Settings = { ...defaultSettings, model: "h03" };

  const d01Profile = materialProfile(d01Settings);
  const k44Profile = materialProfile(k44Settings);
  const h03Profile = materialProfile(h03Settings);

  // K44 (heavy industrial cast iron) has heavier thump than D01
  assert.ok(k44Profile.thump > d01Profile.thump);

  // H03 (light Swiss alpine precision) has lighter thump than K44
  assert.ok(h03Profile.thump < k44Profile.thump);

  // K44 has lower tone than H03
  assert.ok(k44Profile.tone < h03Profile.tone);
});

test("retired machine variations fall back to the model's defaults", () => {
  const k44 = getTypewriterModel("k44");
  assert.equal(modelVariation(k44, "finish", "gunmetal"), "standard");
  assert.equal(modelVariation(k44, "finish", "oxblood"), "oxblood");
  assert.equal(modelVariation(k44, "knob", undefined), "chrome");
  assert.equal(
    modelVariation(getTypewriterModel("s77"), "accent", "cobalt"),
    "signal",
  );
});
