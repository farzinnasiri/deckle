import { memo } from "react";
export const RetroCounter = memo(function RetroCounter({
  value,
  digits = 4,
  label,
}: {
  value: number;
  digits?: number;
  label: string;
}) {
  return (
    <span
      className="retro-counter"
      role="img"
      aria-label={`${value.toLocaleString()} ${label}`}
      title={`${value.toLocaleString()} ${label}`}
    >
      {String(value)
        .padStart(digits, "0")
        .split("")
        .map((digit, index) => (
          <span className="counter-drum" key={index} aria-hidden="true">
            <b key={digit}>{digit}</b>
          </span>
        ))}
    </span>
  );
});
