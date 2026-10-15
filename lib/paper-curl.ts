/** Excess sheet becomes top heavy and bows towards the reader instead of
 * growing off the desk. `crest` is the
 * projected height of that bend; it approaches a fixed radius, including for
 * very long documents. */
export const CREST_RADIUS = 34;

export function paperCurlProfile(feedOffset: number) {
  const excess = Number.isFinite(feedOffset) ? Math.max(0, -feedOffset) : 0;
  return {
    crest: CREST_RADIUS * (1 - Math.exp(-excess / CREST_RADIUS)),
    strength: Math.min(1, excess / 48),
  };
}
