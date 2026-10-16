"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/** Safari resizes the visual viewport, Android may resize the layout too.
 * Keep the mounted paper inside whichever area is actually above the keyboard. */
export function useMobileWorkspace(root: RefObject<HTMLElement | null>) {
  const [viewport, setViewport] = useState({
    mobile: false,
    keyboard: false,
    height: 0,
  });
  useLayoutEffect(() => {
    const query = matchMedia(
      "(max-width: 700px), (max-width: 900px) and (max-height: 500px) and (pointer: coarse)",
    );
    let baseline = innerHeight;
    let width = innerWidth;
    let frame = 0;
    let keyboard = false;
    const measure = () => {
      const visual = window.visualViewport;
      // Let the browser handle magnification; zoom is not a keyboard resize.
      if (visual && Math.abs(visual.scale - 1) > 0.05) return;
      const height = visual?.height ?? innerHeight;
      if (Math.abs(width - innerWidth) > 80) {
        baseline = innerHeight;
        width = innerWidth;
      }
      baseline = Math.max(baseline, innerHeight, height);
      const editable =
        document.activeElement?.matches(
          "input, textarea, [contenteditable=true]",
        ) ?? false;
      keyboard =
        query.matches && baseline - height > 120 && (editable || keyboard);
      const next = {
        mobile: query.matches,
        keyboard,
        height,
      };
      if (query.matches) {
        root.current?.style.setProperty(
          "--mobile-viewport-height",
          `${height}px`,
        );
        root.current?.style.setProperty(
          "--mobile-viewport-top",
          `${visual?.offsetTop ?? 0}px`,
        );
        root.current?.style.setProperty(
          "--mobile-viewport-bottom",
          `${Math.max(0, innerHeight - height - (visual?.offsetTop ?? 0))}px`,
        );
      } else {
        root.current?.style.removeProperty("--mobile-viewport-height");
        root.current?.style.removeProperty("--mobile-viewport-top");
        root.current?.style.removeProperty("--mobile-viewport-bottom");
      }
      setViewport((old) =>
        old.mobile === next.mobile &&
        old.keyboard === next.keyboard &&
        Math.abs(old.height - height) < 0.5
          ? old
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    query.addEventListener("change", schedule);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(frame);
      query.removeEventListener("change", schedule);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
    };
  }, [root]);
  return viewport;
}
