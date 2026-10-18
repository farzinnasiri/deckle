import { test } from "node:test";
import assert from "node:assert/strict";
import { getTypewriterModel, modelVariation } from "../lib/typewriters";
import { materialProfile } from "../lib/materials";
import { defaultSettings, type Settings } from "../lib/writing";

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
  assert.equal(getTypewriterModel(undefined).id, "d01");
  const k44 = getTypewriterModel("k44");
  assert.equal(modelVariation(k44, "finish", "gunmetal"), "standard");
  assert.equal(modelVariation(k44, "finish", "oxblood"), "oxblood");
  assert.equal(modelVariation(k44, "knob", undefined), "chrome");
  assert.equal(
    modelVariation(getTypewriterModel("s77"), "accent", "cobalt"),
    "signal",
  );
});
