# The scope manifest

The output of Phase 3: `.agent-runs/<run-id>/scope-manifest.json`.

Three artifacts say what a run may touch, and each has its own authority:

- the **issue** carries the meaning: the rules and criteria, the outcome, the non-goals;
- the **policy** is the floor. A launcher or a person issues it, never the run;
- the **manifest** is the proposal of the run. It must be a subset of the policy.

The kernel defines the shape and checks it: `validateManifest` and `validateScope` in
`.spec-anchored/kernel.ts`. A valid manifest is the `MANIFEST` of
`.spec-anchored/__tests__/cli.test.ts`. A wrong one is refused with the name of each field.

## How the issue becomes a manifest

| Field | Where it comes from |
|---|---|
| `capability` | The `capability_id` of the contract the change answers to |
| `semantic_scope.implements`, `verifies` | The `BR-` and `AC-` the issue names. Empty when the issue says `Spec: none`. |
| `semantic_scope.non_goals` | What the issue says it does not do |
| `mechanical_scope.allowed_paths` | The Writes row of the issue. Inside one capability it is `src/<capability>/**`. |
| `mechanical_scope.denied_paths` | The Does not touch row of the issue |
| `truth_change` | A grant only for an amendment the person approved, and for the `status: ratified` line when the plan cites the last criterion of a contract |

A wider scope is a new manifest, so a new hash, so a new approval. The manifest has no field for
an expansion.

## The gates the floor does not name

The governance floor of the kernel is the same for every repo. It does not know the configs that
judge this one: `eslint.config.js`, `eslint-rules/`, `vite.config.ts`, `vitest.stryker.config.ts`,
`stryker.config.json`, `tsconfig*.json`, and the gate tests in `__tests__/`, `docs/__tests__/` and
`specs/__tests__/`.

They are protected by absence: a path that `allowed_paths` does not match is refused. One of them
enters `allowed_paths` only when the Writes row of the issue names it, and then a person approved
it. An internal agent never edits one, also when the manifest allows it.

## The diff

Give the validator the NUL form of the diff. It is the only form that is not ambiguous when a file
name has a space.

```bash
git diff --name-status -z --find-renames --find-copies <base_sha>..HEAD > .agent-runs/<run-id>/changes.z
node .spec-anchored/spec-anchored.ts validate-scope --manifest .agent-runs/<run-id>/scope-manifest.json \
  --changes .agent-runs/<run-id>/changes.z --nul --profile <profile id | instance file>
```
