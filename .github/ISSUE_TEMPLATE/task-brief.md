---
name: Task brief
about: The plan of one change. It closes with its PR and is discarded.
labels: ""
---

<!-- An issue is a small, disposable plan. It solves one problem, with its own boundaries and
     criteria. A spec is a different thing: the durable contract of a capability.
     An issue changes a spec only if it changes what the instrument does. -->

# <What changes, not which area it touches>

## Context

- **Goal:** one sentence. The problem this issue solves.
- **Type:** `feature` | `bugfix` | `refactor` | `improvement`
- **Spec:** none | creates | modifies | deletes, at `specs/<capability>/<capability>.md`
- **Branch:** `<type>/<issue>-<kebab>`, or `harness/` or `docs/` if it does not touch `src/` or `mcp-server/src/`
- **Blocked by:** none | #N

<!-- `feature` is the only type that always touches a spec. A `bugfix` touches one only if the
     bug was a rule that nobody wrote. The label comes from the type: `enhancement`, `bug`,
     `refactor` or `improvement`, plus `documentation` when it applies.
     `Blocked by` names each open issue that must merge first: it writes a file this issue
     writes, or it delivers data this issue reads. -->

## Acceptance criteria

<!-- The criteria of this issue: binary, with the deciding values. They die with the issue.
     If the issue touches a spec, the `AC-<COD>-###` it adds or changes also go here: those
     last, and a test cites each one in its title. -->

- [ ] <...>

## Contract

<!-- Only if new signatures, types or data appear. Each one with its layer (`domain/`, `audio/`,
     `components/`, `mcp-server/`) and its return type. The failure case sits next to the
     success case. -->

## File boundaries

| Category | Paths |
|---|---|
| **Writes** | <...> |
| **Read only** | <...> |
| **Does not touch** | <...> |

<!-- The third row is a closed, negative list. A file that another in-flight issue writes goes
     there, or this issue is `Blocked by` that one. Each source file in Writes names its test
     file too: coverage is 100. -->

## Verification

<!-- Commands that exit 0. The verdict comes from the exit code, never from a grep of the
     output. -->

1. `pnpm verify`
2. <...>

## Edges

<!-- Any implementation covers the happy path. The limits go here: zero, one, the maximum,
     the value just before the cut, the value that arrives twice. -->

- <...>
