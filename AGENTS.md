<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent instructions (Redux)

Persistent project knowledge lives in **`/docs`** and this file. Do not rely on prior chat history.

These rules apply to **all** work (manual Cursor sessions and Cloud Agent). **Git/PR behavior** depends on how the task is run — see [docs/MANUAL_DEVELOPMENT_WORKFLOW.md](docs/MANUAL_DEVELOPMENT_WORKFLOW.md) and [docs/CLOUD_AGENT_WORKFLOW.md](docs/CLOUD_AGENT_WORKFLOW.md).

## Before you work

1. Read the docs that match your task:
   - [docs/PRODUCT.md](docs/PRODUCT.md) — scope and terminology
   - [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, data flows, APIs
   - [docs/DESIGN.md](docs/DESIGN.md) — UI tokens and layout
   - [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — commands, env, validation
   - [docs/ROADMAP.md](docs/ROADMAP.md) — planned work (GitHub Issues are the task queue)
   - [docs/DECISIONS.md](docs/DECISIONS.md) — recorded decisions
2. Follow [`.cursor/rules/engineering-quality.mdc`](.cursor/rules/engineering-quality.mdc).
3. Inspect existing code in the area you will change; reuse helpers, components, and patterns.
4. Work on **one scoped task** at a time — smallest correct solution, no unrelated refactoring.

Domain rules (when they apply): `.cursor/rules/frontend.mdc`, `backend.mdc`, `database.mdc`, `testing.mdc`, `superpowers-integration.mdc`, `git-workflow.mdc`.

**Superpowers (optional Cursor plugin):** install in Agent via `/plugin-add superpowers` (IDE-only). See [docs/SUPERPOWERS.md](docs/SUPERPOWERS.md).

## Code standards

- TypeScript with strict typing; avoid `any` unless unavoidable.
- Prefer Server Components; use `"use client"` only when needed (canvas, hooks, browser APIs).
- Do not change auth, Prisma schema, infrastructure, or dependencies unless the task requires it.

## Validation and self-review

- Run **relevant** checks for what you changed (see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) and [`.cursor/rules/testing.mdc`](.cursor/rules/testing.mdc)).
- Do not claim a check passed unless it actually ran successfully.
- Before finishing, review the full diff per `engineering-quality.mdc` (complexity, duplication, security, scope).

## Editor UI

Before changing editor layout, panels, or tool rail, read [docs/DESIGN.md](docs/DESIGN.md).

## Local scratch notes

Ephemeral notes may live in gitignored **`.context`** / **`.devnotes`**. Prefer `/docs` for anything permanent.
