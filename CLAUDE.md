@AGENTS.md

## Claude Code only

- **Skills** are invoked as `/shape`, `/to-issue`, `/to-spec`, `/implement-feature`,
  `/implement-batch`, `/pr-review`, `/pr-review-batch`, `/review-spec-drift`,
  `/ticket-readiness-review`, `/orchestrate`, `/explain`, `/prep` and `/verify-synthominos`. Their source is
  `.agents/skills/`; `.claude/skills/` is a generated copy.
- **The two hardening agents** are `general-code-reviewer` and `mutation-hardener`. Call them
  with `Agent`, only from a run of the implementation protocol. Their source is `agents/`.
- **Hooks** (`.claude/settings.json`): `PreToolUse` runs `.agents/scripts/hook.ts claude` on every
  edit and shell call. `Stop` and `SubagentStop` run `.claude/scripts/lint-al-cerrar.mjs`, which
  lints what changed and blocks the turn on a finding.
- **Subagents with `isolation: "worktree"`** open their worktree under `.claude/worktrees/`, the
  folder the hook allows and the cleaner sweeps.
