# Smell baseline

Twelve smells from Fowler's *Refactoring*, chapter 3, each with its fix. They give a structural
finding a name. Three rules govern their use:

- **The repo wins.** If a rule or a doc of this repo says the contrary of a smell, drop the smell.
- **A smell is a judgment.** It is a named heuristic, never a hard violation. Alone, it does not
  justify a change.
- **Skip what a tool already checks**: formatting, the complexity limit, the import rules. The
  linter owns those.

## The twelve

| Smell | What it is | The fix |
|---|---|---|
| Mysterious name | You must read the body to know what the name means | Rename it to what it does or is |
| Duplicated code | The same logic in several places | Extract and use it again. Across two capabilities, a small duplicate can cost less than a shared module. |
| Long function | It does several jobs | Split it by intent, one level of abstraction in each function |
| Long parameter list | A signature that reads like a form | A parameter object that names the concept |
| Global data | State that anything can reach | Give it an owner. In this repo the state lives in `App.tsx`. |
| Mutable shared data | Mutation with a wide reach | Narrow the reach. Prefer values. |
| Divergent change | One module edited for many reasons | Split it by reason to change |
| Shotgun surgery | One change forces edits in many modules | Bring the job to one place. It can be a sign that a boundary between capabilities is wrong. |
| Feature envy | A function more interested in the data of another module | Move it to where the data lives |
| Data clumps | The same fields that travel together | Make them a type |
| Primitive obsession | A concept of the instrument as a bare number or string | Give it a type: a MIDI note, a cell, a rotation |
| Speculative generality | An abstraction for a future that is not here | Delete it |

## Four more, each one a way to avoid being told the code is wrong

- **The paragraph comment.** A workaround that needs a paragraph to explain why it is right is
  wrong code. Fix the code, not the comment.
- **Guards on what cannot be absent.** Optional chaining or a default on a value the code knows is
  there, so that the code cannot fail. It hides the day the value is missing.
- **Compatibility at any cost.** A re-export or a shim added so that nothing must be renamed or
  moved. The diff avoids the failure and does not finish the change. This repo has no barrels.
- **A type that was dodged.** A loose tuple or a wide record where a real type was one line away.

---

The twelve are from Fowler, *Refactoring*, chapter 3, as Matt Pocock's `code-review` skill selects
them. The four others come from the same bundle this rubric comes from.
