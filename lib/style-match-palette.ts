import sharp from "sharp";

type Color = [number, number, number];
export interface StyleSwatch { id: number; rgb: Color; lab: Color; proportion: number }
export interface StylePaletteMatch { target: number; reference: number }
const clamp = (n: number, min = 0, max = 255) => Math.max(min, Math.min(max, n));
const linear = Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});
const distance = (a: Color, b: Color) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

function toLab(rgb: Color): Color {
  const [r, g, b] = rgb.map(v => linear[Math.round(v)]);
  const f = (v: number) => v > 216 / 24389 ? Math.cbrt(v) : v * 841 / 108 + 4 / 29;
  const x = f((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047);
  const y = f(r * 0.2126729 + g * 0.7151522 + b * 0.0721750);
  const z = f((r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function toRgb([l, a, b]: Color): Color {
  const y = (l + 16) / 116;
  const f = (v: number) => v > 6 / 29 ? v ** 3 : (v - 4 / 29) * 108 / 841;
  const x = f(y + a / 500) * 0.95047, yy = f(y), z = f(y - b / 200) * 1.08883;
  const encode = (v: number) => clamp(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  return [encode(x * 3.2404542 - yy * 1.5371385 - z * 0.4985314),
    encode(-x * 0.9692660 + yy * 1.8760108 + z * 0.0415560),
    encode(x * 0.0556434 - yy * 0.2040259 + z * 1.0572252)];
}

/** Small deterministic palette of actual image colors, not model-invented RGB values. */
export async function extractStylePalette(image: Buffer): Promise<StyleSwatch[]> {
  const { data } = await sharp(image).rotate().toColourspace("srgb").ensureAlpha()
    .resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const samples: Color[] = [];
  for (let i = 0; i < data.length; i += 4 * Math.max(1, Math.floor(data.length / 4 / 12000))) {
    if (data[i + 3] > 0) samples.push(toLab([data[i], data[i + 1], data[i + 2]]));
  }
  if (!samples.length) throw new Error("Style Match needs visible image pixels.");
  // Farthest-point initialization prevents duplicate centers on simple images.
  let centers: Color[] = [samples[Math.floor(samples.length / 2)]];
  while (centers.length < 12) {
    let farthest = samples[0], maximum = 0;
    for (const sample of samples) {
      const d = Math.min(...centers.map(center => distance(sample, center)));
      if (d > maximum) { maximum = d; farthest = sample; }
    }
    if (maximum < 4) break;
    centers.push(farthest);
  }
  let counts: number[] = [];
  for (let iteration = 0; iteration < 12; iteration++) {
    const sums = centers.map(() => [0, 0, 0] as Color);
    counts = centers.map(() => 0);
    for (const sample of samples) {
      let index = 0, minimum = Infinity;
      for (let k = 0; k < centers.length; k++) {
        const d = distance(sample, centers[k]);
        if (d < minimum) { minimum = d; index = k; }
      }
      counts[index]++;
      for (let c = 0; c < 3; c++) sums[index][c] += sample[c];
    }
    centers = centers.map((center, i) => counts[i] ? sums[i].map(v => v / counts[i]) as Color : center);
  }
  return centers.flatMap((lab, i) => counts[i] / samples.length >= 0.002
    ? [{ id: i, lab, rgb: toRgb(lab).map(Math.round) as Color, proportion: counts[i] / samples.length }] : [])
    .map((swatch, id) => ({ ...swatch, id }));
}

export function describeStylePalette(palette: StyleSwatch[]) {
  return palette.map(({ id, rgb, proportion }) => ({ id, rgb, percent: Math.round(proportion * 1000) / 10 }));
}

/** Build a smooth color-only LUT, then apply it to native pixels. No synthesis or geometry edits. */
export async function transferStylePalette(source: Buffer, target: StyleSwatch[], reference: StyleSwatch[], matches: StylePaletteMatch[]): Promise<Buffer> {
  if (matches.length !== target.length || new Set(matches.map(m => m.target)).size !== target.length ||
      matches.some(m => !target[m.target] || !reference[m.reference])) throw new Error("Incomplete style palette match");
  // Several shades often map to one reference swatch. Pool their source center
  // instead of collapsing every shade to the same RGB and flattening texture.
  const groups = new Map<number, { lab: Color; weight: number }>();
  for (const match of matches) {
    const swatch = target[match.target];
    const group = groups.get(match.reference) ?? { lab: [0, 0, 0] as Color, weight: 0 };
    group.weight += swatch.proportion;
    for (let c = 0; c < 3; c++) group.lab[c] += swatch.lab[c] * swatch.proportion;
    groups.set(match.reference, group);
  }
  const anchors = [...groups].map(([id, group]) => {
    const from = group.lab.map(v => v / group.weight) as Color;
    return { from, delta: reference[id].lab.map((v, c) => v - from[c]) as Color };
  });
  const size = 33, last = size - 1;
  const lut = new Float32Array(size ** 3 * 3);
  for (let r = 0; r < size; r++) for (let g = 0; g < size; g++) for (let b = 0; b < size; b++) {
    const lab = toLab([r * 255 / last, g * 255 / last, b * 255 / last]);
    let total = 0;
    const shift: Color = [0, 0, 0];
    for (const anchor of anchors) {
      const weight = 1 / (distance(lab, anchor.from) + 4) ** 2;
      total += weight;
      for (let c = 0; c < 3; c++) shift[c] += anchor.delta[c] * weight;
    }
    const rgb = toRgb(lab.map((v, c) => v + shift[c] / total) as Color);
    lut.set(rgb, ((r * size + g) * size + b) * 3);
  }
  const { data, info } = await sharp(source).rotate().toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const r = data[i] * last / 255, g = data[i + 1] * last / 255, b = data[i + 2] * last / 255;
    const ri = Math.min(last - 1, Math.floor(r)), gi = Math.min(last - 1, Math.floor(g)), bi = Math.min(last - 1, Math.floor(b));
    const fr = r - ri, fg = g - gi, fb = b - bi;
    for (let c = 0; c < 3; c++) {
      let value = 0;
      for (let dr = 0; dr <= 1; dr++) for (let dg = 0; dg <= 1; dg++) for (let db = 0; db <= 1; db++) {
        value += lut[(((ri + dr) * size + gi + dg) * size + bi + db) * 3 + c]
          * (dr ? fr : 1 - fr) * (dg ? fg : 1 - fg) * (db ? fb : 1 - fb);
      }
      data[i + c] = Math.round(value);
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).withIccProfile("srgb").png().toBuffer();
}
