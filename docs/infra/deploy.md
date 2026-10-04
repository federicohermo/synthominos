# Deploy

The platform is **Vercel**. This file says where the configuration lives, what runs in the build and
what does not, and which of the two branches is published.

## Where the configuration lives

`vercel.json` is at the **root of the repository**, next to the `package.json` of the app. It is the
only deploy configuration file. There is no nested one.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "pnpm install",
  "buildCommand": "pnpm run build",
  "outputDirectory": "dist"
}
```

| Field | Value | Why |
|---|---|---|
| `$schema` | `https://openapi.vercel.sh/vercel.json` | It gives completion and validation in the editor. The platform does not read it |
| `installCommand` | `pnpm install` | Explicit, so that it does not depend on lockfile detection staying the same |
| `buildCommand` | `pnpm run build` | It expands to `tsc -b && vite build`. It runs at the root of the repo |
| `outputDirectory` | `dist` | The app lives at the root, so there is no folder prefix |

### Why the reason for each field is here and not next to the decision

This is a **declared deviation** from the repo convention. The convention puts the reason in a
comment next to what it decides. `vercel.json` is JSON, and **JSON has no comments**: the file has no
place to write them. The table above is the counterpart, and this section says so. Without it, the
table reads as an oversight. The next person would "fix" it with reasons inside a file that does not
accept them, and `JSON.parse` would break.

## Which package manager the platform picks, and why

`installCommand` sets `pnpm install`, so detection does not decide. The reason the repo uses pnpm still
applies: **Vercel picks the package manager from the lockfile** when nothing tells it. With a
`package-lock.json` in the repo it picks npm. So `pnpm-lock.yaml` **must be versioned**, and no
`package-lock.json` can sit next to it. With both, the deploy and the developer machine resolve
different versions, silently.

**The pnpm version does not come from `packageManager`.** Vercel derives it from the `lockfileVersion`
of `pnpm-lock.yaml`. Today that is `9.0`, which its table of package managers serves with "pnpm 9 or
10". Vercel reads `packageManager` only if the project has the environment variable
`ENABLE_EXPERIMENTAL_COREPACK=1`. The project does not have it, on purpose (see "Environment
variables"). So the deploy is **not pinned** to the exact version the repo declares (`pnpm@10.33.0`).
Corepack in local and `pnpm/action-setup` in the workflow read that field and honor it.

## What runs in the build and what does not

**The typecheck runs**, because it is inside `build`: `pnpm run build` is `tsc -b && vite build`. The
`tsc -b` fails the deploy if the project does not typecheck.

**Lint and tests do not run.** `pnpm verify` runs them in GitHub Actions, on each PR. In practice, a
green deploy says that the project compiles. It does **not** say that the suite passes. The two gates
are different, and neither replaces the other.

## What `vercel.json` does not declare, on purpose

### No `ignoreCommand`

It is the only native Vercel hook that can condition a deploy, and **it is inverted**: exit 0
**skips** the build and exit 1 continues it. It also skips instead of failing. So `pnpm verify` there
causes two problems at once. The verification runs twice, and a red result shows as "deploy skipped",
which the dashboard shows as green. The PR gate decides what enters the repo, not the deploy.

### No `rewrites`

An SPA fallback makes `GET /some/route` return `index.html` instead of a 404. Here there is no route
to request: the app has no routing (no `react-router`, no `pushState`, no read of `window.location`),
and the only URL is `/`.

**When routing exists, the rule goes here as `rewrites`**, not as a loose file in `public/`. This is
written down because the rule once lived in `public/_redirects`, in the syntax of the previous
platform, and Vercel does not read that file.

### No Node version

`engines.node` in `package.json` **overrides** the project setting in Vercel. Today that field declares
a range across two majors (`^20.19.0 || >=22.12.0`), because it is the **floor** Vite 7 requires, not
a pin. Where the deploy pin lives, and what checks it against the two declared floors, is an open
decision in **#138**. The field is absent here on purpose, not by omission.

## Environment variables

**None.** The app runs entirely on the client: no backend, no API keys, no endpoints. The
*Environment Variables* section of the project must stay empty. The only variable Vercel documents
that changes something here is `ENABLE_EXPERIMENTAL_COREPACK=1`, which makes the deploy honor
`packageManager`. An environment variable to pin the package manager is a separate decision, open in
**#155**.

If one is ever needed, Vite requires the `VITE_` prefix for the client to see it
(`import.meta.env.VITE_FOO`). The Create React App prefix `REACT_APP_` does **not** work, and it fails
silently.

## Which branch is published

**`main`**, set explicitly in the Vercel project and not inherited from the default. The two-branch
model (the roles, the ruleset, and why the default is `staging`) lives whole in
[`branches.md`](./branches.md). It is the only copy a gate checks
([`__tests__/branches-in-sync.test.ts`](../../__tests__/branches-in-sync.test.ts)). A repeat here is a
second copy that can diverge with nothing turning red.

## Connected repository

The project must be connected to the repository **that receives the push**. A push to a fork does not
fire the deploy of a project connected to the original repo: webhooks are per repository.

## Check the build locally

This reproduces exactly what the platform does:

```bash
rm -rf dist
pnpm build
find dist -type f
```

`dist/` must contain `index.html` and `assets/` with **one** JS chunk and one CSS chunk.

There were once two JS chunks: the second one was the 340 kB of Tone.js, split off by a dynamic
import. With the in-house engine that chunk does not exist. **If a second JS chunk appears, something
brought back a dynamic import.** It is not an error, but find out what it is.

Then:

```bash
pnpm preview
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/   # 200
```
