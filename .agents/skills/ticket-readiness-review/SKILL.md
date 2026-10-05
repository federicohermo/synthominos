---
name: ticket-readiness-review
description: "Reviews one issue or a set of issues before a worker takes them: checks that each one is a task a fresh worker can do without inventing meaning, scope, evidence or permissions, and that the set is split neither too fine nor too coarse. Use before orchestrate schedules a wave, or before auto-implement goes on an issue. It reports and never edits an issue."
argument-hint: "<issue number> [<issue number> ...]"
---

# ticket-readiness-review

Review the issues as contracts of delivery, and the set as a whole when there is more than one. Do
not review a plan or code. Do not edit an issue: `to-issue` does that, with the person.

An issue here has the shape of `.github/ISSUE_TEMPLATE/task-brief.md`.

Give each finding a class, its evidence and the exact correction:

- `[BLOCKER]`: a worker cannot take the issue as it is.
- `[SHOULD]`: the issue can run, and it will cost a round.
- `[NIT]`.

Four questions decide a finding:

> Can a fresh worker do this task without inventing meaning, scope, dependencies, evidence or
> permissions?

> Is this issue one task that delivers something, or is it a requirement, a component, a test or a
> step that was promoted to an issue?

> Does the set cost the least coordination without joining outcomes that can be accepted apart?

> Does a broad title hide parts that a person can review, accept or revert apart?

## Checks for each issue

1. **The contract and its IDs.** The `Spec:` field names an existing
   `specs/<capability>/<capability>.md`, or says `none`. Each `BR-<COD>-###` and `AC-<COD>-###` the
   issue names exists in that spec. A missing or unknown ID is a `[BLOCKER]`.
2. **The spec is where a worker can read it.** For a worker with no person in the session, `Spec:`
   says `none`, or the delta is in `origin/staging`. `creates`, `modifies` or `deletes` with the
   delta not merged is a `[BLOCKER]` for that mode: the issue is a supervised run.
3. **The problem is a claim.** The Goal states a problem and does not assume a diagnosis nobody
   proved. The worker must be free to find that nothing needs to change. An issue that demands a
   patch whatever the repo does today is a `[BLOCKER]`.
4. **One outcome.** Count the outcomes a person can see apart, not the files, the steps or the
   criteria:
   - none that is useful alone: the issue is too small. Merge it with the one that completes it;
   - one: the right size;
   - several that can be accepted apart: too large. Split at those lines.

   Failure cases, tests and hardening for the same outcome are not more outcomes. Expand a broad
   title ("safe lifecycle", "the foundation of X") into the parts it delivers. If a person could
   accept one part and reject another, split.
5. **A coherent task.** Several criteria, modules and kinds of test belong together when they
   give one outcome. Do not ask for a split only because the diff or the list looks long.
6. **Nothing the outcome needs is left out.** Its tests, its types and its cleanup are inside the
   issue.
7. **File boundaries.** The three rows are filled. Writes names each source file with its test
   file. Does not touch is a closed list. For an autonomous or an unattended worker, Writes holds
   only capability folders, `src/<capability>/` or `mcp-server/src/`: else `[BLOCKER]`.
8. **Evidence.** Each acceptance criterion is binary, holds the values that decide it, and can be
   closed by a test or a command. A criterion that needs a person to look or to listen is a
   `[BLOCKER]` for a worker with no person.
9. **Verification.** The commands exit 0 or not. `pnpm verify` is the first one.
10. **Edges.** The limits are written: zero, one, the maximum, the value just before the cut.
11. **Dependencies.** `Blocked by:` names each open issue that writes a file this one writes, or
    delivers data this one reads. The edges are real and have no cycle. Do not infer a hidden one:
    report it.

## When a split is justified

A split stays only if one of these is true:

- each part is useful and can be accepted alone;
- each part can be reverted alone;
- one part changes a contract and the other does not;
- the parts write disjoint files and are safe to run apart;
- a person must make two separate judgments;
- one part is used by several later issues and has its own verification.

If none is true, the split is a cost of coordination and not a line of delivery.

## Splits that are a `[BLOCKER]`

Unless one of the lines above is shown:

- **One issue for each rule or criterion.**
- **One issue for a layer**: a pure module, a hook or a component apart from the outcome it
  serves.
- **One issue for the tests** of another issue.
- **One issue for a pass**: mutation, cleanup, hardening, review.
- **A base for later**: a helper with no result of its own and one consumer.
- **Serial shards**: issues in a row that open the same context to finish one outcome.
- **Temporary plumbing**: a structure that the next issue replaces.
- **A container issue**: it only groups or orders other issues.
- **Two issues with the same outcome.**
- **An umbrella**: one broad title over parts that can be accepted, reverted or verified apart.
  Split it.

## Checks for the set

1. For each edge `A → B`: if A gives nothing useful without B, and both go on with the same
   outcome, report `[BLOCKER] Merge A and B`.
2. Merge siblings that differ only by criterion, module, kind of test or pass.
3. Expand each broad title and check that it hides no part that stands alone.
4. When two ways to split both hold, take the one with fewer handoffs between issues. Say in one
   line why the other was rejected.
5. Each ID the set names is delivered by one issue, or the set says it is deferred.
6. Two issues of the set that write the same file are joined by `Blocked by:`, or the regions are
   disjoint and the report says so.

Do not judge a set by its count. A large set is right when each split has a real line. A small set
can still be split wrong, or join things that do not belong together.

## Output

For each issue:

```text
#<N>: READY
```

or its findings, each with its class, its evidence and the exact merge, split or rewrite.

Then the table:

```markdown
| Issue | Ready? | Blockers | Outcome | Merge or split |
|---|---|---|---|---|
```

Then one verdict for the set, alone on its line: `READY` or `NOT_READY`.
