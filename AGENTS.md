<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent instructions (Redux)

Persistent project knowledge lives in **`/docs`** and this file. Do not rely on prior chat history.

## Before you work

1. Read the docs that match your task:
   - [docs/PRODUCT.md](docs/PRODUCT.md) — scope and terminology
   - [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, data flows, APIs
   - [docs/DESIGN.md](docs/DESIGN.md) — UI tokens and layout
   - [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — commands, env, validation
   - [docs/ROADMAP.md](docs/ROADMAP.md) — planned work (GitHub Issues are the task queue)
   - [docs/DECISIONS.md](docs/DECISIONS.md) — recorded decisions
2. Follow [`.cursor/rules/engineering-quality.mdc`](.cursor/rules/engineering-quality.mdc) for how to implement and review work.
3. Inspect existing code in the area you will change; reuse helpers and patterns.
4. Work on **one scoped task** at a time — simplest correct solution, no unrelated refactoring.

Domain rules (when they apply): `.cursor/rules/frontend.mdc`, `backend.mdc`, `database.mdc`, `testing.mdc`, `superpowers-integration.mdc`.

**Superpowers (optional Cursor plugin):** install in Agent via `/plugin-add superpowers` (IDE-only). Use it for planning/debugging/verification discipline; Redux docs and rules above still govern stack, scope, and merge policy. See [docs/SUPERPOWERS.md](docs/SUPERPOWERS.md).

## Code standards

- TypeScript with strict typing; avoid `any` unless unavoidable.
- Prefer Server Components; use `"use client"` only when needed (canvas, hooks, browser APIs).
- Do not change auth, Prisma schema, infrastructure, or dependencies unless the task requires it.

## Validation

Command details and CI: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), [`.cursor/rules/testing.mdc`](.cursor/rules/testing.mdc). Before opening a PR, follow **Verification and Handoff** below and the self-review checklist in `engineering-quality.mdc`.

## Verification and Handoff

Before opening a pull request:

- Run all **relevant** automated checks for the task (not unrelated green checks).
- `pnpm run lint`
- `pnpm run typecheck` when types or shared modules change
- `pnpm run test` (no unit/e2e runner yet — report what actually ran; do not claim a suite passed unless you added and executed one)
- `pnpm run build` when routes, types, or shared modules change
- `pnpm run dev` when the task affects runtime behavior; test the affected flow in the browser
- Exercise the main happy path and at least one relevant edge or error case
- Check the browser console for new errors or warnings
- Check relevant network requests when useful (API, auth, credits)
- Fix issues found during verification before opening the PR
- Do not claim a check passed unless it actually ran successfully

**User-facing or behavior-changing work:** record a short screen recording of the completed flow; keep it focused; attach to the PR when supported; add screenshots when they clarify the result.

**Backend, security, database, infrastructure, or non-visual work:** do not record a meaningless demo video; provide the most relevant proof instead (tests, logs, request/response evidence, or before/after measurements).

### PR description template

Use this structure in the PR body (honest results only):

**What changed**

- 2–4 concise bullets

**Why it works**

- 1–3 concise bullets on the approach

**Verification**

- lint result
- typecheck result
- test result
- build result
- browser/manual flows tested
- edge/error cases tested

**Evidence**

- video/screenshots for user-facing work
- tests/logs/measurements for backend or security work

**Issues encountered**

- problems, compromises, warnings, or remaining limitations — or: *None observed*

**Human review**

- Never merge the PR automatically
- Stop once the PR and verification evidence are ready; wait for human review

## Git and PR workflow

- **Never push directly to `main`.** Use a separate branch per task.
- Commit completed work with a clear message.
- Complete self-review on the full diff (`engineering-quality.mdc`); fix legitimate issues before opening the PR.
- Open the PR using the **Verification and Handoff** template above.

## Editor UI

Before changing editor layout, panels, or tool rail, read [docs/DESIGN.md](docs/DESIGN.md).

## Local scratch notes

Ephemeral notes may live in gitignored **`.context`** / **`.devnotes`**. Prefer `/docs` for anything permanent.
