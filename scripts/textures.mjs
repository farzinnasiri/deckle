import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
let seed = 73571;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
function crc(b) {
  let c = -1;
  for (const v of b) {
    c ^= v;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ -1) >>> 0;
}
function chunk(name, data) {
  const n = Buffer.from(name),
    b = Buffer.concat([n, data]),
    l = Buffer.alloc(4),
    c = Buffer.alloc(4);
  l.writeUInt32BE(data.length);
  c.writeUInt32BE(crc(b));
  return Buffer.concat([l, b, c]);
}
function png(path, w, h, fn, channels = 3) {
  const stride = w * channels + 1;
  const bytes = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      for (let j = 0; j < channels; j++)
        bytes[y * stride + 1 + x * channels + j] = Math.max(
          0,
          Math.min(255, Math.round(c[j])),
        );
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  header[9] = channels === 4 ? 6 : 2;
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(bytes)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
// Walnut: flat-sawn grain. Growth rings wander with a slow warp, fibres
// run along the board, and open pores leave short dark dashes.
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    xf = x - xi,
    yf = y - yi;
  const u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi),
    b = hash(xi + 1, yi),
    c = hash(xi, yi + 1),
    d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
{
  const W = 2048,
    H = 1536;
  png("public/textures/walnut.png", W, H, (x, y) => {
    const warp =
      (noise(x / 1400, y / 700) - 0.5) * 150 +
      (noise(x / 380, y / 260 + 9) - 0.5) * 22;
    const g = y + warp;
    // Irregular ring spacing: some wide, some crowded together.
    const r =
      g / 34 + noise(x / 2000, g / 90) * 2.2 + noise(x / 600, g / 30) * 0.5;
    const late = Math.pow(Math.max(0, Math.sin((r % 1) * Math.PI)), 6);
    const patch = noise(x / 700 + 40, y / 500);
    const streak = noise(x / 260, g * 0.5) - 0.5;
    const fibre = noise(x / 60, g * 1.3) - 0.5;
    const fine = noise(x / 9, g * 3) - 0.5;
    const pore =
      hash(Math.floor(x / 11), Math.floor(g * 1.3)) > 0.988 ? -10 : 0;
    const l =
      31 + patch * 14 - late * 8 + streak * 12 + fibre * 6 + fine * 3 + pore;
    return [l * 1.6 + 6, l * 1.1 + 2, l * 0.74];
  });
}
// Tileable value field: a sum of waves with whole-number frequencies.
function field(size, waves, amplitude, minFreq = 1, maxFreq = 8) {
  const parts = Array.from({ length: waves }, () => {
    let fx = 0,
      fy = 0;
    while (fx === 0 && fy === 0) {
      fx =
        Math.floor(random() * (maxFreq - minFreq + 1) + minFreq) *
        (random() < 0.5 ? 1 : -1);
      fy =
        Math.floor(random() * (maxFreq - minFreq + 1) + minFreq) *
        (random() < 0.5 ? 1 : -1);
    }
    return {
      fx,
      fy,
      phase: random() * Math.PI * 2,
      weight: 0.5 + random() * 0.5,
    };
  });
  return (x, y) =>
    parts.reduce(
      (n, p) =>
        n +
        Math.sin(((p.fx * x + p.fy * y) / size) * Math.PI * 2 + p.phase) *
          p.weight,
      0,
    ) *
    (amplitude / waves);
}

// Seamless toroidal coordinate wrapping
const wrap = (v, max) => ((v % max) + max) % max;

// Anti-aliased curved cellulose fiber simulator
function drawFiber(
  heightMap,
  albedoMap,
  size,
  x0,
  y0,
  length,
  angle,
  curvature,
  thickness,
  hPeak,
  aTone,
) {
  let x = x0;
  let y = y0;
  let curAngle = angle;
  const steps = Math.ceil(length * 1.5);
  const stepDist = length / steps;
  const rx = Math.ceil(thickness);
  const ry = Math.ceil(thickness);
  const radSq = thickness * thickness;

  for (let s = 0; s < steps; s++) {
    curAngle += (random() - 0.5) * curvature;
    x += Math.cos(curAngle) * stepDist;
    y += Math.sin(curAngle) * stepDist;

    const xi = Math.floor(x);
    const yi = Math.floor(y);

    for (let dy = -ry; dy <= ry; dy++) {
      for (let dx = -rx; dx <= rx; dx++) {
        const px = wrap(xi + dx, size);
        const py = wrap(yi + dy, size);
        const distSq = (x - (xi + dx)) ** 2 + (y - (yi + dy)) ** 2;
        if (distSq < radSq) {
          const w = 1 - Math.sqrt(distSq) / thickness;
          const idx = py * size + px;
          heightMap[idx] += hPeak * w;
          albedoMap[idx] += aTone * w;
        }
      }
    }
  }
}

// Botanical fleck and shive drawer
function drawFleck(
  heightMap,
  albedoMap,
  size,
  x0,
  y0,
  rx,
  ry,
  angle,
  hPeak,
  aTone,
) {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const maxR = Math.ceil(Math.max(rx, ry));
  const xi = Math.floor(x0);
  const yi = Math.floor(y0);

  for (let dy = -maxR; dy <= maxR; dy++) {
    for (let dx = -maxR; dx <= maxR; dx++) {
      const px = wrap(xi + dx, size);
      const py = wrap(yi + dy, size);
      const ex = dx * cosA + dy * sinA;
      const ey = -dx * sinA + dy * cosA;
      const d = (ex / rx) ** 2 + (ey / ry) ** 2;
      if (d < 1) {
        const w = (1 - d) ** 1.5;
        const idx = py * size + px;
        heightMap[idx] += hPeak * w;
        albedoMap[idx] += aTone * w;
      }
    }
  }
}

// Physical Paper Texture Generator:
// Directional 3D micro-relief shading from grazing light (top-left desk lamp),
// cellulose fibers, mold wire lines, cockle finish, and organic pulp tooth.
function generatePaperTexture({
  size = 512,
  baseRgb = [240, 233, 214],
  reliefStrength = 4.8,
  lightAngle = (Math.PI * 3) / 4, // 135 deg: grazing light from top-left
  cloudAmp = 8,
  feltAmp = 3.5,
  toothAmp = 0.9,
  laidLines = 0,
  laidAmp = 0,
  chainLines = 0,
  chainAmp = 0,
  wireGrid = false,
  wireGridAmp = 0,
  cockleAmp = 0,
  fibers = [],
  flecks = [],
  albedoScale = 1.0,
}) {
  const height = new Float32Array(size * size);
  const albedo = new Float32Array(size * size);

  // 1. Formation clouds (low frequency pulp flocculation)
  const cloud = field(size, 16, cloudAmp, 1, 4);
  // 2. Felt grain (mid frequency wet-press mark)
  const felt = field(size, 20, feltAmp, 5, 14);

  // 3. Pre-fill base height & mold wire formations
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = cloud(x, y) + felt(x, y);

      // Laid lines (horizontal wire marks with subtle hand-made wobble)
      if (laidLines > 0 && laidAmp > 0) {
        const wobble = Math.sin((x / size) * Math.PI * 4) * 0.4;
        const ly = ((y + wobble) / size) * laidLines * Math.PI * 2;
        h += Math.sin(ly) * laidAmp;
      }

      // Chain lines (vertical wire ties sewn to ribs)
      if (chainLines > 0 && chainAmp > 0) {
        const cx = (x / size) * chainLines * Math.PI * 2;
        const wire = Math.cos(cx);
        h += (Math.pow((wire + 1) * 0.5, 4) - 0.5) * chainAmp;
      }

      // Fine wire screen grid (manifold paper)
      if (wireGrid && wireGridAmp > 0) {
        const gx = Math.sin((x / size) * 128 * Math.PI * 2);
        const gy = Math.sin((y / size) * 128 * Math.PI * 2);
        h += (gx + gy) * 0.5 * wireGridAmp;
      }

      // Cockle finish (organic unrestrained air-dried puckering)
      if (cockleAmp > 0) {
        const cu = (x / size) * Math.PI * 4;
        const cv = (y / size) * Math.PI * 4;
        const puckering =
          Math.sin(cu + Math.sin(cv * 1.5)) *
            Math.cos(cv + Math.sin(cu * 1.5)) +
          Math.sin(cu * 2.5 + cv) * 0.35;
        h += puckering * cockleAmp;
      }

      // Micro tooth in heightfield: gives 3D tactile bite to every microscopic pore
      if (toothAmp > 0) {
        h += (random() - 0.5) * toothAmp;
      }

      height[y * size + x] = h;
    }
  }

  // 4. Draw individual organic cellulose fibers
  for (const f of fibers) {
    for (let i = 0; i < f.count; i++) {
      const x0 = random() * size;
      const y0 = random() * size;
      const len = f.minLen + random() * (f.maxLen - f.minLen);
      let angle = random() * Math.PI * 2;
      if (f.directionBias) {
        angle =
          random() < f.directionBias
            ? (random() - 0.5) * 0.45 + (random() < 0.5 ? 0 : Math.PI)
            : random() * Math.PI * 2;
      }
      const thick = f.minThick + random() * (f.maxThick - f.minThick);
      const hPeak = f.hPeak * (0.8 + random() * 0.4);
      const aTone = f.aTone * (0.8 + random() * 0.4);
      drawFiber(
        height,
        albedo,
        size,
        x0,
        y0,
        len,
        angle,
        f.curvature,
        thick,
        hPeak,
        aTone,
      );
    }
  }

  // 5. Draw botanical flecks, shives and ink inclusions
  for (const fl of flecks) {
    for (let i = 0; i < fl.count; i++) {
      const x0 = random() * size;
      const y0 = random() * size;
      const rx = fl.minR + random() * (fl.maxR - fl.minR);
      const ry = rx * (0.4 + random() * 0.8);
      const angle = random() * Math.PI;
      const hPeak = fl.hPeak * (0.8 + random() * 0.4);
      const aTone = fl.aTone * (0.8 + random() * 0.4);
      drawFleck(height, albedo, size, x0, y0, rx, ry, angle, hPeak, aTone);
    }
  }

  // Directional grazing light vector
  const lx = -Math.cos(lightAngle);
  const ly = -Math.sin(lightAngle);

  // 6. Directional micro-relief rendering with shape-from-shading
  const out = new Uint8ClampedArray(size * size * 3);
  for (let y = 0; y < size; y++) {
    const yU = wrap(y - 1, size);
    const yD = wrap(y + 1, size);
    for (let x = 0; x < size; x++) {
      const xL = wrap(x - 1, size);
      const xR = wrap(x + 1, size);

      const idx = y * size + x;
      const dh_dx = (height[y * size + xR] - height[y * size + xL]) * 0.5;
      const dh_dy = (height[yD * size + x] - height[yU * size + x]) * 0.5;

      // Relief highlight / shadow from 3D surface gradient
      const relief = -(lx * dh_dx + ly * dh_dy) * reliefStrength;

      // Subtle fine sizing scatter
      const sizing = (random() - 0.5) * 1.5;

      const a = albedo[idx] * albedoScale;
      const delta = relief + a + sizing;

      const pIdx = (y * size + x) * 3;
      out[pIdx] = baseRgb[0] + delta;
      out[pIdx + 1] = baseRgb[1] + delta * (baseRgb[1] / baseRgb[0]);
      out[pIdx + 2] = baseRgb[2] + delta * (baseRgb[2] / baseRgb[0]);
    }
  }
  return out;
}

function writePaperPng(path, config) {
  const size = config.size || 512;
  const pixels = generatePaperTexture(config);
  png(path, size, size, (x, y) => {
    const idx = (y * size + x) * 3;
    return [pixels[idx], pixels[idx + 1], pixels[idx + 2]];
  });
}

// 1. Base Universal Paper (paper.png)
writePaperPng("public/textures/paper.png", {
  baseRgb: [238, 230, 212],
  reliefStrength: 4.8,
  cloudAmp: 8,
  feltAmp: 3.5,
  toothAmp: 0.95,
  laidLines: 128,
  laidAmp: 0.35,
  chainLines: 16,
  chainAmp: 0.65,
  fibers: [
    {
      count: 650,
      minLen: 12,
      maxLen: 40,
      curvature: 0.22,
      minThick: 0.8,
      maxThick: 1.6,
      hPeak: 1.2,
      aTone: 3.5,
    },
    {
      count: 450,
      minLen: 8,
      maxLen: 26,
      curvature: 0.28,
      minThick: 0.7,
      maxThick: 1.4,
      hPeak: 0.8,
      aTone: -2.5,
    },
    {
      count: 120,
      minLen: 16,
      maxLen: 48,
      curvature: 0.16,
      minThick: 0.9,
      maxThick: 1.9,
      hPeak: 1.7,
      aTone: 4.8,
    },
  ],
});

// The first ink mask drew from random() here. The draws are kept so every
// texture below stays byte-identical; the current mask is written last.
{
  const size = 160;
  const tooth = field(size, 40, 1);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (tooth(x, y) + (random() - 0.5) * 0.9 > 0.42) random();
}

// Bead-blasted aluminium: fine, even tooth with a faint mottling.
{
  const size = 256;
  const mottle = field(size, 18, 3);
  png("public/textures/metal.png", size, size, (x, y) => {
    const n = (random() - 0.5) * 9 + mottle(x, y);
    return [178 + n, 177 + n, 167 + n];
  });
}

// Curated Paper Stocks: Each has its own distinct physical cellulose structure,
// mold wire marks, formation, and tactile relief tooth.

// 1. Bond, cream: 24 lb heavy rag bond with laid wires and woven cotton filaments
writePaperPng("public/textures/paper-bond.png", {
  baseRgb: [240, 234, 217],
  reliefStrength: 4.8,
  cloudAmp: 8,
  feltAmp: 3.5,
  toothAmp: 0.95,
  laidLines: 128,
  laidAmp: 0.38,
  chainLines: 16,
  chainAmp: 0.7,
  fibers: [
    {
      count: 700,
      minLen: 12,
      maxLen: 42,
      curvature: 0.2,
      minThick: 0.8,
      maxThick: 1.6,
      hPeak: 1.2,
      aTone: 3.5,
    },
    {
      count: 500,
      minLen: 8,
      maxLen: 28,
      curvature: 0.28,
      minThick: 0.7,
      maxThick: 1.4,
      hPeak: 0.8,
      aTone: -2.5,
    },
    {
      count: 150,
      minLen: 18,
      maxLen: 50,
      curvature: 0.15,
      minThick: 1.0,
      maxThick: 2.0,
      hPeak: 1.8,
      aTone: 5.0,
    },
  ],
});

// 2. Bright white laid: High-clarity laid wire impressions and bright cotton tooth
writePaperPng("public/textures/paper-white.png", {
  baseRgb: [246, 245, 237],
  reliefStrength: 5.2,
  cloudAmp: 7,
  feltAmp: 3.0,
  toothAmp: 1.1,
  laidLines: 128,
  laidAmp: 0.48,
  chainLines: 16,
  chainAmp: 0.85,
  fibers: [
    {
      count: 550,
      minLen: 10,
      maxLen: 36,
      curvature: 0.2,
      minThick: 0.8,
      maxThick: 1.5,
      hPeak: 1.3,
      aTone: 3.0,
    },
    {
      count: 350,
      minLen: 6,
      maxLen: 22,
      curvature: 0.25,
      minThick: 0.7,
      maxThick: 1.3,
      hPeak: 0.9,
      aTone: -2.0,
    },
    {
      count: 120,
      minLen: 15,
      maxLen: 42,
      curvature: 0.16,
      minThick: 0.9,
      maxThick: 1.8,
      hPeak: 1.7,
      aTone: 4.5,
    },
  ],
});

// 3. Onionskin: 9 lb lightweight manifold paper with signature cockle puckering
writePaperPng("public/textures/paper-onionskin.png", {
  baseRgb: [247, 243, 228],
  reliefStrength: 4.4,
  cloudAmp: 6,
  feltAmp: 2.5,
  toothAmp: 0.7,
  cockleAmp: 2.4, // signature unrestrained air-dried cockle finish
  wireGrid: true, // glazed wire screen
  wireGridAmp: 0.24,
  fibers: [
    {
      count: 450,
      minLen: 16,
      maxLen: 50,
      curvature: 0.18,
      minThick: 0.7,
      maxThick: 1.4,
      hPeak: 1.1,
      aTone: 3.5,
    },
    {
      count: 300,
      minLen: 10,
      maxLen: 30,
      curvature: 0.25,
      minThick: 0.6,
      maxThick: 1.2,
      hPeak: 0.7,
      aTone: -2.0,
    },
  ],
});

// 4. Manila / kraft: Heavy unbleached raw wood pulp, coarse tooth, and woody shives
writePaperPng("public/textures/paper-kraft.png", {
  baseRgb: [213, 186, 143],
  reliefStrength: 5.8,
  cloudAmp: 12,
  feltAmp: 6.0,
  toothAmp: 1.8, // heavy uncalendered tooth
  fibers: [
    {
      count: 650,
      minLen: 14,
      maxLen: 52,
      curvature: 0.22,
      minThick: 1.0,
      maxThick: 2.2,
      hPeak: 1.8,
      aTone: -24, // dark brown woody fibers
      directionBias: 0.4,
    },
    {
      count: 500,
      minLen: 10,
      maxLen: 38,
      curvature: 0.26,
      minThick: 0.8,
      maxThick: 1.8,
      hPeak: 2.0,
      aTone: 18, // unbleached golden cellulose
      directionBias: 0.4,
    },
    {
      count: 200,
      minLen: 6,
      maxLen: 22,
      curvature: 0.35,
      minThick: 1.2,
      maxThick: 2.6,
      hPeak: 2.4,
      aTone: -32, // dark lignin bundles
    },
  ],
  flecks: [
    {
      count: 260,
      minR: 0.8,
      maxR: 2.4,
      hPeak: -1.2,
      aTone: -36, // bark shives
    },
  ],
});

// 5. Ledger, ruled: Fine calendered accounting rag stock with dense laid mold wires
writePaperPng("public/textures/paper-ledger.png", {
  baseRgb: [225, 231, 214],
  reliefStrength: 4.8,
  cloudAmp: 7,
  feltAmp: 3.0,
  toothAmp: 0.85,
  laidLines: 128,
  laidAmp: 0.44,
  chainLines: 16,
  chainAmp: 0.7,
  fibers: [
    {
      count: 650,
      minLen: 10,
      maxLen: 36,
      curvature: 0.2,
      minThick: 0.8,
      maxThick: 1.5,
      hPeak: 1.1,
      aTone: 3.0,
    },
    {
      count: 450,
      minLen: 8,
      maxLen: 26,
      curvature: 0.26,
      minThick: 0.7,
      maxThick: 1.3,
      hPeak: 0.8,
      aTone: -2.5,
    },
  ],
});

// 6. Grey recycled: 100% post-consumer recycled eco stock with botanical flecks
writePaperPng("public/textures/paper-recycled.png", {
  baseRgb: [210, 211, 200],
  reliefStrength: 5.5,
  cloudAmp: 11,
  feltAmp: 5.2,
  toothAmp: 1.5,
  fibers: [
    {
      count: 750,
      minLen: 10,
      maxLen: 42,
      curvature: 0.32,
      minThick: 0.8,
      maxThick: 1.8,
      hPeak: 1.4,
      aTone: -15, // dark reclaimed fibers
    },
    {
      count: 600,
      minLen: 8,
      maxLen: 32,
      curvature: 0.3,
      minThick: 0.8,
      maxThick: 1.6,
      hPeak: 1.5,
      aTone: 10, // unbleached fiber flecks
    },
    {
      count: 180,
      minLen: 5,
      maxLen: 18,
      curvature: 0.42,
      minThick: 1.1,
      maxThick: 2.2,
      hPeak: 1.8,
      aTone: -30, // charcoal reclaimed print fiber fragments
    },
  ],
  flecks: [
    {
      count: 450,
      minR: 0.6,
      maxR: 2.2,
      hPeak: -1.0,
      aTone: -44, // organic dark botanical specks & ink shives
    },
    {
      count: 120,
      minR: 1.2,
      maxR: 2.8,
      hPeak: -1.6,
      aTone: -54, // larger prominent recycled flakes
    },
  ],
});

// Ink: an alpha mask. Paper tooth starves the ribbon in pits and clumps, and
// the woven ribbon leaves a faint thread pattern in every solid stroke. It is
// built from hashes and fixed waves rather than random(), so it tiles and
// leaves the other textures' sequence alone.
{
  const size = 160;
  const waves = [
    [3, 2, 0.4],
    [-5, 4, 2.1],
    [7, -3, 4.2],
  ];
  png(
    "public/textures/ink.png",
    size,
    size,
    (x, y) => {
      const mottle =
        waves.reduce(
          (n, [fx, fy, ph]) =>
            n + Math.sin(((fx * x + fy * y) / size) * Math.PI * 2 + ph),
          0,
        ) / waves.length;
      const clump = hash(x >> 1, y >> 1) - 0.5;
      const tooth = mottle * 0.35 + clump;
      let alpha = 255;
      if (tooth > 0.5) alpha = 120 + hash(x + 91, y + 17) * 70;
      else if (tooth > 0.34) alpha = 212 + hash(x + 7, y + 53) * 20;
      if ((x + y) % 3 === 0) alpha -= 14;
      return [0, 0, 0, alpha];
    },
    4,
  );
}
