import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { isAppPagePath, safePreviousPage, rememberVisitedPage, LAST_VISITED_PAGE_KEY } from "../lib/last-visited-page";

for (const page of ["/", "/library", "/settings?tab=billing", "/editor?imageId=photo-123", "/sign-in", "/sign-up", "/sign-in/factor-one", "/library#recent"]) {
  assert.equal(safePreviousPage(page), page);
}
for (const page of [null, "", "/unknown", "/editor", "/editor/", "/editor?imageId=", "/editor?imageId=%20", "/editor?image=photo-123", "/editor/unknown", "/api/images", "/monitoring", "/sso-callback", "/sso-callback/", "https://evil.example/library", "//evil.example/library", "/\\evil.example/library", "javascript:alert(1)", "/sign-in-typo"]) {
  assert.equal(safePreviousPage(page), null, String(page));
}
assert.equal(isAppPagePath("/library/"), true);
assert.equal(isAppPagePath("/sso-callback"), true);

const storage = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: { setItem: (key: string, value: string) => storage.set(key, value) },
});
try {
  const editorUrl = "/editor?imageId=photo-123";
  rememberVisitedPage(editorUrl);
  for (const invalid of ["/editor", "/editor?imageId=", "/unknown"]) {
    rememberVisitedPage(invalid);
    assert.equal(storage.get(LAST_VISITED_PAGE_KEY), editorUrl, "Incomplete URLs must not overwrite the previous image");
  }
} finally {
  if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
}

// Route inventory guards the proxy's page classification as the app grows.
function checkPages(directory: string, segments: string[] = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== "api") {
      checkPages(join(directory, entry.name), entry.name.startsWith("(") ? segments : [...segments, entry.name]);
    } else if (entry.name === "page.tsx") {
      const path = "/" + segments.filter((segment) => !segment.startsWith("[[...")).join("/");
      assert.ok(isAppPagePath(path), `Add new page ${path} to isAppPagePath before shipping`);
    }
  }
}
checkPages(join(process.cwd(), "app"));
console.log("verify-last-visited-page: ok");
