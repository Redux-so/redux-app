import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(path, adapters, globals = {}) {
  const mod = { exports: {} };
  let source = readFileSync(new URL(path, import.meta.url), "utf8");
  if (path.includes("SignInForm")) source = source.replace("  if (!mounted", "  capture(handleGoogleSignIn);\n  if (!mounted");
  if (path.includes("SignUpForm")) source = source.replace("  if (!mounted", "  capture(handleGoogleSignUp);\n  if (!mounted");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console,
    require: (id) => adapters[id] ?? require(id), ...globals });
  return mod.exports;
}
function popupHost(blocked = false) {
  const calls = [];
  const popup = { closed: false, document: { title: "", documentElement: { style: {} } }, close() { this.closed = true; } };
  const { authenticateWithGooglePopup } = compile("../lib/google-auth-popup.ts", {
    "@/lib/surface-colors": { SURFACE_MAIN_HEX: "#161616" },
  }, { window: { open: (...args) => { calls.push(args); return blocked ? null : popup; } } });
  return { authenticateWithGooglePopup, calls, popup };
}

test("Google opens a dark popup synchronously and passes it to Clerk without navigating the main tab", async () => {
  const app = popupHost();
  let resolve, received;
  const pending = app.authenticateWithGooglePopup((popup) => { received = popup; return new Promise((done) => { resolve = done; }); });
  assert.equal(app.calls.length, 1);
  assert.equal(received, app.popup);
  assert.equal(app.popup.document.documentElement.style.backgroundColor, "#161616");
  assert.equal(app.popup.document.documentElement.style.colorScheme, "dark");
  resolve(); await pending;
  assert.equal(app.popup.closed, false, "Clerk owns successful popup completion");
});

test("blocked popups do not start OAuth and provide a retryable error", async () => {
  const app = popupHost(true);
  let called = false;
  await assert.rejects(app.authenticateWithGooglePopup(async () => { called = true; }), /Allow pop-ups/);
  assert.equal(called, false);
});

test("failed or cancelled OAuth closes the popup and preserves the error", async () => {
  const app = popupHost(), error = new Error("Google sign-in cancelled");
  await assert.rejects(app.authenticateWithGooglePopup(async () => { throw error; }), (actual) => actual === error);
  assert.equal(app.popup.closed, true);
});

const origins = ["http://localhost:3000", "http://192.168.1.20:3000", "https://redux.example.com"];
const mounts = origins.flatMap((origin) => ["", "/app"].map((basePath) => ({ origin, basePath })));
for (const { origin, basePath } of mounts) {
for (const resource of ["signIn", "signUp"]) {
  test(`${resource} uses absolute Clerk popup URLs at ${origin}${basePath} and releases the busy state after failure`, async () => {
    const app = popupHost(), slots = [];
    let cursor = 0, handler, params, fail = false;
    const auth = { loaded: true, client: { [resource]: { authenticateWithPopup: async (value) => {
      // Clerk parses these as full URLs in the popup flow.
      assert.equal(new URL(value.redirectUrl).origin, origin);
      assert.equal(new URL(value.redirectUrlComplete).origin, origin);
      params = value; if (fail) throw new Error("Try again");
    } } } };
    const Form = compile(`../components/auth/${resource === "signIn" ? "SignInForm" : "SignUpForm"}.tsx`, {
      react: { useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = index === 0 ? true : initial;
        return [slots[index], (value) => { slots[index] = value; }]; }, useEffect() {}, useCallback: (fn) => fn },
      "next/navigation": { useRouter: () => ({ replace() {}, push() {} }) },
      "@clerk/nextjs": { useClerk: () => auth, useAuth: () => ({ isLoaded: true, isSignedIn: false }),
        [resource === "signIn" ? "useSignIn" : "useSignUp"]: () => ({ [resource]: {}, errors: { fields: {}, global: [] }, fetchStatus: "idle" }) },
      "@/lib/google-auth-popup": app,
      "@/lib/app-path": compile("../lib/app-path.ts", {}, { process: { env: { NEXT_PUBLIC_APP_BASE_PATH: basePath } } }),
      "@/lib/brand-colors": { AUTH_PRIMARY_BTN_CLASS: "" },
      "@/components/shared/LoadingSpinner": { LoadingSpinner: () => null },
    }, { capture: (fn) => { handler = fn; }, process: { env: {} }, URL, window: { location: { origin } } }).default;
    function render() { cursor = 0; Form(); }
    render(); await handler();
    assert.equal(params.popup, app.popup);
    assert.equal(params.strategy, "oauth_google");
    assert.equal(params.redirectUrl, `${origin}${basePath}/sso-callback`);
    assert.equal(params.redirectUrlComplete, `${origin}${basePath}/library`);
    if (resource === "signIn") assert.equal(params.continueSignIn, false);
    assert.equal(slots.at(-1), false);
    fail = true; render(); await handler();
    assert.equal(slots.at(-1), false, "failed or cancelled authentication permits another click");
    assert.equal(slots.at(-2), "Try again");
  });
}

}
