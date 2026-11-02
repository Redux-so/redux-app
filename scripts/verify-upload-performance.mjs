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
function compile(path, adapters = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Buffer, Blob, File, FormData, Request, Response, URL, performance,
    console: { error() {} }, require: (id) => adapters[id] ?? (id.startsWith("@/") ? load(`../${id.slice(2)}`) : nativeRequire(id)),
  });
  return mod.exports;
}

function authHost({ exists = true, signedIn = true } = {}) {
  const calls = { profile: 0, writes: 0, reads: 0 };
  const row = { id: "user-a", clerkId: "clerk-a", creditBalance: 25 };
  const { requireAuthUser } = compile("../lib/require-user.ts", {
    "@clerk/nextjs/server": {
      auth: async () => ({ userId: signedIn ? "clerk-a" : null }),
      currentUser: async () => { calls.profile++; return { fullName: "Test User", primaryEmailAddress: { emailAddress: "test@example.com" } }; },
    },
    "@/lib/prisma": { prisma: { user: { findUnique: async ({ where }) => { assert.equal(where.clerkId, "clerk-a"); calls.reads++; return exists ? row : null; } } } },
    "@/lib/ensure-prisma-user": { upsertPrismaUser: async (profile) => { assert.equal(profile.clerkId, "clerk-a"); calls.writes++; return row; } },
  });
  return { calls, requireAuthUser };
}

test("batch uploads authenticate each request without repeated profile requests or user writes", async () => {
  const app = authHost();
  for (const result of await Promise.all(Array.from({ length: 3 }, () => app.requireAuthUser({ refreshProfile: false })))) {
    assert.equal(result.user.id, "user-a");
    assert.equal(result.user.creditBalance, 25);
  }
  assert.deepEqual(app.calls, { profile: 0, writes: 0, reads: 3 });
});

test("new accounts still initialize, other endpoints still refresh, and signed-out uploads stay unauthorized", async () => {
  const fresh = authHost({ exists: false });
  assert.equal((await fresh.requireAuthUser({ refreshProfile: false })).user.id, "user-a");
  assert.deepEqual(fresh.calls, { profile: 1, writes: 1, reads: 1 });
  const regular = authHost(); await regular.requireAuthUser();
  assert.deepEqual(regular.calls, { profile: 1, writes: 1, reads: 0 });
  const signedOut = authHost({ signedIn: false });
  assert.equal((await signedOut.requireAuthUser({ refreshProfile: false })).error.status, 401);
  assert.deepEqual(signedOut.calls, { profile: 0, writes: 0, reads: 0 });
});

async function fixture() {
  const png = await sharp({ create: { width: 1500, height: 1000, channels: 4, background: "red" } }).png().toBuffer();
  const { CLOUDINARY_IMAGE_MAX_BYTES } = load("../lib/image-storage.ts");
  return { png, large: Buffer.concat([png, Buffer.alloc(CLOUDINARY_IMAGE_MAX_BYTES)]) };
}
const original = { secureUrl: "https://example.ufs.sh/f/original", publicId: "uploadthing:original", width: 1500, height: 1000, format: "png" };
const cover = { secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/cover.webp", publicId: "redux/cover", width: 512, height: 341, format: "webp" };

test("large originals upload in parallel with a small cover and retain exact source bytes", async () => {
  const { large } = await fixture();
  let completeOriginal, completedCover;
  const originalUpload = new Promise((resolve) => { completeOriginal = resolve; });
  const coverUpload = new Promise((resolve) => { completedCover = resolve; });
  const { storeLibraryUpload } = compile("../lib/store-library-upload.ts", {
    "@/lib/cloudinary": { uploadToCloudinary: async (buffer, name, options) => {
      assert.equal(options.preserveOriginal, true);
      if (name === "photo.png") { assert.equal(buffer, large); return originalUpload; }
      const metadata = await sharp(buffer).metadata();
      assert.ok(metadata.width <= 512 && metadata.height <= 512);
      assert.ok(buffer.length < 100_000);
      completedCover();
      return cover;
    } },
  });
  const pending = storeLibraryUpload(large, "photo.png", "image/png");
  await coverUpload; // The cover finishes while original storage is still pending.
  completeOriginal(original);
  const result = await pending;
  assert.equal(result.secureUrl, original.secureUrl);
  assert.equal(result.width, 1500); assert.equal(result.height, 1000);
  assert.equal(result.cover.secureUrl, cover.secureUrl);
});

test("ordinary small photos skip cover work; TIFF uploads get a browser-compatible cover", async () => {
  const { png } = await fixture();
  const names = [];
  const { storeLibraryUpload } = compile("../lib/store-library-upload.ts", {
    "@/lib/cloudinary": { uploadToCloudinary: async (_buffer, name) => { names.push(name); return name.includes("_upload_cover") ? cover : original; } },
  });
  assert.equal((await storeLibraryUpload(png, "small.png", "image/png")).cover, null);
  assert.equal(names.length, 1);
  assert.equal((await storeLibraryUpload(png, "photo.tiff", "image/tiff")).cover.secureUrl, cover.secureUrl);
  assert.equal(names.length, 3);
});

test("a failed cover never fails a stored original, and a failed original cleans up its cover", async () => {
  const { large } = await fixture();
  for (const originalFails of [false, true]) {
    const deleted = [];
    const { storeLibraryUpload } = compile("../lib/store-library-upload.ts", {
      "@/lib/cloudinary": {
        uploadToCloudinary: async (_buffer, name) => {
          const isOriginal = name === "photo.png";
          if (isOriginal === originalFails) throw new Error("storage unavailable");
          return isOriginal ? original : cover;
        },
        deleteFromCloudinary: async (id) => deleted.push(id),
      },
    });
    if (originalFails) {
      await assert.rejects(storeLibraryUpload(large, "photo.png", "image/png"), /storage unavailable/);
      assert.deepEqual(deleted, [cover.publicId]);
    } else assert.equal((await storeLibraryUpload(large, "photo.png", "image/png")).cover, null);
  }
});

test("upload route overlaps rate checks and body reading, saves the original plus cover and reports timings", async () => {
  const { png } = await fixture();
  const form = new FormData(); form.set("file", new File([png], "photo.png", { type: "image/png" }));
  let allow, bodyRead, data;
  const rate = new Promise((resolve) => { allow = resolve; });
  const body = new Promise((resolve) => { bodyRead = resolve; });
  const { POST } = compile("../app/api/images/route.ts", {
    "@/lib/require-user": { requireAuthUser: async (options) => { assert.equal(options.refreshProfile, false); return { user: { id: "user-a" } }; } },
    "@/lib/expensive-route-guard": { enforceFeatureRateLimits: () => rate },
    "@/lib/list-user-images": {},
    "@/lib/prisma": { prisma: { image: { create: async (options) => { data = options.data; return { id: "image-a", ...data }; } } } },
    "@/lib/store-library-upload": { storeLibraryUpload: async (buffer) => { assert.deepEqual(buffer, png); return { ...original, cover }; } },
    "@/lib/schedule-image-embedding": { scheduleImageEmbeddingAfterResponse: (_route, id, url) => { assert.equal(id, "image-a"); assert.equal(url, original.secureUrl); } },
  });
  const response = POST({ formData: async () => { bodyRead(); return form; } });
  await body; allow(null);
  const result = await response;
  assert.equal(result.status, 200);
  assert.match(result.headers.get("Server-Timing"), /auth;dur=\d+\.\d, validation;dur=/);
  assert.equal(data.originalUrl, original.secureUrl); assert.equal(data.previewUrl, cover.secureUrl);
  assert.equal(data.metadata.uploadCoverPublicId, cover.publicId);
  assert.equal(data.width, 1500); assert.equal(data.height, 1000);
});

test("upload covers remain collectible after editor saves replace the current preview", async () => {
  const { collectImageRemoteAssets } = compile("../lib/collect-image-remote-assets.ts", {
    "@/lib/prisma": { prisma: {
      image: { findFirst: async () => ({ publicId: "uploadthing:original", previewUrl: "https://res.cloudinary.com/demo/image/upload/v1/redux/latest.webp", metadata: { uploadCoverPublicId: cover.publicId } }) },
      imageVersion: { findMany: async () => [] }, chatTurn: { findMany: async () => [] },
    } },
  });
  const assets = await collectImageRemoteAssets("image-a", "user-a");
  assert.ok(assets.cloudinaryPublicIds.includes(cover.publicId));
  assert.ok(assets.cloudinaryPublicIds.includes("uploadthing:original"));
});

test("authentication, rate limits and invalid files still block storage and embedding", async () => {
  for (const status of [401, 429, 400]) {
    const { POST } = compile("../app/api/images/route.ts", {
      "@/lib/require-user": { requireAuthUser: async () => status === 401
        ? { error: Response.json({ error: "Unauthorized" }, { status: 401 }) } : { user: { id: "user-a" } } },
      "@/lib/expensive-route-guard": { enforceFeatureRateLimits: async () => status === 429 ? Response.json({ error: "Rate limited" }, { status: 429 }) : null },
      "@/lib/list-user-images": {}, "@/lib/prisma": {},
      "@/lib/store-library-upload": { storeLibraryUpload: async () => assert.fail("Blocked requests cannot store files") },
      "@/lib/schedule-image-embedding": { scheduleImageEmbeddingAfterResponse: () => assert.fail("Blocked requests cannot schedule work") },
    });
    assert.equal((await POST({ formData: async () => new FormData() })).status, status);
  }
});
