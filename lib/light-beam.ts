export type LampGeometry = {
  source: "overhead" | "rail";
  x: number;
  y: number;
  aperture: number;
  spread: number;
  reach: number;
  availableReach: number;
};

export type LightSurface = "wood" | "paper" | "deck" | "face";
export type SurfaceSample = {
  x: number;
  y: number;
  surface: LightSurface;
  /** Position across the rounded top of the machine, from lip to front. */
  curvature?: number;
};

/** The machine body, in the same measured desk coordinates. */
export type Occluder = { x: number; y: number; width: number; height: number };

const smoothstep = (a: number, b: number, t: number) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** The pendant hangs over the far half of the sheet. On the horizontal desk
 * it lays an elliptical pool: inverse-square distance and Lambert's cosine
 * combine as cos³ from a point at `height`, and the enamel bowl cuts the
 * emission off softly beyond its rim angle. The machine stands in that pool
 * and casts a short, soft shadow towards the reader. */
function deskPool(
  lamp: LampGeometry,
  point: SurfaceSample,
  depth: number,
  machine?: Occluder,
) {
  const spread = Math.max(0, Math.min(1, lamp.spread));
  const reach = Math.max(0, Math.min(1, lamp.reach));
  const footY = lamp.y + depth * 0.42;
  const height = depth * (0.6 + reach * 0.3);
  // Screen distance towards the reader covers more desk than across it.
  const dx = point.x - lamp.x;
  const dy = (point.y - footY) * 1.3;
  const cos = height / Math.hypot(dx, dy, height);
  const rim = Math.cos(((48 + spread * 20) * Math.PI) / 180);
  const shade = smoothstep(rim - 0.14, rim + 0.1, cos);
  let visible = 1;
  if (machine && point.y > machine.y + machine.height) {
    // Height of the ray to the lamp where it crosses the machine's front.
    const front = machine.y + machine.height;
    const along = (point.y - front) / Math.max(1, point.y - footY);
    const rayHeight = height * along;
    const bodyHeight = machine.height * 0.34;
    const crossX = point.x + (lamp.x - point.x) * along;
    // A wide shade gives a penumbra that broadens with distance.
    const penumbra = 6 + lamp.aperture * along * 0.5;
    const inside = Math.min(
      crossX - machine.x,
      machine.x + machine.width - crossX,
    );
    visible =
      1 -
      smoothstep(-penumbra, penumbra, inside) *
        (1 -
          smoothstep(bodyHeight - penumbra, bodyHeight + penumbra, rayHeight));
  }
  return 2.1 * cos ** 3 * shade * visible;
}

/** A finite emitter in a shallow 3D scene. Distances share the measured desk
 * coordinates; surface normals distinguish wood, tilted paper and curved metal.
 * The existing photographs/CSS supply albedo and small-scale material detail. */
export function reflectedLight(
  lamp: LampGeometry,
  point: SurfaceSample,
  railY: number,
  machine?: Occluder,
) {
  const depth = Math.max(240, railY - lamp.y);
  if (lamp.source === "overhead" && point.surface === "wood") {
    return { diffuse: deskPool(lamp, point, depth, machine), specular: 0 };
  }
  if (lamp.source !== "overhead" || point.y <= lamp.y) {
    return { diffuse: 0, specular: 0 };
  }
  const dy = point.y - lamp.y;
  const spread = Math.max(0, Math.min(1, lamp.spread));
  const reach = Math.max(0, Math.min(1, lamp.reach));
  const coneWidth = lamp.aperture * 0.5 + dy * (0.75 + spread * 0.6);
  const edge = Math.abs(point.x - lamp.x) / Math.max(1, coneWidth);
  // Smooth angular emission from the shade; no hard horizontal clip or haze.
  const opening = Math.min(1, dy / Math.max(12, lamp.aperture * 0.16));
  const cone =
    Math.exp(-0.9 * edge ** 2) * opening * opening * (3 - 2 * opening);
  const z =
    depth *
    (point.surface === "wood" ? 0 : point.surface === "paper" ? 0.09 : 0.14);
  const normalY =
    point.surface === "paper"
      ? -0.48
      : point.surface === "deck"
        ? -0.7 + Math.max(0, Math.min(1, point.curvature ?? 0)) * 0.8
        : point.surface === "face"
          ? -0.1
          : 0;
  const normalZ = Math.sqrt(1 - normalY * normalY);
  const responseGain =
    point.surface === "paper"
      ? 1.85
      : point.surface === "deck"
        ? 2.8
        : point.surface === "face"
          ? 2.5
          : 0.9;
  const gloss =
    point.surface === "wood" ? 0.2 : point.surface === "deck" ? 1.8 : 0;
  const exponent = point.surface === "wood" ? 18 : 72;
  let diffuse = 0,
    specular = 0;
  // Integrating across the aperture gives soft highlights instead of a point hotspot.
  for (const offset of [-0.4, -0.2, 0, 0.2, 0.4]) {
    const dx = lamp.x + lamp.aperture * offset - point.x;
    const dz = depth * 0.5 - z;
    const distance = Math.hypot(dx, dy, dz);
    const ly = -dy / distance,
      lz = dz / distance;
    const incidence = Math.max(0, normalY * ly + normalZ * lz);
    const attenuation =
      (depth * (0.75 + reach * 0.45)) ** 2 /
      (distance * distance + (depth * 0.18) ** 2);
    const halfLength = Math.hypot(dx / distance, ly, lz + 1);
    const halfDot = Math.max(
      0,
      (normalY * ly + normalZ * (lz + 1)) / halfLength,
    );
    diffuse += (incidence * attenuation * responseGain) / 5;
    specular += (incidence * attenuation * gloss * halfDot ** exponent) / 5;
  }
  // A broad secondary bounce from the lit desk reaches the upright sheet and
  // the recessed front. It has no sharp specular term or cone boundary.
  const bounceStrength =
    point.surface === "paper" ? 0.18 : point.surface === "wood" ? 0.025 : 0.12;
  const bounce =
    (bounceStrength * responseGain * depth ** 2) /
    (dy ** 2 + (depth * 0.7) ** 2 + ((point.x - lamp.x) * 0.6) ** 2);
  return { diffuse: diffuse * cone + bounce, specular: specular * cone };
}

/** Irradiance from a finite horizontal strip. The softened distance represents
 * the diffuser width and prevents a singularity at the emitting surface. */
function stripCoverage(x: number, halfWidth: number, distance: number) {
  const left = -halfWidth - x;
  const right = halfWidth - x;
  return (
    (right / Math.hypot(right, distance) - left / Math.hypot(left, distance)) /
    2
  );
}

export function transmittedLight(
  lamp: LampGeometry,
  point: SurfaceSample,
  paperHeight: number,
  machineHeight: number,
) {
  if (lamp.source !== "rail") return { diffuse: 0, specular: 0 };
  const dx = point.x - lamp.x;
  const dy = point.y - lamp.y;
  const distance = Math.abs(dy);
  const reach = Math.max(0, Math.min(1, lamp.reach));
  const spread = Math.max(0, Math.min(1, lamp.spread));
  const halfWidth = lamp.aperture / 2;
  const coverage = stripCoverage(
    dx,
    halfWidth,
    12 + distance * (0.2 + spread * 0.35),
  );
  if (point.surface === "paper") {
    // Long-range scattering carries light through the sheet; a separate short
    // path establishes the bright line where the diffuser sits behind the paper.
    // Grazing incidence from a strip just in front of the sheet falls off
    // steeply, so the tail stays short and the far sheet stays in the dark.
    const diffusionLength = Math.max(40, paperHeight * (0.16 + reach * 0.2));
    return {
      diffuse:
        coverage *
        (2.6 * Math.exp(-distance / diffusionLength) +
          3 * Math.exp(-distance / 17)),
      specular: 0,
    };
  }
  if (point.surface !== "wood") {
    return {
      diffuse: coverage * (0.18 + 2.5 * Math.exp(-distance / 19)),
      specular:
        point.surface === "deck"
          ? coverage * 0.25 * Math.exp(-distance / 10)
          : 0,
    };
  }
  const radius = 90 + reach * 160;
  const deskCoverage = stripCoverage(
    dx,
    halfWidth,
    Math.hypot(distance, radius * 0.4),
  );
  const falloff = (radius * radius) / (distance * distance + radius * radius);
  // The body blocks the centre of the forward spill. Its finite width leaves
  // light around the ends; the penumbra broadens beyond the feet.
  const beyondBody = Math.max(0, dy - machineHeight);
  const penumbra = 12 + beyondBody * 0.35;
  const bodyHalfWidth = halfWidth / 0.86;
  const visibility =
    dy > 0 ? 1 / (1 + Math.exp((bodyHalfWidth - Math.abs(dx)) / penumbra)) : 1;
  const bounce = dy > 0 ? 0.13 * (1 - Math.exp(-beyondBody / 65)) : 0;
  return {
    diffuse: deskCoverage * falloff * (1.6 * visibility + bounce),
    specular: deskCoverage * falloff * visibility * 0.035,
  };
}
