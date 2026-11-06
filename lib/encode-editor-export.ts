export type ExportFormat = "jpeg" | "png" | "tiff";

/** Write a little-endian TIFF with one uncompressed RGBA strip. */
export function encodeTiff({ width, height, data }: ImageData): Blob {
  const short = 3;
  const long = 4;
  const directoryOffset = 8;
  const entryCount = 12;
  const bitsOffset = directoryOffset + 2 + entryCount * 12 + 4;
  const stripOffset = bitsOffset + 8;
  const entries = [
    [256, long, 1, width], [257, long, 1, height], // Dimensions
    [258, short, 4, bitsOffset], [259, short, 1, 1], // Bits per sample, no compression
    [262, short, 1, 2], [273, long, 1, stripOffset], // RGB, strip offset
    [274, short, 1, 1], [277, short, 1, 4], // Top-left orientation, RGBA
    [278, long, 1, height], [279, long, 1, data.byteLength], // Strip rows and bytes
    [284, short, 1, 1], [338, short, 1, 2], // Interleaved, straight alpha
  ];
  const header = new DataView(new ArrayBuffer(stripOffset));
  header.setUint16(0, 0x4949, true);
  header.setUint16(2, 42, true);
  header.setUint32(4, directoryOffset, true);
  header.setUint16(directoryOffset, entries.length, true);
  entries.forEach(([tag, type, count, value], index) => {
    const offset = directoryOffset + 2 + index * 12;
    header.setUint16(offset, tag, true);
    header.setUint16(offset + 2, type, true);
    header.setUint32(offset + 4, count, true);
    header.setUint32(offset + 8, value, true);
  });
  for (let channel = 0; channel < 4; channel++) header.setUint16(bitsOffset + channel * 2, 8, true);
  return new Blob([header.buffer, data], { type: "image/tiff" });
}

export async function encodeEditorExport(canvas: HTMLCanvasElement, format: ExportFormat, quality: number): Promise<Blob> {
  if (format !== "png") {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the image for download.");
    if (format === "tiff") return encodeTiff(ctx.getImageData(0, 0, canvas.width, canvas.height));
    // JPEG has no alpha. Match the editor's existing white export background.
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  const mime = `image/${format}`;
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob?.type === mime) resolve(blob);
      else reject(new Error("Could not encode the image at its current dimensions."));
    }, mime, quality / 100);
  });
}
