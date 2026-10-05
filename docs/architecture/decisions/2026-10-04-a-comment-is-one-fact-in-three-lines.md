# A comment is one fact, in three lines at most

**Decided 2026-10-04**, by the owner of the repo. It reverses the decision that came with the two
local lint rules: "no comment of this repo is shortened for its length".

Under the old decision the checks measured only accuracy: a citation resolves, a comment tells no
history. Nothing limited how much a comment said. The result, measured on the tree: 12,081 comment
lines in 30,468 lines of code files, 40 %. The module of the circuit was 359 comment lines in 490.
After the cut, 781 lines were left, 4 %.
The comments restated the code, argued for each choice, and told measurements. A reader could not
find the three lines that were a trap.

**Decision: a comment survives only if a reader of the code, its tests and its contract would
break the code without it. It takes three lines at most.** `local/comment-shape` enforces the
limit in `src/` and `mcp-server/src/`. The rule is in
[the comment rules](../../../.agents/rules/comments.md).

Where the rest goes:

- What the code does: nowhere. The code says it.
- A decision with a cost: a record in this folder.
- A trap that shows as a symptom: [troubleshooting](../../guides/troubleshooting.md).
- A measurement: a test that fails when it stops to hold, or nowhere.

The cost:

- **A reason that needs a paragraph has no place next to the code.** It goes in a record, one
  search away, or it is lost.
- **The old decision had evidence.** Studies of code models say that comments help a model to
  refine code, and that a false comment costs more than a missing one. This decision accepts the
  first risk to remove the second: a short comment is easier to keep true.
- **A linter counts lines, not value.** Three lines that restate the code pass. That stays a
  judgment of the writer and of the review.
- **The limit covers two trees.** The configs, the harness scripts and the tests of the gates
  follow the rule with no gate.
