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

Domain rules (when they apply): `.cursor/rules/frontend.mdc`, `backend.mdc`, `database.mdc`, `testing.mdc`.

## Code standards

- TypeScript with strict typing; avoid `any` unless unavoidable.
- Prefer Server Components; use `"use client"` only when needed (canvas, hooks, browser APIs).
- Do not change auth, Prisma schema, infrastructure, or dependencies unless the task requires it.

## Validation

See [`.cursor/rules/testing.mdc`](.cursor/rules/testing.mdc). At minimum: `pnpm run lint`; `pnpm run build` when routes, types, or shared modules change. No default test script — do not claim tests passed without running them.

## Git and PR workflow

- **Never push directly to `main`.** Use a separate branch per task.
- Commit completed work with a clear message.
- Complete the **self-review** checklist in `engineering-quality.mdc` on your full diff; fix issues before opening the PR.
- Open a PR with summary and honest testing notes.
- **Do not merge** the PR; stop and wait for human review.

## Editor UI

Before changing editor layout, panels, or tool rail, read [docs/DESIGN.md](docs/DESIGN.md).

## Local scratch notes

Ephemeral notes may live in gitignored **`.context`** / **`.devnotes`**. Prefer `/docs` for anything permanent.
