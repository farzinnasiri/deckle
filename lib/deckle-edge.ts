// Torn paper edges. One tear makes two edges: the bottom of the piece that
// leaves and the top of the paper that stays in the machine. Both come from
// the same seed, so they match.
function random(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++)
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const POINTS = 110;
/** Depth of the tear in px at each step across the paper. */
export function tearProfile(seed: string): number[] {
  const next = random(seed);
  const out: number[] = [];
  let drift = 2.5;
  for (let i = 0; i <= POINTS; i++) {
    // A slow wander, with the odd fibre pulled further than its neighbours.
    drift += (next() - 0.5) * 1.6;
    drift = Math.max(0.6, Math.min(5.5, drift));
    const fibre = next() < 0.12 ? next() * 2.6 : 0;
    out.push(+(drift + fibre).toFixed(2));
  }
  return out;
}
/** clip-path for a strip with a torn top and, optionally, a torn bottom. */
export function paperClip(
  topSeed: string,
  cut?: {
    at: number;
    seed: string;
    progress?: number;
    from?: "left" | "right";
    roughness?: number;
  },
) {
  const top = tearProfile(topSeed).map(
    (y, i) => `${((i / POINTS) * 100).toFixed(2)}% ${y}px`,
  );
  if (!cut) return `polygon(${top.join(",")},100% 100%,0% 100%)`;
  // The bottom edge mirrors the top of the next paper: fibres that stay in
  // the machine leave gaps here.
  const bottom = tearProfile(cut.seed)
    .map(
      (y, i) =>
        `${((i / POINTS) * 100).toFixed(2)}% ${(cut.at + ((cut.from === "right" ? 1 - i / POINTS : i / POINTS) <= (cut.progress ?? 1) ? (y - 6) * (cut.roughness ?? 1) : 0)).toFixed(1)}px`,
    )
    .reverse();
  return `polygon(${top.join(",")},${bottom.join(",")})`;
}

/** Fibres hold, then yield. Audio and the hinge use these same steps. */
export function tearProgress(value: number) {
  const p = Math.max(0, Math.min(1, value));
  if (p === 1) return 1;
  const step = Math.floor(p * 24),
    within = p * 24 - step;
  return (
    (step +
      (within < 0.48
        ? within * 0.12
        : 0.0576 + ((within - 0.48) / 0.52) * 0.9424)) /
    24
  );
}
