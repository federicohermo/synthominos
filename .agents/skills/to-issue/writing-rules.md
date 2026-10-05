# Writing rules for a task brief

Each rule here came from an issue that broke without it. Apply each one before you run `check`.

## Boundaries

- **Follow every reader of a value that moves**, in `src/`, in the tests and in `mcp-server/`.
  `find_symbol` gives the importers; `rg` gives the tests that build the state the value feeds.
  The contract follows all readers, not the first one.
- **`mcp-server/` imports symbols of `src/`.** A changed signature there can break a tool.
  `pnpm verify` typechecks across the package boundary, so the break is loud. Put the tool in
  Writes anyway, or the estimate comes out short.
- **Coverage is 100 in all four metrics.** Each source file in Writes names its test file. Tests
  split by suffix: `*.browser.test.tsx` runs in the `browser` project, `*.budget.test.ts` in
  `budget`, the rest in `node`.
- **A new member of a const-object union puts in Writes everything indexed by it.** Search the
  union across `src/`, `mcp-server/`, the tests and `DESIGN.md`. A `Record` over the union fails
  the typecheck; a lookup table or a test fixture does not.
- **A new field in a shared type puts in Writes every literal that builds it.** An optional field
  passes the typecheck and leaves those literals silent.
- **Writes also names the new files and folders the contract implies.** Otherwise the implementer
  reports them as a deviation in the PR.
- **Read a Read only file before you put it there.** If the change needs it to change, it goes to
  Writes.
- **If the issue renames something, run the `rg` over comments too.** A comment that cites a
  renamed path fails `local/comment-anchor` in a file the implementer cannot touch.
- **If the issue changes a rule, search for the old rule in words**, not only its symbols. A
  comment can explain the rule in other words, and a test can build the state the rule reads.
- **A change to a canonical file under `.agents/` puts its generated copy under `.claude/` in
  Writes.**

## Criteria

- **A command that proves an absence runs today, and returns everything the criterion removes.**
  If it leaves cases out, widen it. If it cannot, the criterion names the test that covers them.
- **If the issue deletes a name, Verification carries the `rg` that proves it**:
  `rg -i <name> src mcp-server specs docs .agents` returns zero. Run it again after merging
  another branch: a lane in flight can add a reader.
- **Reproduce a measured symptom under the criterion's own conditions before you ask for its
  red.** If the criterion excludes a case, the measurement excludes it too.
- **A performance criterion says where it is measured, and the change shows there.** The time
  budgets run in the `budget` project, alone at the end of `verify`. Coverage instrumentation and
  a busy machine break them.
- **A numeric target is measured with the issue's proposal before you publish.** A criterion that
  groups files is run against the tree.
- **A criterion that depends on the musical model is measured on the model**, with
  `describe_piece`, `simulate_board` or `check_invariants`. If you cannot measure it, write it as
  a question.
- **An example table closes with itself.** Recompute each row from the rule before you write it.
  Derive the endpoints; do not copy them.
- **A list that splits a set sums to the total.** Count each group against the whole set.
- **A perception criterion names its measure**: a DOM value, an `OfflineAudioContext` render, a
  value a test reads. An agent closes it, not a person looking or listening.

## Consistency

- **A criterion does not contradict a `ratified` criterion of another capability.** The `rg` of
  the boundaries searches the neighbor specs too.
- **An edge does not contradict one either, and this holds against a `draft` too.** An edge that
  describes a gesture the instrument does not have gets implemented by inventing the missing rule.
- **The contract and the edges of one issue ask for the same result.** Compare the final states
  they describe before you publish.
- **A criterion that keeps a statement is read against what the issue removes.** It must not name
  the value the same issue takes away.
- **If the issue removes a rule, find which other rule relied on it.** Ask what stops being true
  without it.
- **If the issue inverts a rule, test the inversion before you publish.** Apply a one-line patch in
  the scratchpad and run the suites that exercise the rule. The tests that go red go to Writes. A
  test that asserts the rule without naming it is invisible to `rg`.
- **If the issue changes a generated file, its generator is in the repo or in Writes.** A file
  without its generator is only edited by hand.
