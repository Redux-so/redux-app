// Share immutable source pixels between the canvas, cover rendering and exports.
// Keep only two sources so navigating through a library does not retain every image.
const sources = new Map<string, { promise: Promise<HTMLImageElement>; pixels: number }>();
let warming = false;

function trimSources() {
  while (sources.size > 2 || [...sources.values()].reduce((sum, entry) => sum + entry.pixels, 0) > 32_000_000) {
    sources.delete(sources.keys().next().value!);
  }
}

export function loadDecodedImage(url: string): Promise<HTMLImageElement> {
  const cached = sources.get(url);
  if (cached) {
    sources.delete(url);
    sources.set(url, cached);
    return cached.promise;
  }
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.src = url;
  const pending = image.decode().then(() => {
    if (sources.get(url)?.promise === pending) {
      sources.get(url)!.pixels = image.naturalWidth * image.naturalHeight;
      trimSources();
    }
    return image;
  });
  sources.set(url, { promise: pending, pixels: 0 });
  trimSources();
  void pending.catch(() => {
    if (sources.get(url)?.promise === pending) sources.delete(url);
  });
  return pending;
}

/** Only one speculative download at a time; opening an image is never blocked by it. */
export function prefetchDecodedImage(url: string): void {
  if (warming || sources.has(url)) return;
  warming = true;
  void loadDecodedImage(url).catch(() => {}).finally(() => { warming = false; });
}
