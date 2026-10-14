import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stocks } from "../lib/materials";

const root = process.cwd();

test("all curated paper stock textures exist and are valid 512x512 PNGs", () => {
  const stockKeys = Object.keys(stocks);
  assert.equal(stockKeys.length, 6, "Expected 6 paper stocks");

  const filesToCheck = [
    "paper.png",
    ...stockKeys.map((s) => `paper-${s}.png`),
  ];

  for (const filename of filesToCheck) {
    const filePath = join(root, "public", "textures", filename);
    assert.ok(existsSync(filePath), `Texture file ${filename} must exist`);

    const buf = readFileSync(filePath);
    assert.ok(buf.length > 50000, `Texture file ${filename} should have rich detail (>50KB)`);

    // Verify PNG signature: 137 80 78 71 13 10 26 10
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) {
      assert.equal(buf[i], pngSignature[i], `Valid PNG header byte ${i} for ${filename}`);
    }

    // Verify IHDR dimensions (512x512)
    // Offset 16 is width (4 bytes BE), offset 20 is height (4 bytes BE)
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    assert.equal(width, 512, `${filename} width must be 512`);
    assert.equal(height, 512, `${filename} height must be 512`);
  }
});

test("each stock texture has distinct physical characteristics and size profiles", () => {
  const bond = readFileSync(join(root, "public", "textures", "paper-bond.png"));
  const kraft = readFileSync(join(root, "public", "textures", "paper-kraft.png"));
  const recycled = readFileSync(join(root, "public", "textures", "paper-recycled.png"));
  const onionskin = readFileSync(join(root, "public", "textures", "paper-onionskin.png"));

  // Heavy raw pulp kraft has highest compressed size due to woody fibers & shives
  assert.ok(
    kraft.length > bond.length,
    "Kraft paper with dense woody shives should have higher entropy than bond",
  );

  // Recycled paper with botanical flecks and reclaimed curls
  assert.ok(
    recycled.length > onionskin.length,
    "Recycled paper with dark botanical flecks has higher entropy than onionskin",
  );
});
