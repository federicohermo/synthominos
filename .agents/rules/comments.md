---
paths:
  - "src/**/*.{ts,tsx}"
  - "mcp-server/src/**/*.ts"
---

# Comments

These two trees are linted by `local/comment-shape` and `local/comment-anchor`. The reason for
each check is next to its code, in `eslint-rules/`.

**Delete by default.** A comment survives only if a reader of the code, its names, its types, its
tests and the contract would break the code or misread it without the comment: a trap, a
constraint from outside the file, the reason for a choice that looks wrong. It is one fact, in
three lines at most. What the code does is not a comment. A decision with a cost is a
[decision record](../../docs/architecture/decisions/2026-10-04-a-comment-is-one-fact-in-three-lines.md).

## What each `messageId` catches

| Rule | `messageId` | It fires on |
|---|---|---|
| `comment-shape` | `empty` | A comment with no body |
| `comment-shape` | `code` | Code archived in a comment. Git keeps it, with the date and the reason. |
| `comment-shape` | `label` | A JSX comment of six words or less with no reason word. The markup says it. |
| `comment-shape` | `long` | A comment of more than 3 lines. Blank lines and JSDoc tag lines do not count. |
| `comment-anchor` | `dead` | A citation with the shape of a file that does not resolve against the tree |
| `comment-anchor` | `history` | `previously`, `formerly`, `until recently`, `no longer`, `anymore`, `used to be` |
| `comment-anchor` | `provenance` | A spec of the old regime: `spec 031`, a bare `031` used as a name, `AC6` |

A run of consecutive `//` lines on one column is **one** comment for both rules. Two lines of code
that each end with a `//` are two comments. A directive (`eslint`, `ts-`, `c8`) is not read.

## A citation must resolve

To name a file in a comment is good. What is not good is a name that stops resolving and nobody
notices.

- The citation matches **by basename**, not by full path: `// see circuit/sequence.ts` passes when
  some `sequence.ts` exists. The check catches the deleted or renamed file.
- If the citation cannot resolve (a file outside the repo, a one-time script that is gone),
  describe the role and not the place.

## A constraint of today, not a chronicle

For a `history` finding, ask one question: does this describe a constraint that makes the code be
so TODAY, or does it tell how the code got here?

- **A constraint of today** stays, written without the historical form. Keep the argument and
  remove the time axis.
- **A chronicle** is deleted. Git and the PR keep the history.
- **If a paragraph mixes the two, split it.**

## A rule has a name, not a number

Until 2026-10-04 a spec was a numbered issue, and comments named it: "spec 031", "since the 011",
"AC6". Those numbers resolve to nothing in the tree. Name the rule itself. If a criterion of a
contract fits, cite it with its capability code: `AC-CIR-006`. The one table from an old number to
its issue is in
[the decision](../../docs/architecture/decisions/2026-10-04-contract-per-capability.md).

## What is not checked

A comment at the end of a line is allowed: it anchors the reason to the exact token.
