# Cloud Agent workflow

**Applies only to Cursor Cloud Agent and Linear-delegated tasks.** Do not treat these steps as default for local manual Cursor sessions.

Read [AGENTS.md](../AGENTS.md) and relevant project docs before implementing.

## Cloud Agent Workflow

For Cursor Cloud Agent or Linear-delegated work only:

- Read **AGENTS.md** and relevant `/docs` for the issue.
- Work on **one scoped task** at a time (the assigned Linear/GitHub issue).
- Use a **separate branch** (never commit directly to `main`).
- Implement the assigned issue autonomously; follow `.cursor/rules` and existing architecture.
- Run relevant checks:
  - `pnpm run lint`
  - `pnpm run typecheck` when types or shared modules change
  - `pnpm run test` (report what ran; no unit/e2e runner yet unless you add one)
  - `pnpm run build` when routes, types, or shared modules change
- Test affected functionality (`pnpm run dev` for UI/runtime changes; browser console and key flows).
- **User-facing changes:** screenshots or short screen recording when possible; attach to the PR.
- **Backend, security, database, or infrastructure:** tests, logs, or request/response evidence — not meaningless demo videos.
- **Commit** completed work with a clear message.
- **Push** the branch.
- **Open a pull request** with the handoff below.
- **Never merge** automatically — stop and wait for human review.

## Verification before PR

Run all checks relevant to the task (not unrelated green checks). Fix issues found before opening the PR.

- Exercise the main happy path and at least one relevant edge or error case when behavior changed.
- Check browser console and useful network requests (API, auth, credits) for UI/API work.

## PR handoff template

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

## Linear / task description hint

When creating or editing Linear issues for Cloud Agent, include:

- Link or name of the issue scope
- Pointers to relevant docs (PRODUCT, ARCHITECTURE, DESIGN as needed)
- Explicit note: *Follow [docs/CLOUD_AGENT_WORKFLOW.md](CLOUD_AGENT_WORKFLOW.md) and [AGENTS.md](../AGENTS.md).*
