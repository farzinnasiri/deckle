import type { Settings } from "./writing";

export const TYPE_SIZES = [
  { name: "Small", pixels: 16 },
  { name: "Standard", pixels: 18 },
  { name: "Large", pixels: 22 },
  { name: "Extra large", pixels: 26 },
] as const;
export type TypeSize = 1 | 2 | 3 | 4;

export function typeSize(
  settings: Pick<Settings, "typeSize" | "largeType">,
): TypeSize {
  return settings.typeSize ?? (settings.largeType ? 3 : 2);
}

export function typeSizePatch(level: TypeSize): Partial<Settings> {
  return { typeSize: level, largeType: level >= 3 };
}
