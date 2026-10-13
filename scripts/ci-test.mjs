/**
 * CI test entrypoint — no unit/e2e runner is configured yet.
 * Exits 0 when no *.test.* / *.spec.* files exist.
 * Exits 1 if test files exist but no runner is wired (prevents silent gaps).
 */
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

const found = findTestFiles(process.cwd());

if (found.length === 0) {
  console.log(
    "ci-test: No *.test.* or *.spec.* files — skipping (add a runner before adding tests).",
  );
  process.exit(0);
}

console.error(
  "ci-test: Test files found but no test runner is configured in package.json:",
);
for (const file of found) {
  console.error(`  - ${file}`);
}
process.exit(1);
