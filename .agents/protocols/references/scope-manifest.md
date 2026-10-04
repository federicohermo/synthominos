# The scope manifest

The output of Phase 3. Three artifacts say what a run may touch, and each has its own authority:

- the **issue** carries the meaning: the rules and criteria, the outcome, the non-goals;
- the **policy** is the floor. A launcher or a person issues it, never the run. It lives in
  `policy/`;
- the **manifest** is the proposal of the run. It must be a subset of the policy.

A manifest alone authorizes nothing. `validate-scope` refuses to judge a diff without a policy.

The manifest carries no fingerprint. Its hash goes into the approval bundle.

## Shape

`.agent-runs/<run-id>/scope-manifest.json`. Every key is required, and an unknown key is refused.

```json
{
  "schema_version": 1,
  "run_id": "RUN-138-20261004T2130Z",
  "capability": "CAP-CIR",
  "adapter": "implement-feature",
  "execution_mode": "supervised",
  "policy_profile": "supervised-local/v1",
  "semantic_scope": {
    "implements": ["BR-CIR-004"],
    "verifies": ["AC-CIR-011", "AC-CIR-012"],
    "non_goals": ["the playhead does not change"]
  },
  "mechanical_scope": {
    "allowed_paths": ["src/circuit/**"],
    "denied_paths": [],
    "permissions": {
      "dependency_change": false,
      "schema_change": false,
      "data_migration": false,
      "external_side_effect": false
    }
  },
  "truth_change": {
    "policy": "none",
    "allowed_spec_paths": []
  }
}
```

| Key | Value |
|---|---|
| `capability` | The `capability_id` of the contract the change answers to |
| `adapter` | `implement-feature`, `implement-orchestrated` or `implement-backlog` |
| `execution_mode` | `supervised`, `assisted`, `autonomous` or `unattended`. It must be the mode of the profile. |
| `policy_profile` | `supervised-local/v1`, `orchestrated-assisted/v1`, `orchestrated-autonomous/v1` or `unattended/v1` |
| `implements`, `verifies` | Stable IDs: `BR-<COD>-###`, `AC-<COD>-###`. Empty lists when the issue says `Spec: none`. |
| `allowed_paths` | From the Writes row of the issue. `src/<capability>/**` for a change inside one capability. |
| `denied_paths` | From the Does not touch row of the issue |
| `permissions` | The four are declared. `dependency_change` covers `package.json` and `pnpm-lock.yaml`. |
| `truth_change.policy` | `none`, or `semantic-amendment` with the exact paths in `allowed_spec_paths` |

`mechanical_scope.allowed_operations` is optional: a list of git status letters, for example
`["M", "A"]`.

There is no field for an expansion. A wider scope changes the manifest, so its hash, so the
approval bundle. It needs a new approval.

## The order of the checks, for each changed path

1. **The path is safe.** A `..`, an absolute path, a backslash or a control character is refused.
2. **The governance floor.** No run edits what judges it: `.spec-anchored/`, `.agents/`,
   `.claude/`, `.codex/`, `agents/`, `policy/`, `.github/`, every `AGENTS.md` and `CLAUDE.md`,
   the constitution, and `.agent-runs/`. A change there is a `harness/` branch that a person
   reviews.
3. **The denies of the policy**, then **the denies of the manifest**. A deny wins over every
   grant.
4. **A permission binds wherever the path is.** A manifest that declares
   `dependency_change: false` and touches `pnpm-lock.yaml` is refused, also inside
   `allowed_paths`.
5. **A contract needs a ceiling and a grant.** A path under `specs/` passes only if the profile
   says `spec_semantics: gated` and the manifest names that exact path in `allowed_spec_paths`.
   A glob in a grant is refused. Only the supervised profile is `gated`.
6. **Other code** must match `allowed_paths`.

## The gates the floor does not name

The floor is the same for every repo. It does not know the configs that judge this one:
`eslint.config.js`, `eslint-rules/`, `vite.config.ts`, `vitest.stryker.config.ts`,
`stryker.config.json`, `tsconfig*.json`, and the gate tests in `__tests__/`, `docs/__tests__/` and
`specs/__tests__/`.

They are protected by absence: a path that `allowed_paths` does not match is refused. One of them
enters `allowed_paths` only when the Writes row of the issue names it, and then a person approved
it. An internal agent never edits one, also when the manifest allows it.

## The diff

A rename and a copy are checked at both ends. Give the validator the NUL form of the diff, with
`--nul`: it is the only form that is not ambiguous when a file name has a space.

```bash
git diff --name-status -z --find-renames --find-copies <base_sha>..HEAD > .agent-runs/<run-id>/changes.z
node .spec-anchored/spec-anchored.ts validate-scope --manifest .agent-runs/<run-id>/scope-manifest.json \
  --changes .agent-runs/<run-id>/changes.z --nul --profile supervised-local/v1
```

The parser fails closed: a status it cannot read, or a record cut short, is a violation. It is
never "no changes".

## Autonomous and unattended runs

A base profile cannot run them. They need a policy instance that carries
`authorized_scope_roots`, and the launcher issues it: `orchestrate` or the `frontier-worker`
routine. The grammar of `allowed_paths` is closed there: an exact path, or a root with two literal
segments and a final `/**`. `src/circuit/**` passes. `src/**` and `**/circuit/**` do not.

Detail: `policy/README.md`.
