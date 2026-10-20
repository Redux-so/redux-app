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
  let queue = Promise.resolve();
  const tx = {
    $queryRaw: async (strings) => { assert.match(strings.join("?"), /FOR UPDATE/); },
    image: {
      findFirstOrThrow: async () => image,
      update: async ({ data }) => { image = { ...image, ...data }; return image; },
    },
    imageVersion: {
      findFirst: async () => version,
      create: async ({ data }) => { version = { id: "autosave", ...data }; return version; },
      update: async ({ data }) => { version = { ...version, ...data }; return version; },
    },
  };
  const prisma = {
    image: { findFirst: async () => image },
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
  return { post: routeModule.exports.POST, image: () => image, version: () => version };
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
  await assert.rejects(host.post(await request(102, 90)), /storage unavailable/);
  assert.equal(host.image().previewUrl, "previous");
  assert.equal(host.version(), null);
});
