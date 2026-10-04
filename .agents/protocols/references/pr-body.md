# The body of the PR

Every adapter opens its PR against `staging` with these sections, in this order.

```markdown
Closes #<N>

## Plan

<The plan that ran, in a few lines.>

APPROVAL-FINGERPRINT: `<fingerprint>`
Approved by <who>, at <the comment or the session>.

## What changed

<The behavior, as the person who plays the instrument meets it.>

## Evidence

<One line for each criterion the change delivers.>
AC-<COD>-### → <test title, in its file> → <result>

`pnpm verify` exits 0 on `<head sha>`.

## Internal hardening

- General code reviewer: `<input sha>` → `<output sha>`, <status>. Changed: <paths>. Owner: <accepted | rejected, and why>.
- Mutation hardener: `<input sha>` → `<output sha>`, <status>. Target: <files>. Coverage <line>/<branch>. Mutants: <generated> generated, <killed> killed, <survivors> actionable survivors. Owner: <accepted | rejected, and why>.
- Not eligible for mutation: <files, each with its reason>, or "none".

## Scope

`validate-scope` accepts the diff `<base sha>..<head sha>`: <n> paths.
<Each non-goal the change respects. Each contract, gate and threshold it did not touch.>

## Open for the person

<Each mutant disposition that needs a decision. Each rule proposed for the harness. "none" if empty.>
```

Rules of the body:

- State only what a command showed. Give the command.
- The internal hardening is not an independent approval. Do not call the change `reviewed` or
  `approved`.
- Never write `merged` or `landed`. A person merges.
- A screenshot the issue asks for goes in the PR by its raw URL:
  `node .agents/scripts/screenshots-to-branch.ts <N> <folder>` prints it.
