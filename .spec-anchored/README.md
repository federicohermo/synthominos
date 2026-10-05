# The kernel of the implementation protocol

The executable contracts that a run of `.agents/protocols/implementation-protocol.md` must pass.
The commands and their options are in the header of `cli.ts`.

These commands prove that an artifact is well formed and consistent. They do not prove that a PR,
a commit or a review exists.

## Where it comes from

This is a TypeScript port of `scripts/spec-anchored`, the Python kernel of
[spec-anchored agentic development](https://github.com/w00fx/spec-anchored-agentic-development), at
commit `4f8a13e`. It is a fork: a change upstream is carried over by hand.

The approval fingerprint is a hash, so the port must produce the same bytes as the original. During
the port a differential test ran both kernels on the same inputs and asked for identical outputs:
the 3,524 calls of the two upstream suites, 509 hand-written cases, and 109,000 cases of a seeded
fuzz. None differed. Where the Python kernel crashes on a malformed input (an unhashable profile
name, an empty git status), the port refuses instead.

## The fixtures are frozen evidence

`__tests__/fixtures/python-kernel.json` keeps 2,575 of those cases, each with the outcome that the
Python kernel gave, on Python 3.13.7: every upstream call, every hand-written case, and the fuzz
cases that add an outcome. The Python kernel is not in this repo, so the file cannot be recorded
again here.

A deliberate change to a rule of the kernel removes the cases it contradicts and adds a test in
`kernel.test.ts`, with the reason in the commit.

## What differs from the original, on purpose

- **`resolve-policy`** is a command the original does not have. There, a caller imports the Python
  module to hash a resolved policy. It adds no rule.
- **The upstream mutation script** (`tests/test-mutants.py`) is not ported: Stryker mutates the
  port.
- **A branch that cannot run is not ported**, and a pattern that another pattern of its table
  already covers is dropped. Each place has a comment. The recorded outcomes do not change.
