/** W3C `color` blend: source chroma with backdrop luminosity, in sRGB bytes. */
export function applyColorBlend(data: Uint8Array, source: readonly number[], opacity: number): void {
  const sourceLum = 0.3 * source[0] + 0.59 * source[1] + 0.11 * source[2];
  const sourceMin = Math.min(...source);
  const sourceMax = Math.max(...source);
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
    const difference = lum - sourceLum;
    const min = sourceMin + difference;
    const max = sourceMax + difference;
    for (let channel = 0; channel < 3; channel++) {
      let mixed = source[channel] + difference;
      if (min < 0) mixed = lum + ((mixed - lum) * lum) / (lum - min);
      if (max > 255) mixed = lum + ((mixed - lum) * (255 - lum)) / (max - lum);
      data[i + channel] = Math.max(0, Math.min(255, Math.round(data[i + channel] * (1 - opacity) + mixed * opacity)));
    }
  }
}
