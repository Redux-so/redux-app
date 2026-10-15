# Cloud Agent / Linear workflow

Use this when a task runs on **Cursor Cloud Agent** or is **delegated from Linear** (autonomous delivery with a PR handoff).

Also use [DEVELOPMENT.md](DEVELOPMENT.md) for commands and env; follow [`.cursor/rules/engineering-quality.mdc`](../.cursor/rules/engineering-quality.mdc).

## Scope

- Read [AGENTS.md](../AGENTS.md), the assigned issue, and relevant `/docs` before coding.
- Implement **one scoped task** from the issue; no unrelated refactors.
- Do not modify auth, Prisma schema, infrastructure, or dependencies unless the task requires it.

## Git and PR (required for this workflow)

- **Never push directly to `main`.**
- Work on a **separate branch** for the task.
- **Commit** completed work with a clear message.
- **Push** the branch and **open a pull request**.
- **Never merge** automatically — stop for human review.

## Implementation and review

Follow engineering-quality rules: inspect callers, reuse helpers, strong typing, no duplicate systems, review the **complete diff** for complexity and security before handoff.

## Verification

Run all **relevant** automated checks (not unrelated green checks):

| Check | When |
|-------|------|
| `pnpm run lint` | Substantive code changes |
| `pnpm run typecheck` | Types or shared modules change |
| `pnpm run test` | Always in CI sense — report what actually ran (no unit/e2e runner yet unless you added one) |
| `pnpm run build` | Routes, types, or shared modules change |
| `pnpm run dev` + browser | Runtime / UI behavior changes |

## Local browser URL

For Cloud Agent browser verification, always use:

`http://localhost:3000`

Do not use `http://127.0.0.1:3000`. Next.js 16 may block dev HMR requests from `127.0.0.1`, which can prevent React hydration and leave Clerk stuck at `loaded: false`.

Also:

- Exercise the main happy path and at least one relevant edge or error case.
- Browser console: no new errors/warnings on affected flows.
- API work: authenticated session when possible; 401/404/402 as relevant.

Fix issues found before opening the PR. Do not claim a check passed without evidence.

## Evidence

| Work type | Provide |
|-----------|---------|
| User-facing / behavior-changing | Short screen recording when possible; screenshots when they clarify |
| Backend, security, DB, infra | Tests, logs, request/response evidence, or measurements — not a meaningless UI video |

Cloud runs may lack full env (Clerk, Stripe, etc.); say clearly what could not be verified.

## PR description

Use this structure (honest results only):

**What changed** — 2–4 bullets  

**Why it works** — 1–3 bullets  

**Verification** — lint, typecheck, test, build, manual flows, edge cases (command + result)  

**Evidence** — video/screenshots or tests/logs  

**Issues encountered** — problems, compromises, or *None observed*  

**Human review** — PR is ready; do not merge until a human approves.

## Linear / task description hint

When creating or editing Linear issues for Cloud Agent, include:

- Link or name of the issue scope
- Pointers to relevant docs (PRODUCT, ARCHITECTURE, DESIGN as needed)
- Explicit note: *Follow [docs/CLOUD_AGENT_WORKFLOW.md](CLOUD_AGENT_WORKFLOW.md) and [AGENTS.md](../AGENTS.md).*
