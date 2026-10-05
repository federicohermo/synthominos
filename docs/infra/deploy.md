# Deploy

The hosting is **Vercel**. The published app is <https://synthominos.vercel.app>. Vercel builds
every push of `federicohermo/synthominos`: a push to `main` goes to production, and a push to any
other branch gets a preview URL.

This document holds two things that the repo cannot hold: the settings of the Vercel project, and
the reasons of `vercel.json`, because JSON takes no comment.

## What lives in the Vercel project

| Setting | Value | Why |
|---|---|---|
| Production branch | `main`, set by hand | With no value, Vercel publishes the default branch, and the default is `staging`. See [branches](./branches.md). |
| Environment variables | none | The app runs in the browser alone: no backend, no key, no endpoint. |
| `ENABLE_EXPERIMENTAL_COREPACK` | not set | With it, Vercel reads `packageManager`. Issue [#155](https://github.com/federicohermo/synthominos/issues/155) decides it. |
| Node version | not pinned | `engines.node` of `package.json` overrides the setting, and it is a range. Issue [#138](https://github.com/federicohermo/synthominos/issues/138) decides the pin. |

## What nobody verifies

- **The settings above.** They live in Vercel, and no test of the repo reads them.
- **That a deploy passed the gate.** The build runs `tsc -b`, so a project that does not typecheck
  is not published. The build runs no lint and no test: a green deploy says that the project
  compiles. `pnpm verify` gates the PR, and the ruleset of `main` requires it.
- **The pnpm version of the deploy.** Vercel takes it from the `lockfileVersion` of
  `pnpm-lock.yaml`, not from `packageManager`. The lockfile says `9.0`, which Vercel serves with
  pnpm 9 or 10. The local machine and the workflows use the exact version of `packageManager`.

## Why `vercel.json` says what it says

- **`installCommand` is explicit.** With no command, Vercel chooses the package manager from the
  lockfile it finds, and a `package-lock.json` in the tree makes it choose npm. The deploy then
  resolves other versions than the developer machine, with no error. The command removes the choice.
- **No `ignoreCommand`.** It is the one Vercel hook that can stop a deploy, and its exit code is
  inverted: 0 skips the build and 1 runs it. With `pnpm verify` there, the gate runs twice, and a
  red result shows as "deploy skipped", which the dashboard paints green.
- **No `rewrites`.** The app has no routing, and its only URL is `/`. When a route exists, write the
  fallback to `index.html` here. Vercel does not read a `public/_redirects` file.
- **No Node version.** See the table above.
