# Policies

The floor of what a run may do. A worker never writes a policy: a launcher or a person issues one
and gives it to the run.

The profiles are defined in the kernel, `.spec-anchored/kernel.ts`, and that copy is the
authority. `profiles/` holds them as files because the bundle this comes from ships them so, and a
gate keeps the files equal to the kernel. What an overlay may narrow is in the same module. To see
a resolved policy and its hash:

```bash
node .spec-anchored/spec-anchored.ts resolve-policy <profile id | file>
```

## What only this repo decides

- **A root is a capability folder**: `src/<capability>`, or `mcp-server/src`. A launcher takes it
  from the Writes row of the issue. An issue that writes a file outside those folders is not for an
  autonomous or an unattended worker.
- **A launcher writes the instance of a run in its run folder**, `.agent-runs/<run-id>/`, not here.
  `instances/` holds one example.
- **A supervised run uses the base profile**, with no instance.
