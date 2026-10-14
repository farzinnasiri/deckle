import { machineAudio } from "@/lib/audio";

// Scissors and tape. Cutting on the paper is immediate (the words leave the
// line at once); this module only draws the strip of paper that was cut: the
// blades run along it, it lifts off the sheet, rides near the pointer while
// you look for its new place, and is taped down where you paste it. Copying
// lifts a duplicate the same way, without the blades; the words stay on the
// line. The strip is drawn above the desk, so it never delays an edit.

export type HeldStrip = {
  /** False when nothing was drawn (reduced motion, nothing measurable). */
  active: boolean;
  /** Fly to the viewport point where the pasted words now start, and tape down. */
  land: (at: { x: number; y: number }) => void;
  /** Put the strip aside (typing elsewhere, Escape, a long wait). */
  setAside: () => void;
};

const SCISSORS = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1 20 20M8.1 15.9 20 4"/></g></svg>`;
const idle: HeldStrip = { active: false, land: () => {}, setAside: () => {} };

export function cutStrip({
  rects,
  text,
  paperStyle,
  rtl,
  reduced,
  copy = false,
  onGone,
}: {
  /** Client rects of the cut selection, measured before the words left. */
  rects: DOMRect[];
  text: string;
  /** The editor's computed style, so the strip is set in the same type. */
  paperStyle: CSSStyleDeclaration;
  rtl: boolean;
  reduced: boolean;
  /** A copy: the words stay, and a duplicate lifts off them. */
  copy?: boolean;
  /** The strip has been taped down or put aside. */
  onGone?: () => void;
}): HeldStrip {
  const boxes = rects.filter((r) => r.width > 0 && r.height > 0);
  if (copy) machineAudio.carbon();
  else if (boxes.length) machineAudio.scissors(rtl ? 0.2 : -0.2);
  if (!boxes.length || typeof document === "undefined" || (copy && reduced))
    return idle;
  const left = Math.min(...boxes.map((r) => r.left)) - 6,
    top = Math.min(...boxes.map((r) => r.top)) - 3,
    width = Math.max(...boxes.map((r) => r.right)) - left + 6,
    height = Math.max(...boxes.map((r) => r.bottom)) - top + 3;

  const strip = document.createElement("div");
  strip.className = copy ? "cut-strip is-copy" : "cut-strip";
  strip.setAttribute("aria-hidden", "true");
  strip.dir = rtl ? "rtl" : "ltr";
  Object.assign(strip.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    minHeight: `${height}px`,
    fontFamily: paperStyle.fontFamily,
    fontSize: paperStyle.fontSize,
    lineHeight: paperStyle.lineHeight,
    color: paperStyle.color,
  });
  const words = document.createElement("span");
  words.className = "cut-strip-text";
  words.textContent = text;
  strip.append(words);
  const blades = document.createElement("span");
  if (!copy) {
    blades.className = "cut-scissors";
    blades.innerHTML = SCISSORS;
    strip.append(blades);
  }
  document.body.append(strip);

  if (reduced || !strip.animate) {
    strip
      .animate?.([{ opacity: 1 }, { opacity: 0 }], {
        duration: 220,
        delay: 160,
        fill: "forwards",
      })
      .finished.then(
        () => strip.remove(),
        () => strip.remove(),
      );
    if (!strip.animate) setTimeout(() => strip.remove(), 380);
    return idle;
  }

  // The blades run along the lower edge, in the direction of the writing.
  const run = rtl ? [width - 8, -14] : [-14, width - 8];
  if (!copy)
    blades.animate(
      [
        { transform: `translateX(${run[0]}px)`, opacity: 1 },
        { transform: `translateX(${run[1]}px)`, opacity: 1, offset: 0.85 },
        { transform: `translateX(${run[1]}px)`, opacity: 0 },
      ],
      { duration: 300, easing: "cubic-bezier(.45,0,.55,1)", fill: "forwards" },
    );
  const lifted = { x: rtl ? -8 : 8, y: -16, turn: rtl ? 3 : -3 };
  let state: "lifting" | "held" | "gone" = "lifting";
  const position = { ...lifted };
  let target: { x: number; y: number } | null = null;
  let frame = 0;
  const place = () =>
    (strip.style.transform = `translate(${position.x}px, ${position.y}px) rotate(${position.turn}deg)`);
  const lift = strip.animate(
    [
      { transform: "none", boxShadow: "0 0 0 #0000" },
      {
        transform: `translate(${lifted.x}px, ${lifted.y}px) rotate(${lifted.turn}deg)`,
        boxShadow: "4px 10px 18px #1b130c40",
      },
    ],
    {
      duration: 300,
      // A copy peels straight off; a cut waits for the blades.
      delay: copy ? 40 : 260,
      easing: "cubic-bezier(.22,1.2,.36,1)",
      fill: "forwards",
    },
  );
  strip.classList.add("is-cut");
  lift.finished.then(
    () => {
      if (state !== "lifting") return;
      state = "held";
      strip.classList.add("is-held");
      place();
      lift.cancel();
      // The pointer may have moved on while the strip was lifting.
      if (target && !frame) frame = requestAnimationFrame(step);
    },
    () => {},
  );
  // While held, the strip drifts after the pointer, tilting with its motion.
  const follow = (e: PointerEvent) => {
    // Just below and after the pointer's tip, close enough to read as held.
    target = { x: e.clientX + 6 - left, y: e.clientY + 9 - top };
    if (!frame) frame = requestAnimationFrame(step);
  };
  const step = () => {
    frame = 0;
    if (state !== "held" || !target) return;
    const dx = target.x - position.x,
      dy = target.y - position.y;
    position.x += dx * 0.22;
    position.y += dy * 0.22;
    position.turn = lifted.turn + Math.max(-6, Math.min(6, dx * 0.04));
    place();
    if (Math.abs(dx) + Math.abs(dy) > 0.5) frame = requestAnimationFrame(step);
  };
  window.addEventListener("pointermove", follow);
  const forget = setTimeout(() => setAside(), 30000);
  const finish = () => {
    state = "gone";
    clearTimeout(forget);
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", follow);
    onGone?.();
  };
  const from = () =>
    state === "lifting"
      ? `translate(${lifted.x}px, ${lifted.y}px) rotate(${lifted.turn}deg)`
      : strip.style.transform || "none";

  function land(at: { x: number; y: number }) {
    if (state === "gone") return;
    const start = from();
    lift.cancel();
    finish();
    const x = (rtl ? at.x - width + 6 : at.x - 6) - left,
      y = at.y - 3 - top;
    strip.classList.add("is-landing");
    machineAudio.tape(rtl ? 0.2 : -0.2);
    strip
      .animate(
        [
          { transform: start, boxShadow: "4px 10px 18px #1b130c40" },
          {
            transform: `translate(${x}px, ${y - 6}px) rotate(0.6deg) scale(1.02)`,
            boxShadow: "2px 6px 10px #1b130c33",
            offset: 0.55,
          },
          {
            transform: `translate(${x}px, ${y}px) rotate(0deg) scale(1)`,
            boxShadow: "0 1px 1px #1b130c22",
            opacity: 1,
            offset: 0.78,
          },
          {
            transform: `translate(${x}px, ${y}px)`,
            boxShadow: "0 0 0 #0000",
            opacity: 0,
          },
        ],
        { duration: 620, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" },
      )
      .finished.then(
        () => strip.remove(),
        () => strip.remove(),
      );
  }
  function setAside() {
    if (state === "gone") return;
    const start = from();
    lift.cancel();
    finish();
    strip
      .animate(
        [
          { transform: start, opacity: 1 },
          {
            transform: `translate(${rtl ? 60 : -60}px, 28px) rotate(${rtl ? 8 : -8}deg) scale(.96)`,
            opacity: 0,
          },
        ],
        {
          duration: 380,
          easing: "cubic-bezier(.55,0,.9,.4)",
          fill: "forwards",
        },
      )
      .finished.then(
        () => strip.remove(),
        () => strip.remove(),
      );
  }
  return { active: true, land, setAside };
}
