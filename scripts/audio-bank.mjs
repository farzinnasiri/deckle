// Builds public/audio/strikes.wav + strikes.json from BigSoundBank's CC0
// "Typewriter" recordings of a Hermes Precisa 305 (sounds 2835–2841).
// Usage: node scripts/audio-bank.mjs <folder containing 2835.mp3 … 2841.mp3>
// Every keystroke is cut from a real recording; nothing here is synthesised.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const source = process.argv[2];
if (!source) throw new Error("Pass the folder with the source recordings.");
const SR = 44100,
  HOP = 220, // 5 ms
  PRE = Math.round(0.018 * SR),
  MAX = Math.round(0.3 * SR),
  GAP = Math.round(0.05 * SR),
  WANT = 36;

function decode(file) {
  const raw = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-ac",
      "1",
      "-ar",
      String(SR),
      "-f",
      "f32le",
      "-",
    ],
    { maxBuffer: 1 << 30 },
  );
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}
function envelope(x) {
  const env = [];
  for (let i = 0; i + HOP <= x.length; i += HOP) {
    let s = 0;
    for (let j = 0; j < HOP; j++) s += x[i + j] ** 2;
    env.push(Math.sqrt(s / HOP));
  }
  return env;
}

const candidates = [];
for (const id of [2835, 2836, 2838, 2840, 2841]) {
  const x = decode(join(source, `${id}.mp3`));
  const env = envelope(x);
  const sorted = [...env].sort((a, b) => a - b);
  const floor = sorted[Math.floor(env.length * 0.2)];
  const on = Math.max(floor * 6, sorted.at(-1) * 0.04);
  // Onsets: the envelope crosses the threshold after at least 120 ms of quiet.
  const onsets = [];
  let quiet = 99;
  for (let i = 0; i < env.length; i++) {
    if (env[i] > on && quiet >= 24) onsets.push(i);
    quiet = env[i] > on ? 0 : quiet + 1;
  }
  for (let k = 0; k < onsets.length; k++) {
    const start = onsets[k] * HOP - PRE;
    const next = (onsets[k + 1] ?? env.length) * HOP;
    // Keep only isolated strikes so no neighbour bleeds into the tail.
    if (start < 0 || next - start < MAX + 0.08 * SR) continue;
    const seg = x.slice(start, start + MAX);
    let peak = 0,
      energy = 0,
      diff = 0,
      lead = 0;
    for (let i = 0; i < seg.length; i++) {
      peak = Math.max(peak, Math.abs(seg[i]));
      energy += seg[i] ** 2;
      if (i) diff += (seg[i] - seg[i - 1]) ** 2;
      if (i < PRE) lead = Math.max(lead, Math.abs(seg[i]));
    }
    // Reject clipped, weak or smeared strikes.
    if (peak > 0.97 || peak < 0.05 || lead > peak * 0.35) continue;
    candidates.push({
      seg,
      peak,
      rms: Math.sqrt(energy / seg.length),
      brightness: diff / energy,
      crest: peak / Math.sqrt(energy / seg.length),
    });
  }
}
// Prefer crisp, well-defined strikes, then spread across brightness so the
// bank holds both thin punctuation taps and full, heavy letters.
candidates.sort((a, b) => b.crest - a.crest);
const pool = candidates
  .slice(0, WANT * 2)
  .sort((a, b) => a.brightness - b.brightness);
const picked = Array.from(
  { length: WANT },
  (_, i) => pool[Math.floor((i * pool.length) / WANT)],
);
const meanRms = picked.reduce((n, c) => n + c.rms, 0) / picked.length;
const total = picked.length * (MAX + GAP);
const out = new Int16Array(total);
const manifest = [];
picked.forEach((c, i) => {
  // Even out loudness but keep a little of each strike's own character.
  const gain = Math.min(0.9 / c.peak, (meanRms / c.rms) ** 0.75);
  const at = i * (MAX + GAP);
  for (let j = 0; j < MAX; j++) {
    const fadeIn = Math.min(1, j / (0.002 * SR));
    const fadeOut = Math.min(1, (MAX - j) / (0.04 * SR));
    out[at + j] = Math.round(
      Math.max(-1, Math.min(1, c.seg[j] * gain * fadeIn * fadeOut)) * 32767,
    );
  }
  manifest.push({
    start: +(at / SR).toFixed(5),
    duration: +(MAX / SR).toFixed(5),
    // 0 = dark and full, 1 = thin and bright.
    tone: +(i / (picked.length - 1)).toFixed(3),
  });
});
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + out.byteLength, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(out.byteLength, 40);
writeFileSync(
  "public/audio/strikes.wav",
  Buffer.concat([header, Buffer.from(out.buffer)]),
);
writeFileSync(
  "public/audio/strikes.json",
  JSON.stringify({ sampleRate: SR, strikes: manifest }, null, 1) + "\n",
);
console.log(
  `${candidates.length} isolated strikes found, ${picked.length} kept.`,
);
