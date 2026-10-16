/**
 * PERF-05 autosave helpers — no network required.
 * Run: pnpm exec tsx scripts/verify-autosave-version.ts
 */
import assert from "node:assert/strict";
import {
  AUTOSAVE_VERSION_LABEL,
  isAutosaveVersionLabel,
  previewImagePublicId,
  workingImagePublicId,
} from "../lib/autosave-version";

assert.equal(isAutosaveVersionLabel(AUTOSAVE_VERSION_LABEL), true);
assert.equal(isAutosaveVersionLabel(null), true);
assert.equal(isAutosaveVersionLabel("Blur"), false);

assert.equal(workingImagePublicId("redux/photo_abc"), "redux/photo_abc-working");
assert.equal(previewImagePublicId("clxyz123"), "preview_clxyz123");

console.log("verify-autosave-version: ok");
