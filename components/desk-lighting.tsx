"use client";
import { useEffect, useRef } from "react";
import {
  reflectedLight,
  transmittedLight,
  type LampGeometry,
  type LightSurface,
} from "@/lib/light-beam";

type Lamp = LampGeometry & { intensity: number; colour: string };
type Surface = { x: number; y: number; width: number; height: number };
type Props = {
  width: number;
  height: number;
  roomLit: boolean;
  lamps: Lamp[];
  paper: Surface;
  machineHeight: number;
  camera?: { transform: string; originX: number; originY: number };
};

/** A shared light calculation for all materials, with a separate specular pass.
 * Low-resolution fields contain no texture; the original materials stay sharp. */
export function DeskLighting(props: Props) {
  const diffuseRef = useRef<HTMLCanvasElement>(null);
  const specularRef = useRef<HTMLCanvasElement>(null);
  // Scene geometry/settings change the light. Typing without feeding does not.
  const { camera, ...scene } = props;
  const sceneKey = JSON.stringify(scene);
  useEffect(() => {
    const { width, height, roomLit, lamps, paper, machineHeight } = JSON.parse(
      sceneKey,
    ) as Props;
    const diffuseCanvas = diffuseRef.current;
    const specularCanvas = specularRef.current;
    if (!diffuseCanvas || !specularCanvas || width <= 0 || height <= 0) return;
    const diffuseContext = diffuseCanvas.getContext("2d");
    const specularContext = specularCanvas.getContext("2d");
    if (!diffuseContext || !specularContext) return;
    // Cache an overscanned exposure map and let the camera move it with the desk.
    const scale = Math.min(0.5, 480 / (width * 2));
    const w = Math.ceil(width * 2 * scale),
      h = Math.ceil(height * 2 * scale);
    diffuseCanvas.width = specularCanvas.width = w;
    diffuseCanvas.height = specularCanvas.height = h;
    const diffuse = diffuseContext.createImageData(w, h);
    const specular = specularContext.createImageData(w, h);
    const rail = lamps.find((lamp) => lamp.source === "rail");
    const railY = rail?.y ?? height * 0.65;
    const machineWidth = (rail?.aperture ?? paper.width) / 0.86;
    const machineX = (rail?.x ?? width / 2) - machineWidth / 2;
    const machineY = railY - 7;
    const machine = {
      x: machineX,
      y: machineY,
      width: machineWidth,
      height: machineHeight,
    };
    const colours = lamps.map((lamp) =>
      lamp.colour
        .split(" ")
        .map(Number)
        .map((c) => (c / 255) ** 2.2),
    );
    for (let row = 0; row < h; row++) {
      const y = (row + 0.5) / scale - height / 2;
      for (let col = 0; col < w; col++) {
        const x = (col + 0.5) / scale - width / 2;
        const cornerX = Math.max(
          machineX + 16 - x,
          x - (machineX + machineWidth - 16),
          0,
        );
        const cornerY = Math.max(
          machineY + 16 - y,
          y - (machineY + machineHeight - 16),
          0,
        );
        const onMachine =
          cornerX * cornerX + cornerY * cornerY <= 16 * 16 &&
          x >= machineX &&
          x <= machineX + machineWidth &&
          y >= machineY &&
          y <= machineY + machineHeight;
        const onPaper =
          !onMachine &&
          x >= paper.x &&
          x <= paper.x + paper.width &&
          y >= paper.y &&
          y <= paper.y + paper.height;
        const surface: LightSurface = onPaper
          ? "paper"
          : onMachine
            ? y < machineY + 46
              ? "deck"
              : "face"
            : "wood";
        const energy = [0, 0, 0],
          shine = [0, 0, 0];
        for (let index = 0; index < lamps.length; index++) {
          const lamp = lamps[index];
          if (lamp.intensity <= 0) continue;
          let light = 0,
            reflection = 0;
          if (lamp.source === "overhead") {
            const response = reflectedLight(
              lamp,
              { x, y, surface, curvature: (y - machineY) / 46 },
              railY,
              machine,
            );
            light = response.diffuse;
            reflection = response.specular;
          } else {
            const response = transmittedLight(
              lamp,
              { x, y, surface },
              paper.height,
              machineHeight,
            );
            light = response.diffuse;
            reflection = response.specular;
          }
          for (let channel = 0; channel < 3; channel++) {
            energy[channel] += light * lamp.intensity * colours[index][channel];
            shine[channel] +=
              reflection * lamp.intensity * colours[index][channel];
          }
        }
        const pixel = (row * w + col) * 4;
        for (let channel = 0; channel < 3; channel++) {
          const ambient = roomLit ? 0.975 : 0.065;
          diffuse.data[pixel + channel] =
            255 * (ambient + (1 - ambient) * (1 - Math.exp(-energy[channel])));
          specular.data[pixel + channel] =
            255 * (1 - Math.exp(-shine[channel]));
        }
        diffuse.data[pixel + 3] = specular.data[pixel + 3] = 255;
      }
    }
    diffuseContext.putImageData(diffuse, 0, 0);
    specularContext.putImageData(specular, 0, 0);
  }, [sceneKey]);
  const mapStyle = {
    width: props.width * 2,
    height: props.height * 2,
    left: -props.width / 2,
    top: -props.height / 2,
    transform: camera?.transform ?? "none",
    transformOrigin: `${props.width / 2 + (camera?.originX ?? props.width / 2)}px ${props.height / 2 + (camera?.originY ?? 0)}px`,
  };
  return (
    <>
      <div
        className="desk-light-field"
        aria-hidden="true"
        style={{
          background: props.roomLit ? "rgb(249 249 249)" : "rgb(17 17 17)",
        }}
      >
        <canvas ref={diffuseRef} className="desk-light-map" style={mapStyle} />
      </div>
      <div className="desk-light-specular" aria-hidden="true">
        <canvas ref={specularRef} className="desk-light-map" style={mapStyle} />
      </div>
    </>
  );
}
