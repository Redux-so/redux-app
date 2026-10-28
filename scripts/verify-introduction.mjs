import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/shared/Introduction.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function mount({ metadata = {}, loaded = true, update = async () => {} } = {}) {
  const calls = [];
  const user = { unsafeMetadata: metadata, update: async (payload) => { calls.push(payload); await update(payload); } };
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: (id) => {
    if (id === "@clerk/nextjs") return { useUser: () => ({ isLoaded: loaded, user: loaded ? user : null }) };
    if (id === "@radix-ui/react-dialog") return Object.fromEntries(
      ["Root", "Trigger", "Portal", "Overlay", "Content", "Title", "Description"].map((name) => [name, `Dialog.${name}`]),
    );
    if (id === "framer-motion") return { motion: { div: "motion.div" }, useReducedMotion: () => false };
    if (id.startsWith("@/components/")) return { Icon: "Icon", LoadingSpinner: "Spinner" };
    if (id === "@/lib/popup-motion") return { usePopupMotion: () => ({}) };
    if (id.startsWith("@/lib/")) return {};
    return require(id);
  } });
  const slots = [];
  let cursor = 0;
  const dispatcher = { useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
  } };
  return { calls, user, render(automatic = true) {
    cursor = 0;
    const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const previous = internals.H;
    internals.H = dispatcher;
    try { return mod.exports.default({ automatic }); } finally { internals.H = previous; }
  } };
}

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}
const button = (tree, label) => find(tree, (node) => node.type === "button" && node.props["aria-label"] === label);
const title = (tree) => find(tree, (node) => node.type === "Dialog.Title").props.children;

test("introduction waits for account loading and skips previously dismissed accounts", () => {
  assert.equal(mount({ loaded: false }).render(), null);
  assert.equal(mount({ metadata: { reduxIntroductionDismissed: true } }).render().props.open, false);
  assert.equal(mount().render().props.open, true);
});

test("progress follows the current step in both directions and visuals skip the welcome", () => {
  const app = mount();
  const progress = () => find(app.render(), (node) => node.props?.["aria-label"] === "Introduction progress").props.children;
  const visited = () => progress().filter((node) => node.props["aria-label"].endsWith(", viewed")).length;
  assert.equal(progress().length, 4);
  assert.equal(visited(), 1);
  assert.equal(find(app.render(), (node) => typeof node.props?.step === "number"), undefined);
  button(app.render(), "Next step").props.onClick();
  assert.equal(visited(), 2);
  assert.ok(find(app.render(), (node) => node.props?.step === 1));
  button(app.render(), "Previous step").props.onClick();
  assert.equal(visited(), 1);
  assert.equal(progress()[0].props["aria-current"], "step");
  for (let step = 0; step < 3; step++) button(app.render(), "Next step").props.onClick();
  assert.equal(visited(), 4);
  assert.ok(find(app.render(), (node) => node.props?.step === 3));
});

test("four steps navigate in order, support going back, and finish permanently", async () => {
  const app = mount({ metadata: { existingPreference: "keep" } });
  assert.equal(button(app.render(), "Previous step").props.disabled, true);
  const headings = [];
  for (let step = 0; step < 3; step++) {
    headings.push(title(app.render()));
    button(app.render(), "Next step").props.onClick();
  }
  headings.push(title(app.render()));
  assert.deepEqual(headings, ["Welcome to Redux", "Start with a photo", "Edit your way", "Save and export"]);
  assert.equal(button(app.render(), "Next step"), undefined);
  button(app.render(), "Previous step").props.onClick();
  assert.equal(title(app.render()), "Edit your way");
  button(app.render(), "Next step").props.onClick();
  const finish = find(app.render(), (node) => node.type === "button" && node.props.children === "Finish");
  await finish.props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].unsafeMetadata.existingPreference, "keep");
  assert.equal(app.calls[0].unsafeMetadata.reduxIntroductionDismissed, true);
  assert.equal(app.render().props.open, false);
  assert.equal(mount({ metadata: app.calls[0].unsafeMetadata }).render().props.open, false);
});

test("X and Escape use the same persistent dismissal", async () => {
  for (const close of [
    (tree) => button(tree, "Close introduction").props.onClick(),
    (tree) => tree.props.onOpenChange(false),
  ]) {
    const app = mount();
    close(app.render());
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(app.calls.length, 1);
    assert.equal(app.render().props.open, false);
  }
});

test("failed persistence stays visible with an accessible error and allows retry", async () => {
  let fail = true;
  const app = mount({ update: async () => { if (fail) throw new Error("offline"); } });
  button(app.render(), "Close introduction").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.render().props.open, true);
  assert.ok(find(app.render(), (node) => node.props?.role === "alert"));
  assert.equal(button(app.render(), "Close introduction").props.disabled, false);
  fail = false;
  button(app.render(), "Close introduction").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.render().props.open, false);
});

test("settings replays from step one without clearing completion", async () => {
  const app = mount({ metadata: { reduxIntroductionDismissed: true } });
  const replay = () => find(app.render(false), (node) => node.type === "button" && node.props.children === "Introduction");
  replay().props.onClick();
  assert.equal(app.render(false).props.open, true);
  button(app.render(false), "Next step").props.onClick();
  button(app.render(false), "Close introduction").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  replay().props.onClick();
  assert.equal(title(app.render(false)), "Welcome to Redux");
  assert.equal(app.calls.length, 0);
});
