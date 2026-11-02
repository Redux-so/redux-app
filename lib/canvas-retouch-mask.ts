import type { FabricImage, FabricObject, TMat2D } from "fabric";

/** Scene transform for centered, normalized image coordinates, independent of preview resolution. */
export function maskImageFrame(image: Pick<FabricImage, "width" | "height" | "calcTransformMatrix">): TMat2D {
  const [a, b, c, d, e, f] = image.calcTransformMatrix();
  return [a * image.width, b * image.width, c * image.height, d * image.height, e, f];
}

/** Render paths directly at source resolution, without viewport clipping or bounding-box approximation. */
export async function exportSourceMask(image: FabricImage, paths: FabricObject[], width: number, height: number): Promise<string> {
  const { StaticCanvas, util } = await import("fabric");
  const frame = maskImageFrame(image);
  const toSource = util.multiplyTransformMatrices([width, 0, 0, height, width / 2, height / 2], util.invertTransform(frame));
  const strokes = paths.map((path) => ({ path, matrix: util.multiplyTransformMatrices(toSource, path.calcTransformMatrix()) }));
  const mask = new StaticCanvas(document.createElement("canvas"), {
    width, height, backgroundColor: "#000000", enableRetinaScaling: false, renderOnAddRemove: false,
  });
  try {
    for (const { path, matrix } of strokes) {
      const cloned = await path.clone();
      cloned.set({ stroke: "#ffffff", fill: null, opacity: 1, strokeUniform: false, shadow: null, objectCaching: false });
      util.applyTransformToObject(cloned, matrix);
      mask.add(cloned);
    }
    mask.renderAll();
    return mask.toDataURL({ format: "png", multiplier: 1 }).split(",")[1];
  } finally {
    await mask.dispose();
  }
}
