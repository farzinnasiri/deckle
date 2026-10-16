export const featureNames = ["ghostwriter"] as const;
export type FeatureName = (typeof featureNames)[number];
export type FeatureFlags = Record<FeatureName, boolean>;
export const NO_FEATURES: FeatureFlags = { ghostwriter: false };

/** Unknown and unassigned features are off. Only server assignments grant access. */
export function featureFlags(
  assigned: Record<string, boolean> = {},
): FeatureFlags {
  return Object.fromEntries(
    featureNames.map((name) => [name, assigned[name] === true]),
  ) as FeatureFlags;
}
