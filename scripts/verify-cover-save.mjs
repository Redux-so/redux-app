/** Exercise the real save route with isolated storage/auth/DB adapters. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { require as tsxRequire } from "tsx/cjs/api";

const nativeRequire = createRequire(import.meta.url);
const load = (path) => tsxRequire(path, import.meta.url);

function routeHost(upload) {
  let image = { id: "image-a", userId: "user-a", originalUrl: "https://example.com/original.png", publicId: "original", previewUrl: "previous", metadata: {} };
  let version = null;
  const assets = [];
  const namedVersions = [];
  let queue = Promise.resolve();
  const tx = {
    $queryRaw: async (strings) => { assert.match(strings.join("?"), /FOR UPDATE/); },
    image: {
      findFirstOrThrow: async () => image,
      update: async ({ data }) => { image = { ...image, ...data }; return image; },
    },
    imageVersion: {
      findFirst: async () => version,
      create: async ({ data }) => {
        if (data.adjustments.operationResult) { const asset = { id: `asset-${assets.length}`, ...data }; assets.push(asset); return asset; }
        if (data.label !== "__autosave__") {
          const named = { id: `named-${namedVersions.length}`, ...data }; namedVersions.push(named); return named;
        }
        version = { id: "autosave", ...data }; return version;
      },
      update: async ({ data }) => { version = { ...version, ...data }; return version; },
    },
  };
  const prisma = {
    image: { findFirst: async () => image },
    imageVersion: { ...tx.imageVersion, findMany: async () => [...namedVersions, ...assets] },
    $transaction: (callback) => {
      const run = queue.then(async () => {
        const beforeImage = image, beforeVersion = version;
        try { return await callback(tx); }
        catch (error) { image = beforeImage; version = beforeVersion; throw error; }
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  const adapters = {
    "@/lib/prisma": { prisma },
    "@/lib/cloudinary": { uploadToCloudinary: upload },
    "@/lib/require-user": { requireAuthUser: async () => ({ user: { id: "user-a" } }) },
    "@/lib/expensive-route-guard": { enforceFeatureRateLimits: async () => null },
  };
  const code = ts.transpileModule(readFileSync(new URL("../app/api/images/versions/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const routeModule = { exports: {} };
  vm.runInNewContext(code, {
    module: routeModule, exports: routeModule.exports, Buffer, URL, console,
    require: (id) => adapters[id] ?? (id.startsWith("@/") ? load(`../${id.slice(2)}.ts`) : nativeRequire(id)),
  });
  return { post: routeModule.exports.POST, get: routeModule.exports.GET, image: () => image, version: () => version, assets: () => assets, namedVersions: () => namedVersions };
}

async function request(generation, temperature) {
  const coverBase64 = (await sharp({ create: { width: 4, height: 3, channels: 4, background: { r: temperature, g: 30, b: 20, alpha: 0.5 } } }).png().toBuffer()).toString("base64");
  return new Request("https://example.com/api/images/versions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageId: "image-a", adjustments: { temperature }, coverBase64, saveGeneration: generation }),
  });
}

test("a slower older save cannot replace a newer cover or saved editor state", async () => {
  let release, started;
  const uploading = new Promise((resolve) => { started = resolve; });
  let uploads = 0;
  const host = routeHost(async (_buffer, _name, options) => {
    assert.equal(options, undefined); // immutable upload default
    const id = ++uploads;
    if (id === 1) { started(); await new Promise((resolve) => { release = resolve; }); }
    return { secureUrl: `cover-${id}` };
  });
  const older = host.post(await request(100, 40));
  await uploading;
  const newer = await host.post(await request(101, 80));
  assert.equal(newer.status, 200);
  assert.equal(host.image().previewUrl, "cover-2");
  assert.equal(host.version().adjustments.sliders.temperature, 80);
  release();
  assert.equal((await (await older).json()).stale, true);
  assert.equal(host.image().previewUrl, "cover-2");
  assert.equal(host.image().metadata.saveGeneration, 101);
  assert.equal(host.version().adjustments.sliders.temperature, 80);
});

test("failed cover upload preserves the saved cover and version", async () => {
  const host = routeHost(async () => { throw new Error("storage unavailable"); });
  const response = await host.post(await request(102, 90));
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /Could not save/);
  assert.equal(host.image().previewUrl, "previous");
  assert.equal(host.version(), null);
});

test("a permanent storage-size failure is actionable and never publishes partial state", async () => {
  const { ImageStorageError } = load("../lib/image-storage.ts");
  const host = routeHost(async () => { throw new ImageStorageError("Cannot store this image losslessly. Configure larger-image storage.", false); });
  const response = await host.post(await request(103, 30));
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "Cannot store this image losslessly. Configure larger-image storage.", code: "IMAGE_STORAGE_LIMIT", retryable: false });
  assert.equal(host.image().previewUrl, "previous");
  assert.equal(host.version(), null);
});


test("autosave persists the selected step, redo history, and deduplicated immutable sources", async () => {
  const { createEditorTimeline, appendEditorHistory, serializeEditorTimeline, parseEditorTimeline } = load("../lib/editor-history.ts");
  const { serializePersistedEditorState } = load("../lib/editor-state.ts");
  let timeline = createEditorTimeline();
  const cropped = { ...timeline.entries[0].state, workingImageUrl: "history-image:0", workingWidth: 200, workingHeight: 100 };
  timeline = appendEditorHistory(timeline, cropped, true, "Crop applied");
  timeline = appendEditorHistory(timeline, { ...cropped, sliders: { ...cropped.sliders, temperature: 40 } }, true, "Temperature adjusted");
  timeline.cursor = 0;
  const host = routeHost(async (_buffer, filename) => ({ secureUrl: `https://res.cloudinary.com/demo/image/upload/v1/redux/${filename}`, publicId: filename }));
  const response = await host.post(new Request("https://example.com/api/images/versions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageId: "image-a", adjustments: serializePersistedEditorState(timeline.entries[0].state),
      history: serializeEditorTimeline(timeline), historyImages: ["Y3JvcA=="], saveGeneration: 200 }),
  }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(host.assets().length, 1);
  assert.equal(data.historySources.length, 1);
  const restored = parseEditorTimeline(host.version().adjustments);
  assert.equal(restored.cursor, 0);
  assert.deepEqual(restored.entries.map((entry) => entry.label), ["Original", "Crop applied", "Temperature adjusted"]);
  assert.equal(restored.entries[1].state.workingImageUrl, data.historySources[0]);
  assert.equal(restored.entries[2].state.workingImageUrl, data.historySources[0]);
  assert.equal(restored.entries[2].state.sliders.temperature, 40);
});

test("named versions keep complete document state without changing the current autosave", async () => {
  const { defaultPersistedEditorState, serializePersistedEditorState } = load("../lib/editor-state.ts");
  const host = routeHost(async () => ({ secureUrl: "https://res.cloudinary.com/demo/image/upload/working.png", publicId: "working" }));
  const state = defaultPersistedEditorState();
  state.sliders.temperature = 60;
  state.transform.rotation = 90;
  const response = await host.post(new Request("https://example.com/api/images/versions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageId: "image-a", adjustments: serializePersistedEditorState(state), imageBase64: "Y3JvcA==", label: "Warm portrait" }),
  }));
  assert.equal(response.status, 200);
  const { version } = await response.json();
  assert.equal(version.label, "Warm portrait");
  assert.equal(version.adjustments.namedVersion, true);
  assert.equal(version.adjustments.sliders.temperature, 60);
  assert.equal(version.adjustments.transform.rotation, 90);
  assert.equal(version.adjustments.workingImageUrl, "https://res.cloudinary.com/demo/image/upload/working.png");
  assert.equal(host.image().previewUrl, "previous");
  assert.equal(host.version(), null);
});


test("large native history sources upload independently without publishing edits", async () => {
  const host = routeHost(async () => ({ secureUrl: "https://res.cloudinary.com/demo/image/upload/source.png", publicId: "source" }));
  const response = await host.post(new Request("https://example.com/api/images/versions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageId: "image-a", adjustments: {}, imageBase64: "c291cmNl", sourceOnly: true }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sourceUrl, "https://res.cloudinary.com/demo/image/upload/source.png");
  assert.equal(host.assets().length, 1);
  assert.equal(host.version(), null);
  assert.equal(host.namedVersions().length, 0);
  assert.equal(host.image().previewUrl, "previous");
});


test("history listing hides working-source rows and recovers legacy checkpoint pixels", async () => {
  const host = routeHost(async () => ({ secureUrl: "https://res.cloudinary.com/demo/image/upload/source.png", publicId: "source" }));
  await host.post(new Request("https://example.com/api/images/versions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageId: "image-a", adjustments: {}, imageBase64: "c291cmNl", sourceOnly: true }),
  }));
  host.namedVersions().push({ id: "legacy", url: "https://example.com/healed.png", label: "Heal", adjustments: {}, createdAt: new Date().toISOString() });
  host.namedVersions().push({ id: "named", url: "https://example.com/original.png", label: "My look", adjustments: { v: 2, sliders: { temperature: 25 }, namedVersion: true }, createdAt: new Date().toISOString() });
  const response = await host.get(new Request("https://example.com/api/images/versions?imageId=image-a"));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.versions.length, 2);
  assert.equal(data.versions[0].legacy, true);
  assert.equal(data.versions[0].adjustments.workingImageUrl, "https://example.com/healed.png");
  assert.equal(data.versions[1].legacy, false);
  assert.equal(data.versions[1].adjustments.sliders.temperature, 25);
});

test("invalid cursor or Original state cannot be persisted", async () => {
  const { createEditorTimeline, serializeEditorTimeline } = load("../lib/editor-history.ts");
  const { serializePersistedEditorState } = load("../lib/editor-state.ts");
  let uploads = 0;
  const host = routeHost(async () => { uploads++; throw new Error("unexpected upload"); });
  for (const invalid of ["cursor", "original"]) {
    const timeline = createEditorTimeline();
    const state = serializePersistedEditorState(timeline.entries[0].state);
    const history = serializeEditorTimeline(timeline);
    if (invalid === "cursor") history.cursor = 10;
    else history.entries[0].state.sliders = { temperature: 50 };
    const response = await host.post(new Request("https://example.com/api/images/versions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId: "image-a", adjustments: state, history }),
    }));
    assert.equal(response.status, 400);
  }
  assert.equal(uploads, 0);
  assert.equal(host.version(), null);
});
