# Manual development workflow

**Applies when you use Cursor interactively on your machine** (normal Agent chat, local edits). This is the **default** unless the task is explicitly Cursor Cloud Agent or Linear-delegated.

Engineering rules still apply: [AGENTS.md](../AGENTS.md), [docs/DEVELOPMENT.md](DEVELOPMENT.md), and `.cursor/rules/`.

## What the agent should do

- Make only the **requested** code changes.
- Inspect existing code; reuse patterns; smallest correct diff.
- Run **relevant** checks before you consider the task done (`pnpm run lint`, `typecheck`, `build`, etc. — see DEVELOPMENT.md).
- Review the full diff for unnecessary complexity (see `engineering-quality.mdc`).
- Summarize what changed and what was verified in chat.

## Git — under your control

Unless **you explicitly ask**, the agent must **not**:

- create or switch branches
- commit
- push
- open a pull request

**Leave Git workflow under your control.** If you want a branch, commit message, or PR text, ask the agent to **propose** them; the agent should not run git write operations unless you request it.

## Handoff

Report honestly in the conversation: what changed, checks run (with results), and any known limits. No PR template required unless you ask for a PR.

## Cloud Agent contrast

Autonomous branch → commit → push → PR is documented only in [CLOUD_AGENT_WORKFLOW.md](CLOUD_AGENT_WORKFLOW.md).
