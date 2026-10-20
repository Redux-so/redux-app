/** Exercise the rename route with real validation and isolated auth/storage. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { require as tsxRequire } from "tsx/cjs/api";

const nativeRequire = createRequire(import.meta.url);
function host(authenticated = true) {
  const albums = [
    { id: "album-a", userId: "user-a", name: "Original", imageIds: ["photo-a"] },
    { id: "album-b", userId: "user-b", name: "Private", imageIds: [] },
  ];
  let writes = 0;
  const adapters = {
    "@/lib/require-user": { requireAuthUser: async () => authenticated
      ? { user: { id: "user-a" } }
      : { error: new Response(null, { status: 401 }) } },
    "@/lib/prisma": { prisma: { album: { updateMany: async ({ where, data }) => {
      writes++;
      const album = albums.find((item) => item.id === where.id && item.userId === where.userId);
      if (!album) return { count: 0 };
      Object.assign(album, data);
      return { count: 1 };
    } } } },
  };
  const code = ts.transpileModule(readFileSync(new URL("../app/api/albums/[albumId]/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const routeModule = { exports: {} };
  vm.runInNewContext(code, { module: routeModule, exports: routeModule.exports, console,
    require: (id) => adapters[id] ?? (id.startsWith("@/")
      ? tsxRequire(`../${id.slice(2)}.ts`, import.meta.url) : nativeRequire(id)),
  });
  return { albums, writes: () => writes, rename: (id, body) => routeModule.exports.PATCH(
    new Request("http://localhost/api/albums/" + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body }),
    { params: Promise.resolve({ albumId: id }) },
  ) };
}

test("renaming trims the name and preserves album identity and photos", async () => {
  const app = host();
  const response = await app.rename("album-a", JSON.stringify({ name: "  Summer trip  " }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { album: { id: "album-a", name: "Summer trip" } });
  assert.deepEqual(app.albums[0], { id: "album-a", userId: "user-a", name: "Summer trip", imageIds: ["photo-a"] });
});

test("foreign and missing albums cannot be renamed", async () => {
  const app = host();
  for (const id of ["album-b", "missing"]) {
    assert.equal((await app.rename(id, JSON.stringify({ name: "New name" }))).status, 404);
  }
  assert.equal(app.albums[1].name, "Private");
});

test("invalid names, malformed JSON, and unauthenticated requests cannot write", async () => {
  const app = host();
  for (const body of ["{", "{}", JSON.stringify({ name: "  " }), JSON.stringify({ name: "a".repeat(81) }), JSON.stringify({ name: 123 })]) {
    assert.equal((await app.rename("album-a", body)).status, 400);
  }
  assert.equal(app.writes(), 0);
  const anonymous = host(false);
  assert.equal((await anonymous.rename("album-a", JSON.stringify({ name: "New" }))).status, 401);
  assert.equal(anonymous.writes(), 0);
});
