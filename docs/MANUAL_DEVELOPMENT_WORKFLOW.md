# Manual development workflow

**Applies when you use Cursor interactively on your machine** (normal Agent chat, local edits). This is the **default** unless the task is explicitly Cursor Cloud Agent or Linear-delegated.

Engineering rules still apply: [AGENTS.md](../AGENTS.md), [docs/DEVELOPMENT.md](DEVELOPMENT.md), and `.cursor/rules/`.

## Manual Cursor Workflow

When using Cursor locally and manually:

- Make only the **requested** code changes.
- Run **relevant** checks before you consider the task done (`pnpm run lint`, `typecheck`, `build`, etc. — see DEVELOPMENT.md).
- Review the full diff for unnecessary complexity (see `engineering-quality.mdc`).
- **Do not** create or switch branches unless you explicitly ask.
- **Do not** commit unless you explicitly ask.
- **Do not** push unless you explicitly ask.
- **Do not** open a PR unless you explicitly ask.
- **Leave Git workflow under your control.**

If you want a branch, commit message, or PR text, ask the agent to **propose** them; the agent should not run git write operations unless you request it.

## Cloud Agent contrast

Autonomous branch → commit → push → PR is documented only in [CLOUD_AGENT_WORKFLOW.md](CLOUD_AGENT_WORKFLOW.md).
