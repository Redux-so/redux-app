# Superpowers (Cursor plugin)

[Superpowers](https://github.com/obra/superpowers) adds **process skills** (planning, debugging, verification, review) via the Cursor **Agent** plugin marketplace. It does **not** replace Redux’s `AGENTS.md`, `/docs`, `.cursor/rules`, Linear, or CI.

## Install (required — IDE, not in this repo)

Official method: [Install on Cursor](https://obra-superpowers.mintlify.app/installation/cursor)

1. Open **Cursor Agent** chat (`Cmd+L` / `Ctrl+L`), not Composer-only flows.
2. Run:

   ```text
   /plugin-add superpowers
   ```

   (README also documents `/add-plugin superpowers` if your Cursor build uses that syntax.)

3. Start a **new** Agent session and verify: ask *“Do you have superpowers?”*
4. Update later: `/plugin-update superpowers`

The plugin installs under Cursor’s plugin storage (user/IDE scope). **No Superpowers files are committed to this repository.**

Optional telemetry opt-out (Superpowers docs): set `SUPERPOWERS_DISABLE_TELEMETRY=1` in your environment.

## Intended workflow with Redux

```text
Linear issue
  → read AGENTS.md + relevant /docs
  → Superpowers (brainstorm / plan / debug / verify / review skills as context dictates)
  → implement (engineering-quality + domain .cursor/rules)
  → pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build
  → PR → human review (never auto-merge)
```

## What takes precedence

When Superpowers and Redux instructions overlap, use this order:

1. **Task / Linear issue** and explicit user instructions for the session.
2. **Redux product & stack:** `AGENTS.md`, `/docs`, and applicable `.cursor/rules` (`engineering-quality`, `frontend`, `backend`, `database`, `testing`).
3. **Deterministic checks:** CI and `docs/DEVELOPMENT.md` commands — evidence beats claims.
4. **Superpowers skills:** planning, systematic debugging, verification discipline, review workflows — **complement** the above; do not override Redux architecture, auth, or scoped-diff rules.

### Practical reconciliations

| Topic | Redux rule | Superpowers |
|-------|------------|-------------|
| Tests | No unit/e2e runner yet; `pnpm run test` is a gate only; do not add trivial/fake tests (`engineering-quality`, `testing.mdc`) | TDD skill pushes RED-GREEN-REFACTOR when **adding a real suite** — coordinate with a Linear issue to introduce Vitest/Jest first |
| Scope | One scoped task; no unrelated refactors | Plans may be large — **execute only the slice** matching the current issue |
| Docs | Permanent knowledge in `/docs` | Superpowers may write design/plan markdown — prefer `/docs` or issue-linked plans; avoid duplicating ARCHITECTURE/PRODUCT |
| Merge | Agents must not merge PRs | `finishing-a-development-branch` suggests options — **human** still merges |

## When Superpowers typically activates

Automatic (plugin hooks/skills), for example:

- New feature or ambiguous ask → **brainstorming**, **writing-plans**
- Bug or flaky behavior → **systematic-debugging**, **verification-before-completion**
- Before claiming done → **verification-before-completion**
- Between chunks of work → **requesting-code-review**
- Session misbehavior → **diagnosing-superpowers**

You can also ask explicitly: *“use the brainstorming skill”* or *“follow systematic debugging.”*

## Further reading

- [Superpowers workflow](https://mintlify.wiki/obra/superpowers/concepts/workflow.md)
- [Skills overview](https://mintlify.wiki/obra/superpowers/skills/overview.md)
