---
schema_version: 1
capability_id: CAP-<COD>
status: draft
owner: <capability owner>
provenance: <where the content comes from>
---

# Capability: <name>

<!-- One durable contract per capability. Sections go from stable to volatile.
     Write only what the code does not say. No file paths and no symbol names: those
     live in the issue and in `docs/`.
     `status`: `draft` while an AC has no test; `ratified` when all have one;
     `superseded` when another spec replaces it. -->

## Purpose

<!-- One or two sentences: what it does for the instrument, and the one thing it must get right. -->

## Capability language

<!-- The canonical term, what it means here, and the synonyms to avoid. -->

| Term | Meaning here | Avoid |
|---|---|---|
| | | |

## Normative behavior

<!-- One heading per rule, with a stable ID. An ID is never renumbered or reused.
     Retiring is deleting: the rule goes with its test, and the number stays a gap.
     EARS: "The system SHALL", "WHEN <trigger>, the system SHALL",
     "IF <condition>, THEN the system SHALL", "WHILE <state>, the system SHALL".
     A calculation states its formula and its reference values. -->

### BR-<COD>-001 — <name>

WHEN <trigger>, the system SHALL <observable behavior>.

## Acceptance criteria

<!-- One heading per criterion, with a stable ID. Binary, with the deciding values.
     An agent closes it, not a person looking or listening. It names the rules it verifies. -->

### AC-<COD>-001 — <name> *(verifies BR-<COD>-001)*

GIVEN <state> WHEN <action> THEN <observable result with values>.

## Non-goals

- This capability does NOT <...>.

## Contracts

<!-- What it receives, what it answers, and what happens at the edge. The failure case sits next to the success case. -->

- **Input:** <...>
- **Output:** <...>
- **Failure:** <...>

## Signals

- <what it emits on success and on rejection>.

## Dependencies

- <capability> (<consumes | feeds>): <what it uses>.

## Open questions

<!-- Unresolved gaps. Never an invented value. -->

- **OQ-<COD>-001 — <question>**
  - Why it is still open: <...>
  - Decides: <...>
  - Blocks: <...>
