# Findings: find without noise

The method of every PR review: the axes, the confidence filter and the triage. `pr-review` reads
it in its step 5. `pr-review-batch` passes the path to each of its agents. Both skills carry this
file byte for byte; the canonical copy lives in `pr-review`.

No finding survives the run. The five discharges are in [`no-debt.md`](no-debt.md). This file
says only how they land on a diff.

## The axes

`pr-diff.ts` prints which axes open, measured on the diff. Review only the axes it opens.

| Axis | What to look for in this repo |
|---|---|
| **Correctness** (always) | Bugs that the real flow reaches: place, rotate, reflect, mute, delete a piece, with the transport running and stopped. |
| **Layers** (always) | A rule in the wrong layer. See below. |
| **Conventions** (always) | Only what no tool checks. See below. |
| **Prose** (docs and comments) | Text that is no longer true. The most productive axis here. See below. |
| **Contracts** (a spec in the diff) | An AC that cannot be seen to fail, a spec that names a file or a symbol, a fixed value copied instead of cited. `.agents/rules/specs.md` has the rules. |
| **Error handling** | An empty `catch`, an error swallowed with no `console.warn` and no feedback, a fallback that hides the cause. |
| **Signatures and types** | A type that accepts an invalid value. A closed set with no union derived from a const object. |
| **Coverage** (always, on code) | What 100 % does not say. See below. |

### Layers: the axis no tool sees

No tool checks where a rule lives. A rule of the instrument written in a component or in
`App.tsx` passes every node of `pnpm verify` and has no unit test of its own.

The test: can the rule run without React, Web Audio or the DOM? If yes and it is not in a pure
`.ts` module of its capability, it is a finding. The fix moves the rule to that module. It does
not add a browser test for the screen.

### Conventions: where the line is

Do not report what `pnpm verify` already rejects. The PR cannot be green with it inside.

| A tool checks it: do not report | No tool checks it: it is yours |
|---|---|
| The dependency direction: `mcp-server/` imports `src/`, never the reverse | The comment says why, not what |
| The explicit `.ts`/`.tsx` extension, no barrels, no aliases | Comment and commit language, as `docs/guides/conventions.md` sets |
| `enum`, `any`, `@ts-ignore`, `eslint-disable`, the `!` outside its overrides | A deletion sits in its own commit |
| Global state (store packages and `createContext`) | A new value does not duplicate one that exists under another name |
| A `*.constants.ts`, `*.types.ts`, `constants/` or `types/` under `src/` | A signature change reached the spec, the issue and the docs |
| `.only`, `.skip` and a test with no assertion | Each AC is falsifiable, and its test exercises it |
| Comment shape and citations (`local/comment-*`), Markdown lint | The test sits in the right Vitest project for what it needs |
| Coverage at 100 in the four metrics | |
| An AC cited in a test title that does not exist; an uncited AC in a `ratified` spec | |
| Writing `src/` from a branch without a product prefix (the hook) | |

The specs gate checks that a test title cites the AC. It does not check that the test exercises
the AC. That check is yours.

### Prose: text that is no longer true

Measured in this repo on 2026-08-21, over five PRs: 17 of 21 findings were text that was no
longer true, not broken code. In five of them, the right number was already in the PR's own
spec.

Run two probes, in this order:

1. **Cross each numeric claim the diff adds against the measured tree.** `pr-diff.ts` lists the
   claims. Count again with a narrow pathspec: a count over `src` that also takes
   `mcp-server/src/` is the classic wrong number.
2. **Find the twin of the paragraph the PR did update.** A change here is stated in several
   places: `AGENTS.md`, `docs/`, `.agents/rules/`, the skills. Grep the key of the change (the
   file name, the old figure) across them.

A comment or doc that contradicts the code next to it is 🔴, not 🟡. `CLAUDE.md` loads in every
session.

### Coverage: what 100 % does not say

`suite` fails under 100 % in any of the four metrics, so a line gap is already red. The four at
100 are a floor: in this repo 4 of 18 mutants survived with all four at 100.

The question is: would the test fail if the line were wrong? A test that runs a branch and does
not assert its effect is coverage without verification. That is a finding.

## Ask the domain before you grep it

The `pentomino-domain` MCP server runs the real pure functions.

| Review need | Tool |
|---|---|
| The reach of a symbol the diff touches: who uses it | `find_symbol` (its `usedBy` crosses into `mcp-server/`) |
| A signature, without opening the file | `find_symbol` |
| After a fix to geometry, `SHAPES` or the musical model | `check_invariants` |
| Before you derive a rotation, scale or retrograde by hand | `describe_piece` |
| Before you walk the lookahead by hand | `simulate_board` |

The reach matters most. The bug often lives in the consumer, not in the touched file.
`mcp-server/` imports many symbols from `src/`: a signature change has an edge that no import
in `src/` shows.

The server reads the main checkout, not your worktree. Inside a worktree, confirm with `rg` on
the worktree.

## Confidence filter

**Narrow where you search, not what you fix.** Search the diff and what the diff touches. Fix
what the search finds, preexisting or not. The triage table decides where it lands.

Score each finding from 0 to 100. Drop everything under 80.

- **0**: a false positive that fails a light check.
- **25**: maybe real, not verified. A style point that no rule names does not exist.
- **50**: verified, but a nitpick or rare in practice.
- **75**: verified, it happens, and the PR's approach does not cover it. Or a repo rule names it.
- **100**: confirmed with direct evidence.

### Typical false positives: they stay out of the report

- Anything in the left column of the conventions table.
- A performance budget or wall-clock test that failed under contention. The protocol of the
  invoking skill tells it apart. It is not a finding of the PR, and it is not green either.
- Nitpicks a senior engineer would not raise.
- A behavior change that is the intent of the PR. If the spec asks for it, it is not a bug.
- A request for a browser test where `node` covers it, or the reverse. The suffix
  `*.browser.test.tsx` decides, and only for what jsdom cannot do.

### Verify the premise before you report

If a finding depends on the environment (a config, a flag, a version, a platform default),
check the premise. A five-second grep removes half of the 🔴 candidates.

## Triage: where each fix lands

Two measurements give one rule. In one run, 3 of 8 findings were declared not applied and only
one had a reason. And defect detection in review falls from 87 % under 100 lines to 28 % over
1000. So: **fix everything, and do not land everything here.**

| Class | Fix it | Lands in |
|---|---|---|
| 🔴 Blocking | always | this PR |
| 🟡 small, inside the scope | yes | this PR |
| 🟡 on a line your diff adds or rewrites | yes | this PR (see below) |
| 🟡 preexisting, in a file the PR touches | yes | this PR if the fix is small; else its own PR |
| 🟡 in a file the PR does not touch | yes | its own PR, opened in this run |
| 🟡 whose fix conflicts with an AC | yes, by correcting the AC, once the person approves its old and new text (`.agents/rules/truth-layer.md`) | the spec, in this PR |
| 🟡 whose fix is a redesign bigger than the PR | yes, by correcting the scope, once the person approves it | the spec and the issue |
| A decision that belongs to the user | ask now, and wait | the answer, written down |
| A fix that a tool denied | see "Blocked" | the run fails |

"It is preexisting", "it is from another spec", "I did not measure it" and "I tried and could
not" are not reasons. The first two decide where the fix lands, never whether it happens.

### Blocked makes the run fail

A denied fix is not a triage decision.

1. **Retry by another path.** If the hook denied it, check your branch name first: only
   `feature/`, `bugfix/`, `refactor/` and `improvement/` write `src/` and `mcp-server/src/`.
2. If it stays blocked, the run does not close green. The report starts with
   `BLOCKED: <what> — <who blocked it>` and the exact fix on one line that can be copied.
3. Do not cover it with an issue. That turns a red into a pending item.

In a batch, the parent runs in the main checkout with other permissions and applies it. It can
only do that if the report marks it as blocked.

### "Preexisting" does not cover a line your diff rewrote

**If the line shows as `+` in your `pr.diff`, it is yours.** A false number that your diff
retyped is a claim this PR makes. A reflowed paragraph counts as retyped.

### Its own PR, for a finding outside the scope

This discharge replaces the issue. The work happens now, and the reviewed PR does not grow.

```bash
git fetch origin
git checkout --no-track -b <prefix>/<kebab-of-the-finding> origin/staging
# the fix, pnpm verify green, commit
git push -u origin HEAD
gh pr create --base staging
```

- Branch from `staging`, not from the reviewed branch. From there it would carry that PR's
  commits.
- The prefix states the kind of change, or the hook denies the first write to `src/`. A fix that
  changes what the instrument does is a `feature/` and starts from its spec delta (`to-spec`).
- It goes to the report with its PR number.

Do not open an issue "to keep a note". An issue here is the plan of one delivery. The only
exception is a decision the user already took to defer something: the issue records that
decision and quotes it.

**Carry each fix to everything that describes it.** A signature change touches the code, the
spec, every doc that shows the old snippet, and the issue. A code fix that leaves the PR's own
docs lying is half a fix.
