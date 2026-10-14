// Raking-light relief for the cotton paper scan, lit from below by the rail.
// The albedo already contains the fibres; their small height changes are only
// visible when light arrives at a grazing angle. This writes a neutral-grey
// shading map with the same tile, so the fibres line up with the paper itself:
// faces towards the slot catch the light and their backs fall into shadow.
//
//   node scripts/paper-relief.mjs
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const source = "public/textures/paper-cotton.png";
const target = "public/textures/paper-cotton-raking.png";

function decode(path) {
  const file = readFileSync(path);
  let offset = 8,
    width = 0,
    height = 0,
    channels = 0;
  const data = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0)
        throw new Error("8-bit, non-interlaced PNG expected");
      channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[body[9]];
    } else if (type === "IDAT") data.push(body);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const corner =
        y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const p = left + up - corner;
      const paeth =
        Math.abs(p - left) <= Math.abs(p - up) &&
        Math.abs(p - left) <= Math.abs(p - corner)
          ? left
          : Math.abs(p - up) <= Math.abs(p - corner)
            ? up
            : corner;
      pixels[y * stride + x] =
        (value + [0, left, up, (left + up) >> 1, paeth][filter]) & 255;
    }
  }
  return { width, height, channels, pixels };
}

function crc(bytes) {
  let c = -1;
  for (const v of bytes) {
    c ^= v;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ -1) >>> 0;
}
function chunk(name, data) {
  const body = Buffer.concat([Buffer.from(name), data]);
  const length = Buffer.alloc(4);
  const check = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  check.writeUInt32BE(crc(body));
  return Buffer.concat([length, body, check]);
}
function encodeGrey(path, width, height, values) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      raw[y * (width + 1) + 1 + x] = values[y * width + x];
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 0;
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const { width, height, channels, pixels } = decode(source);
const at = (x, y) => ((y + height) % height) * width + ((x + width) % width);
// Luminance stands in for height: cellulose ridges scan lighter than pits.
const luminance = new Float32Array(width * height);
for (let i = 0; i < width * height; i++) {
  const r = pixels[i * channels],
    g = pixels[i * channels + 1],
    b = pixels[i * channels + 2];
  luminance[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
// Remove broad mottling (a box blur on the wrapped tile) so only relief remains.
function blur(input, radius) {
  const horizontal = new Float32Array(input.length);
  const output = new Float32Array(input.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += input[at(x, y)];
    for (let x = 0; x < width; x++) {
      horizontal[at(x, y)] = sum / span;
      sum += input[at(x + radius + 1, y)] - input[at(x - radius, y)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += horizontal[at(x, y)];
    for (let y = 0; y < height; y++) {
      output[at(x, y)] = sum / span;
      sum += horizontal[at(x, y + radius + 1)] - horizontal[at(x, y - radius)];
    }
  }
  return output;
}
const broad = blur(luminance, 9);
const fine = blur(luminance, 1);
const relief = new Float32Array(width * height);
for (let i = 0; i < relief.length; i++) relief[i] = fine[i] - broad[i];

// Light arrives from the bottom of the tile, a few degrees above the surface.
// A face whose height falls towards +y faces the slot and is lit.
const shading = new Uint8Array(width * height);
let spread = 0;
const slopes = new Float32Array(width * height);
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const slope = (relief[at(x, y - 2)] - relief[at(x, y + 2)]) / 4;
    const side = (relief[at(x - 1, y)] - relief[at(x + 1, y)]) / 2;
    slopes[at(x, y)] = slope + side * 0.18;
    spread += slopes[at(x, y)] ** 2;
  }
const deviation = Math.sqrt(spread / slopes.length) || 1;
for (let i = 0; i < slopes.length; i++) {
  const t = Math.tanh(slopes[i] / (deviation * 2.2));
  shading[i] = Math.round(128 + t * 92);
}
// CSS shows the tile at 420px; half the scan's resolution still covers 2× screens.
const half = Math.floor(width / 2);
const small = new Uint8Array(half * half);
for (let y = 0; y < half; y++)
  for (let x = 0; x < half; x++)
    small[y * half + x] = Math.round(
      (shading[at(x * 2, y * 2)] +
        shading[at(x * 2 + 1, y * 2)] +
        shading[at(x * 2, y * 2 + 1)] +
        shading[at(x * 2 + 1, y * 2 + 1)]) /
        4,
    );
encodeGrey(target, half, half, small);
console.log(`wrote ${target} (${half}×${half})`);
