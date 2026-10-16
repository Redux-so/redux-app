#!/usr/bin/env node
/**
 * Ensures every <Icon name="…"> / iconName / icon field has a registry entry.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const registryPath = path.join(root, "components/shared/icon-registry.ts");
const registrySource = fs.readFileSync(registryPath, "utf8");
const registered = new Set(
  [...registrySource.matchAll(/^\s+([A-Za-z0-9]+),$/gm)].map((m) => m[1]),
);

const used = new Set();
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx|ts)$/.test(entry.name)) {
      const source = fs.readFileSync(full, "utf8");
      for (const m of source.matchAll(/<Icon[^>]*\sname="([A-Za-z0-9]+)"/g)) {
        used.add(m[1]);
      }
      for (const m of source.matchAll(/iconName:\s*"([A-Za-z0-9]+)"/g)) {
        used.add(m[1]);
      }
      for (const m of source.matchAll(/\bicon:\s*"([A-Za-z0-9]+)"/g)) {
        used.add(m[1]);
      }
      if (full.endsWith("resolve-empty-state-icon.ts")) {
        for (const m of source.matchAll(/return\s+"([A-Za-z0-9]+)"/g)) {
          used.add(m[1]);
        }
      }
    }
  }
}
walk(root);

const missing = [...used].filter((name) => !registered.has(name)).sort();
const unused = [...registered].filter((name) => !used.has(name)).sort();

if (missing.length) {
  console.error("Missing from icon-registry.ts:", missing.join(", "));
  process.exit(1);
}

if (unused.length) {
  console.warn("Registered but unused (ok to keep for near-term reuse):", unused.join(", "));
}

console.log(`icon registry ok (${used.size} used, ${registered.size} registered)`);
