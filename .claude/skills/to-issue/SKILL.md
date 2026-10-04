---
name: to-issue
description: "Writes and publishes one or more task-brief issues for the instrument, and decides if each change touches a spec. Use when a request, a bug or an idea will be done, before the branch opens. Use also with \"open an issue\", \"write the ticket\", or the output of shape in issue mode. Writes no code and no spec."
argument-hint: "[request | bug | idea]"
---

# to-issue: the plan of one change

An issue and a spec are different things. The issue is a small plan: it solves one problem, has
its own boundaries and criteria, and is discarded when its PR closes. The spec is the durable
contract of a capability. An issue touches a spec only when it changes what the instrument does.
Many issues touch none.

This skill leaves no debt. The doctrine is in `no-debt.md`, in this skill's folder.

`gh` is not on PATH on this machine. Call it as `"/c/Program Files/GitHub CLI/gh.exe"`. This
skill writes it as `gh`.

## When an issue is worth it

Almost always, never by force. If the user wants a fix now and no issue, do it without one: a
`bugfix/` or `improvement/` branch does not need one. Offer the issue once, then continue.

## Step 1: Decide the type

| Type | What it is | Label | Touches a spec? |
|---|---|---|---|
| `feature` | behavior that is new, changed or removed | `enhancement` | always: creates, modifies or deletes |
| `bugfix` | the instrument does not do what it must already do | `bug` | almost never |
| `refactor` | the same behavior in another shape | `refactor` | never |
| `improvement` | everything else that changes no rule: UI, visuals, sound design, performance, docs, accessibility | `improvement`, plus `documentation` when it applies | never |

`gh label list` shows the labels. `gh issue create` fails on a missing label: run
`gh label create <name>` first. Management labels (`duplicate`, `invalid`, `wontfix`, `question`)
state the issue's status, not its type.

**The spec test is one question: does it change what the instrument does?** A new rule, a changed
fixed value, a removed behavior. If yes, the type is `feature`.

A `bugfix` touches a spec in one case only: the bug was a rule nobody wrote. Then the rule is
written with the fix.

**A hotfix is not an issue type.** It is a commit straight on `staging` whose message starts with
`hotfix:`. It has no issue, no branch and no PR.

If the type is unclear, ask. It decides the branch and the rest of the flow.

The step is done when the type, the label and the spec answer are fixed.

## Step 2: Measure before you write

Take the boundaries and the criteria from today's tree, not from memory.

1. Ask `find_symbol` (MCP `pentomino-domain`) for each symbol the issue touches. Its `usedBy`
   includes `mcp-server/`. Every user goes to Writes, Read only or Does not touch.
2. Search the prose too: `rg -n "<what the issue touches>" src/ mcp-server/ specs/ docs/ .agents/`.
3. Search for duplicates: `gh issue list --state open --limit 100`. If an equal issue exists, do
   not open another.

The step is done when each file the change reaches has a row in the boundaries.

## Step 3: Write the draft

Start the draft from the template, never from memory:

```bash
node .claude/skills/to-issue/scripts/task-brief.ts new <file in the scratchpad>
```

It copies `.github/ISSUE_TEMPLATE/task-brief.md` without its frontmatter. Fill the placeholders.
Add no section and remove none. Keep the HTML comments: GitHub hides them.

The rules that break most often are in [writing-rules.md](writing-rules.md). Read it before you
fill the boundaries and the criteria. The core:

- **One issue, one problem.** Complete the sentence `after this issue, <something observable>`. If
  it does not complete, the cut is wrong. If it completes with two unrelated things, write two
  issues.
- **The criteria belong to the issue**: binary, with the deciding values. If the issue touches a
  spec, name the new or changed `AC-<COD>-###` by what they must say. `to-spec` writes them.
- **Does not touch is a closed list.** A file that another in-flight issue writes goes there, or
  this issue is `Blocked by: #N` of that one.
- **The first verification command is always `pnpm verify`.** The verdict comes from the exit
  code, never from a grep.
- **A fixed value is not invented.** It comes from the code or the domain MCP. If nothing fixes
  it, the criterion names it as an open question, and `to-spec` records it.

The step is done when every placeholder except `<issue>` is filled.

## Step 4: Show and publish

1. Check the draft against the template:

   ```bash
   node .claude/skills/to-issue/scripts/task-brief.ts check <file>
   ```

   Exit 1 names what is wrong: a missing or extra section, an unfilled placeholder, a field copied
   from the template. Fix it and run it again. With exit 1, do not show and do not publish. The
   only placeholder it accepts is `<issue>` in the branch: the number does not exist yet.
2. Show the whole issue, as it will be published, not a summary. Wait for confirmation.
3. Publish, then write the number into the branch:

   ```bash
   gh issue create --title "<what changes>" --label <label> --body-file <file>
   node .claude/skills/to-issue/scripts/task-brief.ts number <file> <N>
   gh issue edit <N> --body-file <file>
   ```

`number` replaces `<issue>` and checks again with no exception. Do not commit the body: the issue
is the source.

The step is done when `number` exits 0 and the published body matches the file.

## Several at once

Before you show anything:

1. **Cross the Writes rows of all drafts.** If two share a file, choose which goes first and
   publish it first. The other says `Blocked by: #N` with the published number. Until then, name
   the first one by its title: `<issue>` does not work there, because `number` replaces it with
   the draft's own number. Small changes to different zones of the same file merge cleanly and
   need no `Blocked by`.
2. **Two issues that block each other are one change cut wrong.** Cut it again before you publish.
3. **Cross what each one assumes.** Data that an issue reads is delivered by itself or by an
   earlier one. A rule that one issue writes is not rewritten by the next. Cross them also with
   the open issues that touch the same spec: they are not in the batch, but they start from its
   rules.
4. **Show all drafts in full, each with `check` at 0, and wait for one yes on the batch.** If the
   user approves part of it, publish only that part. The other drafts stay in the scratchpad.

## When you finish

Report the issue number, the type, and the next step:

- **Spec: creates, modifies or deletes**: `to-spec`, with the issue as input, on branch
  `<type>/<N>-<kebab>`. The type is `feature/`, or `bugfix/` if the bug was an unwritten rule.
- **Spec: none**: `implement-feature`, on branch `<type>/<N>-<kebab>`. An issue that does not touch
  `src/` or `mcp-server/src/` is named by what it touches: `harness/<N>-<kebab>` or
  `docs/<N>-<kebab>`.
