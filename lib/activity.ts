export type DailyActivity = {
  day: string;
  characters: number;
  charge: number;
  charged: boolean;
};
export const DAILY_CHARGE = 20;
export const INACTIVE_DRAIN = 5;
const dayNumber = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / 86400000;
};
export function settleActivity(
  activity: DailyActivity | undefined,
  day: string,
): DailyActivity {
  if (!activity) return { day, characters: 0, charge: 0, charged: false };
  const elapsed = Math.max(0, dayNumber(day) - dayNumber(activity.day));
  if (!elapsed) return activity;
  // Only completed inactive days drain charge. The new day still has time to write.
  const inactive = elapsed - (activity.charged ? 1 : 0);
  return {
    day,
    characters: 0,
    charge: Math.max(0, activity.charge - inactive * INACTIVE_DRAIN),
    charged: false,
  };
}
export function recordWriting(
  activity: DailyActivity | undefined,
  day: string,
  text: string,
): DailyActivity {
  const settled = settleActivity(activity, day);
  const characters = characterCount(text);
  if (!characters) return settled;
  const writing = !!text.trim();
  return {
    ...settled,
    characters: settled.characters + characters,
    charge:
      settled.charged || !writing
        ? settled.charge
        : Math.min(100, settled.charge + DAILY_CHARGE),
    charged: settled.charged || writing,
  };
}
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export function characterCount(text: string) {
  let count = 0;
  for (const { segment } of graphemes.segment(text))
    if (!/^[\r\n]+$/.test(segment)) count++;
  return count;
}
export function validActivity(value: unknown): value is DailyActivity {
  if (!value || typeof value !== "object") return false;
  const a = value as DailyActivity;
  return (
    typeof a.day === "string" &&
    /^\d{4}-\d{1,2}-\d{1,2}$/.test(a.day) &&
    Number.isFinite(dayNumber(a.day)) &&
    Number.isSafeInteger(a.characters) &&
    a.characters >= 0 &&
    Number.isFinite(a.charge) &&
    a.charge >= 0 &&
    a.charge <= 100 &&
    typeof a.charged === "boolean"
  );
}
