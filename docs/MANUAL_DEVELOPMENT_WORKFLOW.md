# Manual development workflow (interactive Cursor)

Use this when **you** are driving Cursor in the IDE — ad-hoc fixes, exploration, pairing, or any session that is **not** a Cursor Cloud Agent / Linear-delegated run.

Universal engineering rules still apply: [AGENTS.md](../AGENTS.md), [`.cursor/rules/engineering-quality.mdc`](../.cursor/rules/engineering-quality.mdc), and [DEVELOPMENT.md](DEVELOPMENT.md).

## What the agent should do

- Make **only** the changes you asked for (scoped task).
- Inspect existing code; reuse patterns; smallest correct diff.
- Run **relevant** validation (`lint`, `typecheck`, `build`, manual QA as appropriate).
- Self-review the full diff before saying the work is done.
- Summarize what changed and what was verified in chat.

## Git — under your control

Unless **you explicitly ask**, the agent must **not**:

- create or switch branches
- commit
- push
- open a pull request

You decide when and how to branch, commit, and open PRs.

## Handoff

Report honestly in the conversation: what changed, checks run (with results), and any known limits. No PR template required unless you ask for a PR.
