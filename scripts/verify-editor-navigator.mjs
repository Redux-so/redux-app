import assert from "node:assert/strict";
import { test } from "node:test";
import { require as tsxRequire } from "tsx/cjs/api";
const { constrainViewport, visibleImageRect, fitNavigatorImage, navigatorPreviewSize } = tsxRequire("../lib/editor-viewport.ts", import.meta.url);
const image = { left: 50, top: 25, width: 400, height: 300 };

test("fit-to-screen indicator represents the whole image", () => {
  const vpt = constrainViewport([1, 0, 0, 1, 0, 0], image, 600, 400);
  assert.deepEqual(visibleImageRect(image, vpt, 600, 400), { left: 0, top: 0, width: 1, height: 1 });
});

test("zoomed indicator and click-to-center use the same scene coordinates", () => {
  const x = 0.65, y = 0.6, zoom = 3;
  const vpt = constrainViewport([zoom, 0, 0, zoom,
    300 - (image.left + x * image.width) * zoom,
    200 - (image.top + y * image.height) * zoom], image, 600, 400);
  const rect = visibleImageRect(image, vpt, 600, 400);
  assert.ok(Math.abs(rect.left + rect.width / 2 - x) < 1e-12);
  assert.ok(Math.abs(rect.top + rect.height / 2 - y) < 1e-12);
  assert.equal(rect.width, 0.5);
});

test("dragging far outside the navigator clamps each large-image edge", () => {
  for (const delta of [-100000, 100000]) {
    const vpt = constrainViewport([3, 0, 0, 3, delta, delta], image, 600, 400);
    const rect = visibleImageRect(image, vpt, 600, 400);
    assert.equal(rect.left, delta < 0 ? 0.5 : 0);
    assert.ok(rect.top >= 0 && rect.top + rect.height <= 1);
    assert.ok(image.left * 3 + vpt[4] <= 0);
    assert.ok((image.left + image.width) * 3 + vpt[4] >= 600);
  }
});

test("portrait and rotated compositions center axes that fit", () => {
  const portrait = { left: 200, top: 10, width: 120, height: 380 };
  const landscape = { left: 10, top: 150, width: 380, height: 120 };
  for (const bounds of [portrait, landscape]) {
    const vpt = constrainViewport([2, 0, 0, 2, 9999, -9999], bounds, 600, 400);
    const rect = visibleImageRect(bounds, vpt, 600, 400);
    if (bounds.width * 2 <= 600) assert.equal(rect.width, 1);
    if (bounds.height * 2 <= 400) assert.equal(rect.height, 1);
  }
});

test("thumbnail letterboxing preserves aspect ratio and maps its center", () => {
  for (const [width, height] of [[400, 100], [100, 400], [300, 300]]) {
    const fit = fitNavigatorImage({ left: -50, top: 80, width, height }, 160, 104);
    assert.ok(Math.abs(fit.width / fit.height - width / height) < 1e-12);
    assert.equal(fit.left + fit.width / 2, 80);
    assert.equal(fit.top + fit.height / 2, 52);
  }
});

test("resizing and changing cropped bounds always yields a valid visible region", () => {
  for (const [width, height] of [[1000, 600], [240, 160], [600, 900]]) {
    for (const bounds of [image, { left: 190, top: 200, width: 80, height: 50 }]) {
      for (const zoom of [0.1, 1, 2.5, 5]) {
        const vpt = constrainViewport([zoom, 0, 0, zoom, -357, 1234], bounds, width, height);
        const rect = visibleImageRect(bounds, vpt, width, height);
        assert.ok(rect.left >= 0 && rect.top >= 0 && rect.width > 0 && rect.height > 0);
        assert.ok(rect.left + rect.width <= 1 && rect.top + rect.height <= 1);
      }
    }
  }
});


test("landscape, portrait, and square previews have balanced visual area", () => {
  for (const ratio of [2 / 3, 1, 3 / 2, 16 / 9]) {
    const size = navigatorPreviewSize({ left: 0, top: 0, width: ratio * 100, height: 100 }, 800, 900);
    assert.ok(Math.abs(size.width / size.height - ratio) < 1e-12);
    assert.ok(Math.abs(size.width * size.height - 112 * 168) < 1e-8);
  }
});

test("extreme formats and small workspaces stay bounded without distortion", () => {
  for (const ratio of [0.1, 0.5, 1, 2, 10]) {
    for (const [workspaceWidth, workspaceHeight] of [[800, 900], [240, 200], [100, 100]]) {
      const size = navigatorPreviewSize({ left: 0, top: 0, width: ratio * 100, height: 100 }, workspaceWidth, workspaceHeight);
      assert.ok(Math.abs(size.width / size.height - ratio) < 1e-12);
      assert.ok(size.width <= Math.min(208, workspaceWidth - 24) + 1e-8);
      assert.ok(size.height <= Math.min(192, workspaceHeight * 0.4) + 1e-8);
    }
  }
});
