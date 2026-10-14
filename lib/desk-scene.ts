/** Make room for the inspector without changing the machine's proportions.
 * Desktop previews sit in the middle of the available desk, with clearance
 * for the paper's return fold. Phones use the space above the bottom panel. */
export function inspectorPlacement({
  width,
  height,
  stageWidth,
  contentHeight,
  paddingTop,
  side = "right",
}: {
  width: number;
  height: number;
  stageWidth: number;
  contentHeight: number;
  paddingTop: number;
  /** Where the panel stands: settings on the right, the copy holder on the left. */
  side?: "left" | "right";
}) {
  const narrow = width <= 800;
  // The copy holder also leaves the control strip on the right uncovered.
  const reserved = narrow ? 24 : side === "right" ? 404 : 470;
  const scale = Math.min(
    1,
    (width - reserved) / stageWidth,
    (narrow ? height * 0.56 - 48 : height - 152) / contentHeight,
  );
  const top = narrow ? 32 : (height - contentHeight * scale) / 2;
  return {
    scale,
    x: narrow ? 0 : side === "right" ? -178 : 149,
    y: top - paddingTop,
  };
}

/** Recover fixed desk coordinates from an in-flight camera transform. */
export function sceneRectangle(
  rect: { left: number; top: number; width: number; height: number },
  stage: { left: number; top: number },
  camera: {
    scale: number;
    x: number;
    y: number;
    originX: number;
    originY: number;
  },
) {
  const baseLeft = stage.left - camera.x - camera.originX * (1 - camera.scale);
  const baseTop = stage.top - camera.y - camera.originY * (1 - camera.scale);
  return {
    left: baseLeft + (rect.left - stage.left) / camera.scale,
    top: baseTop + (rect.top - stage.top) / camera.scale,
    width: rect.width / camera.scale,
    height: rect.height / camera.scale,
  };
}
