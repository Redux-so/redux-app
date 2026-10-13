<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent instructions (Redux)

Persistent project knowledge lives in **`/docs`** and this file. Do not rely on prior chat history.

## Before you work

1. Read the docs that match your task:
   - [docs/PRODUCT.md](docs/PRODUCT.md) — product scope and terminology
   - [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, data flows, APIs
   - [docs/DESIGN.md](docs/DESIGN.md) — UI tokens and layout conventions
   - [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — commands, env, validation
   - [docs/ROADMAP.md](docs/ROADMAP.md) — planned work (informational; GitHub Issues are the task queue)
   - [docs/DECISIONS.md](docs/DECISIONS.md) — recorded decisions
2. Read existing code in the area you will change.
3. Follow current architecture, naming, and patterns; reuse components and utilities.
4. Do not duplicate implementations or introduce unrelated changes.
5. Work on **one task** at a time; keep diffs scoped.

## Code standards

- TypeScript with strict typing; avoid `any` unless unavoidable.
- Prefer Server Components; use `"use client"` only when needed (canvas, hooks, browser APIs).
- Do not change auth, Prisma schema, infrastructure, or dependencies unless the task requires it.

## Validation before finishing

- Run **lint** (`pnpm run lint`).
- Run **production build** (`pnpm run build`) when changes could affect compile or routes.
- There is no dedicated test script in `package.json` today; do not claim tests passed unless you added/ran them.
- For UI changes: run the app, visually verify, and check the browser console for errors.

## Git and PR workflow (Cloud Agents)

- **Never push directly to `main`.**
- Use a **separate branch** per task.
- **Commit** completed work with a clear message.
- Open a **pull request** with summary and testing notes.
- **Do not merge** the PR; stop and wait for human review.

## Editor UI

Before changing editor layout, panels, or tool rail, read [docs/DESIGN.md](docs/DESIGN.md) (editor and library sections).

## Local scratch notes

Ephemeral notes may remain in gitignored **`.context`** / **`.devnotes`** (see headers there). Prefer `/docs` for anything permanent.
