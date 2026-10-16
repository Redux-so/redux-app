#!/usr/bin/env node
/**
 * Sample Next dev server RSS while hitting routes. Used for PERF-10 comparisons.
 * Usage: node scripts/measure-dev-memory.mjs [--base-url URL] [--label NAME]
 *
 * Optional: DEV_MEMORY_ROUTES env (comma-separated path suffixes)
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const args = process.argv.slice(2);
const labelIdx = args.indexOf("--label");
const baseIdx = args.indexOf("--base-url");
const label = labelIdx >= 0 ? args[labelIdx + 1] : "run";
const baseUrl = baseIdx >= 0 ? args[baseIdx + 1] : "http://127.0.0.1:3000";

async function sampleRssKb() {
  const out = await new Promise((resolve, reject) => {
    spawn("ps", ["-o", "rss=", "-C", "node"], { stdio: ["ignore", "pipe", "pipe"] })
      .stdout.on("data", (d) => resolve(d.toString()))
      .on("error", reject);
  });
  const values = out
    .trim()
    .split("\n")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  const total = values.reduce((a, b) => a + b, 0);
  return { totalKb: total, processes: values.length };
}

async function fetchRoutes() {
  const routes = (process.env.DEV_MEMORY_ROUTES ?? "/")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  for (const route of routes) {
    try {
      await fetch(`${baseUrl}${route}`, { redirect: "follow" });
    } catch {
      // server may still be compiling
    }
    await sleep(2000);
  }
}

async function main() {
  const samples = [];
  for (let i = 0; i < 8; i++) {
    samples.push(await sampleRssKb());
    await sleep(3000);
  }
  await fetchRoutes();
  for (let i = 0; i < 5; i++) {
    samples.push(await sampleRssKb());
    await sleep(3000);
  }
  const peak = Math.max(...samples.map((s) => s.totalKb));
  const last = samples.at(-1);
  console.log(
    JSON.stringify({
      label,
      baseUrl,
      peakRssMb: Math.round(peak / 1024),
      lastRssMb: Math.round(last.totalKb / 1024),
      nodeProcesses: last.processes,
      samples: samples.map((s) => Math.round(s.totalKb / 1024)),
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
