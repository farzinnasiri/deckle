import type { ShareFormat } from "./share";

export async function renderShareImage(node: HTMLElement, format: ShareFormat) {
  await document.fonts.ready;
  const { toSvg } = await import("html-to-image");
  const source = new Image();
  source.src = await toSvg(node, {
    preferredFontFormat: "woff2",
    style: { position: "static", inset: "auto", margin: "0" },
  });
  // Decode the self-contained SVG directly. The library's canvas helper waits for
  // a paint frame, which can be suspended while a tab is in the background.
  await source.decode();
  const canvas = document.createElement("canvas");
  canvas.width = format.width;
  canvas.height = format.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image export is unavailable.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Image export failed.")),
      "image/png",
    );
  });
}
