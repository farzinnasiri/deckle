import { machineAudio } from "@/lib/audio";

/**
 * Crumples a paper where it lies, then throws the ball into the wastebasket on
 * the desk, which stands above the dimming veil. `done` runs when the ball
 * lands.
 */
export function tossIntoBin(
  paper: HTMLElement | null,
  mouth: HTMLElement | null,
  reduced: boolean,
  done: () => void,
) {
  machineAudio.physical("crumple");
  if (reduced || !paper || !mouth || !paper.animate) {
    done();
    return;
  }
  const from = paper.getBoundingClientRect(),
    to = mouth.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  // A higher arc for a longer throw.
  const lift = 90 + Math.min(160, Math.hypot(dx, dy) * 0.16);
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    if (t <= 0.32) {
      const c = t / 0.32;
      frames.push({
        offset: t,
        transform: `translate(0px, ${-24 * c}px) rotate(${-24 * c}deg) scale(${1 - 0.8 * c})`,
        borderRadius: `${46 * c}%`,
        opacity: 1,
      });
    } else {
      // Steady across, a rise and a fall under gravity; it sinks into the
      // mouth over the last stretch.
      const u = (t - 0.32) / 0.68;
      const y = -24 * (1 - u) + dy * u - lift * 4 * u * (1 - u);
      frames.push({
        offset: t,
        transform: `translate(${dx * u}px, ${y}px) rotate(${-24 + 320 * u}deg) scale(${0.2 - 0.09 * u})`,
        borderRadius: "46%",
        opacity: u > 0.92 ? 0 : 1,
      });
    }
  }
  // The ball flies as a copy on top of everything, so no shelf or dialog
  // clips it on the way out; the paper itself waits where it was.
  const ghost = paper.matches(".sheet")
    ? (paper.cloneNode(true) as HTMLElement)
    : document.createElement("div");
  if (!paper.matches(".sheet")) {
    const surface = paper.querySelector(".reader-paper") ?? paper;
    ghost.style.background = getComputedStyle(surface).backgroundColor;
  }
  ghost.classList.add("crumpling", "paper-ghost");
  ghost.setAttribute("aria-hidden", "true");
  ghost.tabIndex = -1;
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: "0",
    pointerEvents: "none",
  });
  const reader = paper.closest(".physical-reader");
  reader?.classList.add("is-throwing");
  document.body.append(ghost);
  const hold = paper.closest<HTMLElement>(".sheet-slot") ?? paper;
  hold.style.visibility = "hidden";
  const flight = ghost.animate(frames, {
    duration: 960,
    easing: "linear",
    fill: "forwards",
  });
  flight.onfinish = () => {
    ghost.remove();
    reader?.classList.remove("is-throwing");
    hold.style.visibility = "";
    machineAudio.toss();
    done();
  };
}
