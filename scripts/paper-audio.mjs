// Rebuild from the CC0 sources listed in public/audio/SOURCES.md.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const source = process.argv[2];
if (!source)
  throw new Error("Usage: node scripts/paper-audio.mjs <source directory>");
const cuts = [
  ["tear-stretch", "newspaper", 11.66, 0.32, 3200],
  ["tear-grains", "newspaper", 8.29, 1.06, 4700],
  ["tear-release", "newspaper", 12.52, 0.32, 4200],
  ["card", "page", 0.15, 0.8, 3200],
  ["unroll", "page", 0.08, 1.45, 3800],
  ["tab", "page", 0.4, 0.15, 4000],
  ["crumple", "crumple", 0.1, 1.65, 4000],
  ["stamp", "stamp", 0.48, 0.44, 2600],
];
for (const [name, file, offset, duration, lowpass] of cuts)
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-ss",
    String(offset),
    "-i",
    resolve(source, `${file}.mp3`),
    "-t",
    String(duration),
    "-af",
    `highpass=f=100,lowpass=f=${lowpass},equalizer=f=800:t=q:w=0.7:g=2,afade=t=in:d=0.006,afade=t=out:st=${duration - 0.04}:d=0.04,alimiter=limit=0.65:level=false`,
    "-ac",
    "1",
    "-ar",
    "44100",
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "3",
    `public/audio/${name}.mp3`,
  ]);
execFileSync("ffmpeg", [
  "-v",
  "error",
  "-y",
  "-ss",
  "0.02",
  "-i",
  "public/audio/feed.mp3",
  "-t",
  "0.14",
  "-af",
  "lowpass=f=3500,afade=t=out:st=0.07:d=0.07,volume=.5",
  "-codec:a",
  "libmp3lame",
  "-q:a",
  "3",
  "public/audio/correction.mp3",
]);
