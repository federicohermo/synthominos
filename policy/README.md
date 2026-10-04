# Policies

The floor of what a run may do. A worker never writes a policy: a launcher or a person issues one
and gives it to the run. The scope manifest of a run is a proposal, and it must be a subset of the
policy. `validate-scope` refuses to judge a diff without one.

The kernel is in `.spec-anchored/`. The manifest is in
[scope-manifest.md](../.agents/protocols/references/scope-manifest.md).

## The four profiles

| Profile | Mode | Adapter | A contract in `specs/` | Paths |
|---|---|---|---|---|
| `supervised-local/v1` | supervised | `implement-feature` | gated: a person approves the amendment | free patterns |
| `orchestrated-assisted/v1` | assisted | `implement-orchestrated` | proposal only | closed grammar |
| `orchestrated-autonomous/v1` | autonomous | `implement-orchestrated` | proposal only | closed grammar, inside issued roots |
| `unattended/v1` | unattended | `implement-backlog` | proposal only | closed grammar, inside issued roots |

In every profile the governance floor is `deny`: no run edits the harness that judges it.

`profiles/` holds each profile as a file. The kernel holds them too, in `PROFILES`, and that copy
is the authority. `.spec-anchored/__tests__/policy.test.ts` checks that the two are equal.

| File | `policy_sha256` |
|---|---|
| `profiles/supervised-local-v1.json` | `d2ba638e085bfc2d27360793bc656af60e6b710b2a1db164a60e254fe1d0dae8` |
| `profiles/orchestrated-assisted-v1.json` | `70059f8efa4ae73007a8355abb2e9423ee9c322fc418be3c783a955fbc181531` |
| `profiles/orchestrated-autonomous-v1.json` | `f1c24c419ff26021c19eb307253fb9e1d2e41ac667784756c459e1b869e08f14` |
| `profiles/unattended-v1.json` | `2b2bbd94b3681f290d1ff2b1c3cb8ce7b827dbad2f56e39b30d3f2b21c1f5676` |

The same test checks this table. Do not write a hash by hand:

```bash
node .spec-anchored/spec-anchored.ts resolve-policy supervised-local/v1
```

## What each mode may do

- **Permissions.** A supervised run may ask for the four: dependency, schema, data migration and
  external side effect. In the other three modes the ceiling of each is `false`. A manifest may go
  below a ceiling, never above it.
- **The grammar of `allowed_paths`.** A supervised run writes free patterns, because a person
  approves the manifest. The other modes write an exact path, or a root with at least two literal
  segments and a final `/**`. So `src/circuit/**` passes, and `src/**`, `src/**/*` and
  `**/circuit/**` do not.
- **Contracts.** Only the supervised profile is `gated`: the manifest may grant an exact path
  under `specs/` for an amendment that a person approved. In the other modes a run that needs a
  contract change stops with `SPEC_CHANGE_REQUIRED`.

## An instance: what a launcher issues

A base profile cannot run an autonomous or an unattended worker. Those modes need an instance: the
base profile plus an overlay that names the roots the run may touch.

```json
{
  "base_profile": "orchestrated-autonomous/v1",
  "overlay": {
    "authorized_scope_roots": ["src/circuit"],
    "max_scope_roots": 1,
    "max_recursive_scope_patterns": 1,
    "max_exact_paths": 10,
    "allowed_operations": ["M", "A"]
  }
}
```

Without `authorized_scope_roots` the validator refuses to judge. A limit on the form of a path is
not enough: the worker would still choose its own area of the repo.

| Key of the overlay | What it does |
|---|---|
| `authorized_scope_roots` | The folders the run may touch. Each `allowed_paths` entry must be inside one. |
| `max_scope_roots` | How many roots a launcher may issue. At most 4. |
| `max_recursive_scope_patterns` | How many `/**` patterns a manifest may hold. At most 4. |
| `max_exact_paths` | How many exact paths a manifest may hold. At most 20. |
| `denied_path_patterns` | Refused for every changed path, whatever the manifest says |
| `allowed_operations` | The git status letters the run may produce |
| `forbidden_path_patterns` | More spellings that `allowed_paths` may not use |
| `protected_path_classes` | More paths that need a permission, for example `{"dependency_change": ["pnpm-workspace.yaml"]}` |
| `spec_semantics` | A lower ceiling for contracts: `proposal-only` or `human-only` |

**An overlay only narrows.** It may add a restriction, lower a limit and lower a ceiling. It may
not drop a restriction, raise a ceiling, or touch the mode, the adapters, the governance or the
profile id. An object that is not a known profile, and is not a base plus an overlay, is refused:
a policy is issued, never self-declared.

**In this repo a root is a capability folder**: `src/<capability>`, or `mcp-server/src`. The
launcher takes it from the Writes row of the issue. An issue that writes a file outside those
folders is not for an autonomous worker.

`instances/example-autonomous-circuit.json` is an example. A launcher writes the instance of a run
in `.agent-runs/<run-id>/policy.json`, not here.

## Paths in a policy

A value with no `*` and no `?` is a literal path. It may hold any character that git tracks:
`src/app/[id]/page.tsx` is a file name. A value with `*`, `?`, `**` or `**/` is a pattern. In a
pattern, the characters `[ ] { } ! ^ @ +` are refused: the matcher reads them as plain text, so a
pattern that uses them as operators would restrict less than its author meant.

Every path in a policy is checked. A padded path, an absolute path, a `..` and a double slash are
refused.

## Where things live

| Thing | Place |
|---|---|
| The profiles and the example instance | `policy/` |
| The kernel | `.spec-anchored/` |
| The protocol, the rules and the skills | `.agents/` |
| The contracts of the two internal agents | `agents/` |
| The state of a run | `.agent-runs/<run-id>/`, ignored by git |

A run edits none of the first four: the governance floor refuses the diff. A change there is a
`harness/` branch.
