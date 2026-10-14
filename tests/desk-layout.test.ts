import { test } from "node:test";
import assert from "node:assert/strict";
import {
  visibleControls,
  toggleControl,
  MACHINE_CONTROLS,
} from "../lib/desk-layout";
import { newStore } from "../lib/writing";
import { migrateStore } from "../lib/archive";

test("existing desks retain every control, while presets produce distinct writing layouts", () => {
  assert.deepEqual(
    visibleControls(),
    MACHINE_CONTROLS.map((c) => c.id),
  );
  const minimal = visibleControls({ layoutPreset: "minimal" });
  const balanced = visibleControls({ layoutPreset: "balanced" });
  assert.ok(minimal.includes("save") && minimal.includes("light"));
  assert.ok(!minimal.includes("bold") && balanced.includes("bold"));
  assert.ok(
    balanced.length > minimal.length &&
      balanced.length < visibleControls().length,
  );
});
test("advanced choices build on the selected preset and survive a backup round trip, including an empty panel", () => {
  const store = newStore();
  store.settings = { ...store.settings, layoutPreset: "minimal" };
  const removed = {
    ...store.settings,
    ...toggleControl(store.settings, "feed"),
  };
  assert.equal(removed.layoutPreset, "custom");
  assert.ok(!visibleControls(removed).includes("feed"));
  const added = { ...removed, ...toggleControl(removed, "italic") };
  assert.ok(visibleControls(added).includes("italic"));
  assert.deepEqual(
    migrateStore(JSON.parse(JSON.stringify({ ...store, settings: added })))
      .settings,
    added,
  );
  assert.deepEqual(
    visibleControls({ layoutPreset: "custom", visibleControls: [] }),
    [],
  );
  assert.throws(
    () =>
      migrateStore({
        ...store,
        settings: { ...added, visibleControls: ["unknown"] },
      }),
    /layout/,
  );
});
