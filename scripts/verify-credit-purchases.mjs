import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { require as tsxRequire } from "tsx/cjs/api";

const nativeRequire = createRequire(import.meta.url);

function checkoutHost(flag) {
  let checkoutCalls = 0;
  let bundleReads = 0;
  const process = { env: {
    CREDIT_PURCHASES_ENABLED: flag,
    STRIPE_SECRET_KEY: "mock-key",
    NEXT_PUBLIC_APP_URL: "https://example.test/app",
  } };
  const adapters = {
    "@/lib/require-user": { requireAuthUser: async () => ({ user: { id: "user-a" } }) },
    "@/lib/prisma": { prisma: { creditBundle: { findFirst: async () => {
      bundleReads++;
      return { id: "bundle-a", stripePriceId: "price-a" };
    } } } },
    stripe: { default: class {
      checkout = { sessions: { create: async () => {
        checkoutCalls++;
        return { url: "https://checkout.example.test" };
      } } };
    } },
  };

  function compile(path) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const mod = { exports: {} };
    vm.runInNewContext(outputText, {
      module: mod, exports: mod.exports, process, console,
      require: (id) => adapters[id] ?? (id.startsWith("@/")
        ? tsxRequire(`../${id.slice(2)}.ts`, import.meta.url)
        : nativeRequire(id)),
    });
    return mod.exports;
  }

  adapters["@/lib/credit-purchases"] = compile("../lib/credit-purchases.ts");
  const { POST } = compile("../app/api/credits/checkout/route.ts");
  return {
    checkout: () => POST(new Request("https://example.test/app/api/credits/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleId: "bundle-a" }),
    })),
    counts: () => ({ checkoutCalls, bundleReads }),
  };
}

test("checkout fails closed before reading bundles or contacting Stripe", async () => {
  for (const flag of [undefined, "false", "1"]) {
    const app = checkoutHost(flag);
    const response = await app.checkout();
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "Credit purchases are unavailable during the closed beta.");
    assert.deepEqual(app.counts(), { checkoutCalls: 0, bundleReads: 0 });
  }
});

test("explicitly enabling purchases restores Stripe checkout", async () => {
  const app = checkoutHost("true");
  const response = await app.checkout();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).url, "https://checkout.example.test");
  assert.deepEqual(app.counts(), { checkoutCalls: 1, bundleReads: 1 });
});
