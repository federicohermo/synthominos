# The comment checks measure accuracy, not length

**Recorded 2026-10-04.** The decision is older: it came with the two local lint rules.

The comment convention was prose, and nothing checked it. The two lint rules that check it now,
`local/comment-shape` and `local/comment-anchor`, come from another repo of the same owner. Run as
they were on this tree, they gave 1,007 findings in 92 of the 93 files. A gate that turns the whole
tree red is not fixed. It is switched off.

**Decision: a check stays only if it finds a comment that is false, or that will become false.**
No check limits how much a comment says, and no comment of this repo is shortened for its length.
The rules are in [`eslint-rules/`](../../../eslint-rules/comment-shape.mjs), and what each one
catches is in [the comment rules](../../../.agents/rules/comments.md).

What was measured on this tree, and rejected:

| Check of the source rules | Findings | Why it is out |
|---|---|---|
| Length of a comment | 302 | It is a budget of prose |
| Density of comments | 49 | It is a budget of prose |
| A comment at the end of a code line | 49 | It is allowed: it anchors the explanation to the exact token. The ESLint core rule `no-inline-comments` does the same ban, and it is frozen with no replacement |
| The anchoring check | 25 | All 25 were false positives, on JSX of `Board.tsx` that is right |
| A ban on citing an issue | 10 | Here a pointer to an issue is the convention |
| A ban on naming a file | 315 citations | 309 of them resolved, so 98 % of the findings were noise. The check was turned around: a citation must resolve |

After the cut, 186 findings were left. Each one was a citation that did not resolve, a first
paragraph that ran into the body, or a chronicle of how the code got there. One deleted file,
`log.md`, was cited seven times, three of them in production code.

Why accuracy and not length. The main reader of these comments is a model that reads the code to
change it:

- **To remove comments is expensive.** To switch off the comment concepts in the internal
  representations of a model degrades code refinement by up to 90 % and completion by up to 15 %
  ([arXiv:2512.16790](https://arxiv.org/html/2512.16790v1)). Code refinement is the work done here.
- **A comment that lies costs as much as obfuscated code.** CodeCrash measured 17 models on 1,279
  tasks. Misleading natural language, comments included, degrades code reasoning by 23.2 % on
  average, and by 13.8 % with step-by-step reasoning
  ([arXiv:2504.14119](https://arxiv.org/html/2504.14119)).
- **A stale comment predicts a bug.** A change that leaves a comment inconsistent is about 1.5
  times more likely to end in a bug-introducing commit. Wen et al. (ICPC 2019) measured it on 1.3
  billion AST-level changes in 1,500 systems. This is why the checks are a gate and not a
  guideline.
- **A deleted or renamed file is the common way a citation dies**, measured on more than 3,000
  projects ([arXiv:2212.01479](https://arxiv.org/abs/2212.01479)).
- **True text that does not apply misleads too.** A study of context rot on 18 models names it
  distractor interference. A chronicle of how the code got here is that kind of text, so the
  `history` check finds it.

The cost:

- **No tool keeps a comment short.** A file of this repo can be more comment than code, and a
  person in a hurry pays for it. The one limit is on the first paragraph of a docblock: 2 lines.
- **No tool checks the rule that matters most.** A linter cannot tell if a comment says why, at
  another level than the code. That stays a judgment of the writer and of the review.
- **The `history` check finds a candidate and does not decide.** To split a constraint of today
  from a chronicle is a judgment too.
- **A citation matches by basename.** A wrong path to a file name that exists passes.
