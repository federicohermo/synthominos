# The kernel of the implementation protocol

The executable contracts that a run of the implementation protocol must pass. The protocol is
prose; this folder is the part of it that a machine checks. It is fail-closed: what it does not
fully understand, it refuses.

```bash
node .spec-anchored/spec-anchored.ts canonicalize <file> [--kind json|text] [--emit hash|bytes] [--allow-hard-breaks]
node .spec-anchored/spec-anchored.ts build-approval <bundle.json> --policy <profile|file>
node .spec-anchored/spec-anchored.ts verify-approval <record.json> --bundle <bundle.json> --policy <profile|file>
node .spec-anchored/spec-anchored.ts validate-scope --manifest <file> --changes <file> [--nul] --profile <profile|file>
node .spec-anchored/spec-anchored.ts validate-result <result.json>
```

Exit 0 is acceptance, 1 is a refusal, 2 is a wrong call. A file named `-` is the standard input.
Node ≥ 22.18 runs the `.ts` files with no build.

| Command | What it proves |
|---|---|
| `canonicalize` | The canonical bytes of a JSON object or a text body, or their SHA-256 |
| `build-approval` | The canonical approval bundle of a run and its APPROVAL-FINGERPRINT |
| `verify-approval` | That an approval record binds to that bundle, that run and that repository |
| `validate-scope` | That every path of a `git diff --name-status` is inside the approved scope manifest |
| `validate-result` | That a run's `result.json` meets the contract of its terminal |

These commands prove that an artifact is well formed and consistent. They do not prove that a PR,
a commit or a review exists.

## What a run can never edit

`validate-scope` refuses a change to the files that judge the run, whatever its manifest allows:
this folder, `.agents/`, `.claude/`, `.codex/`, `agents/`, `policy/`, `.github/`, every `AGENTS.md`
and `CLAUDE.md`, and the constitution. A change there goes through a `harness/` branch that a
person reviews, not through a run.

## The files

| File | What it holds |
|---|---|
| `spec-anchored.ts` | The entrypoint. No branches |
| `cli.ts` | The commands, with the files and the streams injected |
| `kernel.ts` | The contracts: policies, the path matcher, the approval, the scope, the result |
| `pyjson.ts` | JSON values with the semantics of Python: `1` is not `1.0`, integers of any size, `repr` |
| `__tests__/` | The unit tests, and the fixtures recorded from the Python kernel |

## Where it comes from

This is a TypeScript port of `scripts/spec-anchored`, the Python kernel of
[spec-anchored agentic development](https://github.com/w00fx/spec-anchored-agentic-development), at
commit `4f8a13e`. It is a fork: a change upstream is carried over by hand.

The approval fingerprint is a hash, so the port must produce the same bytes as the original. During
the port a differential test ran both kernels on the same inputs and asked for identical outputs:
the 3,524 calls of the two upstream suites, 509 hand-written cases, and 109,000 cases of a seeded
fuzz. None differed. Where the Python kernel crashes on a malformed input (an unhashable profile
name, an empty git status), the port refuses instead.

`__tests__/fixtures/python-kernel.json` keeps 2,575 of those cases, each with the outcome the
Python kernel gave (Python 3.13.7): every upstream call, every hand-written case, and the fuzz cases
that add an outcome. `python-kernel.test.ts` asserts that the port still gives them, to the byte.
The fixtures are frozen evidence. A deliberate change to a rule of the kernel removes the cases it
contradicts and adds a test in `kernel.test.ts`, with the reason in the commit.

The upstream mutation script (`tests/test-mutants.py`) is not ported: Stryker mutates the port.
