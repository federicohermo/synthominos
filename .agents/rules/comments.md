---
paths:
  - "src/**/*.{ts,tsx}"
  - "mcp-server/src/**/*.ts"
---

# Comments

These two trees are linted by `local/comment-shape` and `local/comment-anchor`. The reason for
each check is next to its code, in `eslint-rules/`.

**A comment says why, not what**: a decision, a constraint, a bug it avoids. The test is the one of
Ousterhout: the comment is at a DIFFERENT level of abstraction from the code. `// normalized` above
`return c` fails it. A sentence that a reader can infer from the code below is deleted.

## What each `messageId` catches

| Rule | `messageId` | It fires on |
|---|---|---|
| `comment-shape` | `empty` | A comment with no body |
| `comment-shape` | `code` | Code archived in a comment. Git keeps it, with the date and the reason. |
| `comment-shape` | `label` | A JSX comment of six words or less with no reason word. The markup says it. |
| `comment-shape` | `summary` | A docblock whose **first paragraph** takes more than 2 lines |
| `comment-anchor` | `dead` | A citation with the shape of a file that does not resolve against the tree |
| `comment-anchor` | `history` | `previously`, `formerly`, `until recently`, `no longer`, `anymore`, `used to be` |
| `comment-anchor` | `provenance` | A spec of the old regime: `spec 031`, a bare `031` used as a name, `AC6` |

A run of consecutive `//` lines is **one** comment for both rules. A directive (`eslint`, `ts-`,
`c8`) is not read.

## The first paragraph of a docblock: 2 lines at most

The summary is the first paragraph, up to the first blank line. It says what the thing is. What
follows has no limit: it says why it is so.

A reader with a budget of lines, a person in a hurry or an agent, knows from the first line if the
file is the one it needs. A run of `//` is not asked for a summary.

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

## What is NOT checked, and was measured

- **Length and density.** 302 and 49 findings, rejected. No comment of this repo is shortened for
  its length.
- **A comment at the end of a line.** It is allowed: it anchors the explanation to the exact token.
- **A ban on naming a file.** The repo these rules come from has it. Here it is the opposite.

What is checked is accuracy, not length. A long and true comment is cheap. A short and rotten one
is expensive.
