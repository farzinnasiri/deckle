/** Lift the visible sheet out of its slot and lay it, intact, in the archive. */
export function fileToArchive(
  paper: HTMLElement | null,
  tray: HTMLElement | null,
  reduced: boolean,
  done: () => void,
): () => void {
  if (reduced || !paper || !tray || !paper.animate) {
    done();
    return () => {};
  }
  const viewport = paper.getBoundingClientRect();
  const sheet = paper.querySelector<HTMLElement>(".paper-sheet");
  const sheetBounds = sheet?.getBoundingClientRect() || viewport;
  const to = tray.getBoundingClientRect();
  const scale = viewport.width / paper.offsetWidth;
  const curl = paper.querySelector<SVGElement>(".paper-curl");
  const lift = Number(curl?.dataset.lift || 0) * scale;
  const from = {
    left: Math.max(viewport.left, sheetBounds.left),
    top: Math.max(viewport.top - lift, sheetBounds.top),
    right: Math.min(viewport.right, sheetBounds.right),
    bottom: Math.min(viewport.bottom, sheetBounds.bottom),
  };
  const width = from.right - from.left,
    height = from.bottom - from.top;
  if (width <= 0 || height <= 0 || !to.width) {
    done();
    return () => {};
  }
  const ghost = document.createElement("div");
  ghost.className = `filing-paper-flight desk-refined${paper.closest(".large-type") ? " large-type" : ""}`;
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  const deskStyle = getComputedStyle(paper.closest(".desk") || paper);
  for (const name of deskStyle) {
    if (name.startsWith("--"))
      ghost.style.setProperty(name, deskStyle.getPropertyValue(name));
  }
  const copy = paper.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  // The detached fold keeps its local texture/gradient references. Give those
  // definitions new IDs while removing the editor's duplicated DOM IDs.
  const curlIds = new Map<string, string>();
  copy.querySelectorAll(".paper-curl [id]").forEach((node) => {
    curlIds.set(node.id, `${node.id}-filing`);
  });
  copy.querySelectorAll("[id]").forEach((node) => {
    const replacement = curlIds.get(node.id);
    if (replacement) node.id = replacement;
    else node.removeAttribute("id");
  });
  copy.querySelectorAll(".paper-curl path[fill]").forEach((node) => {
    const fill = node.getAttribute("fill") || "";
    for (const [id, replacement] of curlIds)
      if (fill === `url(#${id})`)
        node.setAttribute("fill", `url(#${replacement})`);
  });
  copy
    .querySelectorAll<HTMLElement>(".paper-motion, .paper-impact")
    .forEach((node) => {
      node.style.transform = "none";
      node.style.animation = "none";
      node.style.visibility = "visible";
    });
  // The machine is scaled as a scene. Preserve that scale in the detached copy.
  // Its content must keep its original layout dimensions, then be cropped.
  Object.assign(copy.style, {
    position: "absolute",
    inset: "auto",
    margin: "0",
    left: `${viewport.left - from.left}px`,
    top: `${viewport.top - from.top}px`,
    width: `${paper.offsetWidth}px`,
    height: `${paper.offsetHeight}px`,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
    visibility: "visible",
    clipPath: lift ? "inset(-68px 0 0)" : "inset(0)",
  });
  ghost.append(copy);
  Object.assign(ghost.style, {
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
  document.body.append(ghost);
  const previousVisibility = paper.style.visibility;
  paper.style.visibility = "hidden";
  const size = Math.min(0.72, (to.width - 32) / width, 150 / height);
  const dx = to.left + to.width / 2 - (from.left + width / 2);
  const dy = to.top + 16 - (from.top + height / 2);
  const flight = ghost.animate(
    [
      { transform: "none", opacity: 1, offset: 0 },
      { transform: "translateY(-24px) rotate(-2deg)", opacity: 1, offset: 0.2 },
      {
        transform: `translate(${dx}px, ${dy - 22}px) rotate(1deg) scale(${size})`,
        opacity: 1,
        offset: 0.8,
      },
      {
        transform: `translate(${dx}px, ${dy}px) scale(${size})`,
        opacity: 0,
        offset: 1,
      },
    ],
    { duration: 620, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" },
  );
  let finished = false;
  const clean = () => {
    ghost.remove();
    paper.style.visibility = previousVisibility;
  };
  flight.onfinish = () => {
    if (finished) return;
    finished = true;
    clean();
    tray.animate(
      [
        { transform: "translateY(0)" },
        { transform: "translateY(3px)", offset: 0.3 },
        { transform: "none" },
      ],
      { duration: 230, easing: "cubic-bezier(.16,1,.3,1)" },
    );
    done();
  };
  return () => {
    finished = true;
    flight.cancel();
    clean();
  };
}
