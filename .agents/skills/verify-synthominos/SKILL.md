---
name: verify-synthominos
description: "Drives the running instrument in Chromium as a player does, and records a proof: launch, doctor, drive by accessible name, evidence, cleanup. Use when a change to src/ must be shown to work in the real app, not only in its tests."
argument-hint: "[a feature of features/README.md]"
---

# verify-synthominos

Prove a behavior of the instrument on the real app. The surface is one web page: a board, a
palette of twelve pieces, a transport and a spectrum. There is no backend, no login and no stored
state: a reload is a clean instrument.

A proof drives the path of a player: a click, a key, the wheel. It never calls a function of
`src/` and never sets state from the console. It records each action with the state the page shows
after it. `pnpm verify` runs the tests; this skill shows the app.

## Launch

```sh
node .agents/skills/verify-synthominos/scripts/prove.mjs <feature>
```

With no URL, the script starts a Vite dev server of its own on the first free port from 5300, and
stops it at the end. It never uses 5173, the port of `pnpm dev`. Two runs can go side by side: each
has its own server and its own browser.

To drive an instance that already runs, give its URL as the second argument. The script then
starts no server and stops none.

A fresh clone needs `pnpm install` and `pnpm exec playwright install chromium` first.

## Doctor

```sh
node .agents/skills/verify-synthominos/scripts/doctor.mjs <url>
```

Read-only. Exit 0 means the instance is this app and can be driven: the title, the board, the
twelve pieces, the transport, and no console error. Run it first when a proof fails on its first
step.

## Drive

The handles are accessible names, and the names are Spanish: they are what the player reads.
`scripts/app.mjs` gives them to a proof, and [the feature map](./features/README.md) says which
ones each feature uses.

| Handle | Name |
|---|---|
| The board | role `grid`, `Tablero de <W> por <H>`. The size depends on the viewport: read it, do not assume it. |
| A cell | role `gridcell`, `fila <y+1>, columna <x+1>, libre` or `…, pieza <L>[ muteada], nota <N>, paso <k> de 4` |
| A piece of the palette | role `button`, `<L>, rotación <deg>°[, reflejada]`, with `aria-pressed` |
| The transport | buttons `Reproducir` / `Pausa`, `Recorrido en el vacío`, `Vaciar el tablero y frenar el transporte` |
| What an edit says | the `aria-live` region |

To add a proof, add a function to `PROOFS` in `scripts/prove.mjs` and a file to `features/`.

## Evidence

Each run writes `.agent-runs/verify/<time>-<feature>/`:

- `proof.json`: each action, the state observed after it, and the console errors.
- `final.png`: the page at the end.

A proof passes when each step holds and the console has no error. Read the verdict from the exit
code. Sound is proved by the spectrum canvas: it has no painted pixel until audio reaches the
analyser. Chromium runs with `--autoplay-policy=no-user-gesture-required`, because a headless page
has no gesture before the first click.

## Cleanup

The script closes the browser and the server it started, also when a step throws. It keeps the
evidence. It never stops a server it did not start. `.agent-runs/` is ignored by git: delete an
old run by hand when you do not need it.
