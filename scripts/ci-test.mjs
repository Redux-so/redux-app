/**
 * CI test entrypoint — no unit/e2e runner is configured yet.
 * Runs lightweight verification scripts; exits 1 if *.test.* exist without a runner.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;

function findTestFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }

  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const path = join(dir, name);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      findTestFiles(path, acc);
    } else if (TEST_FILE.test(name)) {
      acc.push(path);
    }
  }
  return acc;
}

const VERIFY_NODE_SCRIPTS = ["scripts/verify-introduction.mjs", "scripts/verify-mobile-rendering.mjs", "scripts/verify-auth-popup.mjs", "scripts/verify-mobile-layout.mjs", "scripts/verify-interactive-performance.mjs", "scripts/verify-image-storage.mjs", "scripts/verify-chat-tools.mjs", "scripts/verify-chat-history.mjs", "scripts/verify-album-rename.mjs", "scripts/verify-cover-save.mjs", "scripts/verify-icon-registry.mjs", "scripts/verify-editor-history.mjs", "scripts/verify-cloudinary-image-history.mjs", "scripts/verify-export-rendering.mjs", "scripts/verify-editor-navigator.mjs"];

const VERIFY_SCRIPTS = [
  "scripts/verify-api-validation.ts",
  "scripts/verify-ssrf-guards.ts",
  "scripts/verify-atomic-credits.ts",
  "scripts/verify-media-ownership.ts",
  "scripts/verify-background-embedding.ts",
  "scripts/verify-image-upload.ts",
  "scripts/verify-last-visited-page.ts",
  "scripts/verify-library-preview-sync.ts",
  "scripts/verify-autosave-version.ts",
  "scripts/verify-clerk-user-sync.ts",
  "scripts/verify-rate-limit-kv.ts",
];

function runVerifyScripts() {
  for (const script of VERIFY_NODE_SCRIPTS) {
    if (!existsSync(script)) continue;
    const result = spawnSync("node", [script], {
      stdio: "inherit",
      env: process.env,
    });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
  for (const script of VERIFY_SCRIPTS) {
    if (!existsSync(script)) continue;
    const result = spawnSync("pnpm", ["exec", "tsx", script], {
      stdio: "inherit",
      env: process.env,
    });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

const found = findTestFiles(process.cwd());

if (found.length === 0) {
  console.log(
    "ci-test: No *.test.* or *.spec.* files — running verification scripts.",
  );
  runVerifyScripts();
  process.exit(0);
}

console.error(
  "ci-test: Test files found but no test runner is configured in package.json:",
);
for (const file of found) {
  console.error(`  - ${file}`);
}
process.exit(1);
