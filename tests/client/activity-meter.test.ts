import { expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityMeter } from "../../components/activity-meter";
test("Battery exposes the real charge rules as two described lines and keeps the counter toggle", () => {
  const html = renderToStaticMarkup(
    createElement(ActivityMeter, {
      activity: {
        day: "2026-10-12",
        characters: 14,
        charge: 40,
        charged: true,
      },
      lines: 2,
      hidden: false,
    }),
  );
  expect(html).toContain("BATTERY");
  expect(html).not.toContain("ENERGY");
  expect(html).toContain("Writing day: +20% charge.");
  expect(html).toContain("Inactive day: −5% charge.");
  expect(html).toContain("aria-describedby=");
  expect(html).toContain('role="tooltip"');
  expect(html).toContain('aria-controls="daily-writing-counters"');
});

test("guided onboarding can open and collapse the real battery counters", () => {
  const activity = {
    day: "2026-10-14",
    characters: 37,
    charge: 20,
    charged: true,
  };
  const html = renderToStaticMarkup(
    createElement(ActivityMeter, {
      activity,
      lines: 2,
      hidden: false,
      guidedOpen: true,
    }),
  );
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain("is-open");
  expect(html).toContain("37 characters written today");
  const closed = renderToStaticMarkup(
    createElement(ActivityMeter, {
      activity,
      lines: 2,
      hidden: false,
      guidedOpen: false,
    }),
  );
  expect(closed).toContain('aria-expanded="false"');
  expect(closed).toContain('aria-hidden="true" inert=""');
});
