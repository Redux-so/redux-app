import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { require as tsxRequire } from "tsx/cjs/api";

const require = createRequire(import.meta.url);
const load = (path) => tsxRequire(path, import.meta.url);
const { applySoftwareImageFilter } = load("../lib/software-image-filter.ts");
const { buildInteractiveFilter } = load("../lib/interactive-image-filter.ts");
const filterValues = { exposure: 60, contrast: 60, blacks: 70, whites: 70, highlights: 70,
  shadows: 70, vibrance: 70, saturation: 70, sharpen: 70, clarity: 70, noiseReduction: -90 };

function fixture() {
  const width = 32, height = 24, pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) pixels.set([30 + i * 13 % 180, 20 + i * 7 % 190, 40 + i * 19 % 150, i % 13 === 0 ? 0 : i % 7 === 0 ? 150 : 255], i * 4);
  return { naturalWidth: width, naturalHeight: height, pixels };
}

/** Small pixel-backed DOM adapter: no Canvas filter property, matching affected browsers. */
function renderer(nativeFilters = false) {
  class Canvas {
    width = 0; height = 0;
    constructor() {
      let data = new Uint8ClampedArray();
      const pixels = () => { if (data.length !== this.width * this.height * 4) data = new Uint8ClampedArray(this.width * this.height * 4); return data; };
      this.context = {
        ...(nativeFilters ? { filter: "none" } : {}),
        globalCompositeOperation: "source-over", globalAlpha: 1,
        clearRect() { pixels().fill(0); },
        drawImage(source) { pixels().set(source.pixels ?? source.context.getImageData().data); },
        getImageData() { return { data: pixels().slice() }; },
        putImageData(image) { pixels().set(image.data); },
        fillRect() { for (let i = 0; i < pixels().length; i += 4) pixels().set(this.filter === "brightness(0)" ? [0, 0, 0, 255] : [255, 255, 255, 255], i); },
      };
    }
    getContext() { return this.context; }
  }
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL("../lib/interactive-image-preview.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Uint8ClampedArray,
    document: { createElement: () => new Canvas() },
    require: (id) => id.startsWith("@/") ? load(`../${id.slice(2)}`) : require(id),
  });
  return { Canvas, render: mod.exports.renderInteractiveImage };
}

for (const [key, value] of Object.entries(filterValues)) {
  test(`mobile renderer changes ${key} pixels without Canvas filters; preview and export agree`, () => {
    const { render } = renderer(), source = fixture();
    const edited = render(source, { [key]: value }).context.getImageData().data;
    assert.notDeepEqual(edited, source.pixels);
    const fullSize = render(source, { [key]: value }, undefined, true).context.getImageData().data;
    assert.deepEqual(fullSize, edited);
    for (let i = 3; i < edited.length; i += 4) assert.equal(edited[i], source.pixels[i], "effects preserve the document's alpha mask");
  });
}

test("neutral and reset previews preserve source pixels; repeated slider changes do not compound", () => {
  const { render, Canvas } = renderer(), source = fixture(), target = new Canvas();
  const first = render(source, { exposure: 40 }, target).context.getImageData().data;
  render(source, { exposure: -40 }, target);
  assert.deepEqual(render(source, { exposure: 40 }, target).context.getImageData().data, first);
  assert.deepEqual(render(source, {}, target).context.getImageData().data, source.pixels);
});

test("software brightness/contrast/saturation matches an independent sRGB SVG filter renderer", async () => {
  const source = Uint8ClampedArray.from([60,120,180,255, 150,70,200,255, 235,90,15,255]);
  const png = await sharp(Buffer.from(source), { raw: { width: 3, height: 1, channels: 4 } }).png().toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="3" height="1"><defs><filter id="f" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="linear" slope="1.2"/><feFuncG type="linear" slope="1.2"/><feFuncB type="linear" slope="1.2"/></feComponentTransfer><feComponentTransfer><feFuncR type="linear" slope="1.35" intercept="-0.175"/><feFuncG type="linear" slope="1.35" intercept="-0.175"/><feFuncB type="linear" slope="1.35" intercept="-0.175"/></feComponentTransfer><feColorMatrix type="saturate" values="0.55"/></filter></defs><image width="3" height="1" xlink:href="data:image/png;base64,${png.toString("base64")}" filter="url(#f)"/></svg>`;
  const expected = await sharp(Buffer.from(svg)).raw().toBuffer();
  applySoftwareImageFilter(source, 3, 1, { exposure: 20, contrast: 35, saturation: -45 });
  for (let i = 0; i < source.length; i++) assert.ok(Math.abs(source[i] - expected[i]) <= 2, `channel ${i}: ${source[i]} vs ${expected[i]}`);
});

test("native filters remain in use when the browser passes the filter pixel probe", () => {
  const { render, Canvas } = renderer(true), source = fixture(), target = new Canvas();
  let filteredDraw;
  const drawImage = target.context.drawImage;
  target.context.drawImage = function(image) { filteredDraw = this.filter; drawImage.call(this, image); };
  render(source, { exposure: 50, saturation: -30 }, target);
  assert.equal(filteredDraw, buildInteractiveFilter({ exposure: 50, saturation: -30 }));
  assert.equal(target.context.filter, "none");
});

test("software blur is deterministic and does not darken translucent colors", () => {
  const pixels = new Uint8ClampedArray(40 * 40 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([200, 100, 50, 150], i);
  const duplicate = pixels.slice();
  applySoftwareImageFilter(pixels, 40, 40, { noiseReduction: -100 });
  applySoftwareImageFilter(duplicate, 40, 40, { noiseReduction: -100 });
  assert.deepEqual(pixels, duplicate);
  const center = (20 * 40 + 20) * 4;
  for (const [offset, expected] of [[0,200],[1,100],[2,50],[3,150]]) assert.ok(Math.abs(pixels[center + offset] - expected) <= 1);
});
