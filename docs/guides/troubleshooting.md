# Troubleshooting

Traps that someone already hit in this repo. Each entry gives the symptom, the cause and the fix.
An error that the message of its own tool explains is not here.

## Build and config

### `A config object has a "plugins" key defined as an array of strings`

ESLint does not start, and the message tells you to migrate to flat config. The config is flat
already.

**Cause:** `eslint-plugin-react-hooks` moved its presets between majors. In 5.x,
`configs['recommended-latest']` was the flat preset. In 6.x and 7.x that name is the eslintrc
preset, and the flat one is `configs.flat['recommended-latest']`.

**Fix:** use `reactHooks.configs.flat['recommended-latest']`. After an upgrade of the plugin, read
its exports before you read the error.

## Tests

### `OfflineAudioContext is not defined`

**Cause:** the `node` project runs in the `node` environment, which has no Web Audio.

**Fix:** import `OfflineAudioContext` from `node-web-audio-api`. If the test mounts a component,
name the file `*.browser.test.tsx`: it then runs in Chromium, with the real `AudioContext` and the
real DOM. Do not add `jsdom`: it has no canvas 2D, no `ResizeObserver`, no `matchMedia`, no layout
and no Web Audio, so a test there mocks the code it covers.

### `branch coverage does not meet threshold of 100%` on the CI runner, and green on Windows

`pnpm mcp:test` gave `99.64% branch coverage` on Linux. The same commit gave 100 on Windows.

**Cause:** a `?:` in the comparator of a `sort` over `readdirSync`. NTFS returns the entries in
alphabetical order and ext4 returns them in hash order, so one side of the `?:` never ran on Linux.
A pinned Node version did not change the number.

**Fix:** write the comparator with no branch: `Number(a > b) - Number(a < b)`. In general, no branch
can depend on an order that the environment gives.

### `Failed to delete stryker temp directory`, and `node` processes that stay alive

On Windows, `pnpm mutation` copies the repo to `.stryker-tmp/`.

**Cause:** a process still holds a file there. A run that is stopped from outside also leaves its
worker processes alive, and they keep the CPU.

**Fix:** end the `node` processes whose command line names `@stryker-mutator`, by PID. Then delete
`.stryker-tmp/`. Git, ESLint, the link gate and the copy generator ignore that folder, so a leftover
breaks no other gate.

## Audio

### Nothing sounds

There are three causes. Check them in this order, in the browser console of the dev server:

```js
const engine = await import('/src/playback/engine.ts');
engine.audio()?.state;   // 'running' after the first gesture
engine.sequenceInfo();   // the sounding sequence
```

1. **No gesture yet.** The browser keeps the `AudioContext` suspended until the first click or key.
   `state` is then `'suspended'`. Click the board.
2. **The browser has no Web Audio.** `audio()` returns `null` and logs one warning. The instrument
   stays usable and silent (BR-PLY-002).
3. **The transport plays.** A piece placed while the transport plays gives no courtesy arpeggio
   (AC-BRD-005). It sounds when the circuit reaches it: see the next entry.

### A board change does not sound at once

You place or remove a piece while the transport plays, and the sound stays the same for seconds.
`sequenceInfo()` reports the sounding sequence, not the queued one, so it does not change either.

**Cause:** this is BR-PLY-008. The queued sequence starts at the cycle boundary. The wait is up to
one cycle: 7.5 s with 8 pieces at 110 bpm.

**Fix:** wait one cycle before you look for a bug. If the old sound lasts more than one cycle,
something gives a sequence to the engine outside `playback/use-engine.ts`. The effects of that file
hold the only calls to `setSequence`.

## MCP server

### `ERR_MODULE_NOT_FOUND` when the server starts, and the app works

**Cause:** an import inside `src/` has no extension. Node loads `src/` for the server and needs
the full `./music.ts`. Vite resolves the short form, so `pnpm build` stays green.

**Fix:** write the extension. `pnpm lint` reports the import on all of `src/` and `mcp-server/`.

### `ERR_UNKNOWN_FILE_EXTENSION: ".tsx"`

**Cause:** a tool imports a `.tsx`, directly or through a module of `src/`. Node strips types and
does not transform JSX, so no component can load in the server. No setting changes that.

**Fix:** move what the tool needs to a `.ts` module of `src/`, in its own commit.

### The client does not list the server, and the app works

**Cause:** the shell that starts the client has a Node below 22.18, which cannot run the `.ts`
entry point. The app needs less, so everything else works.

**Fix:** check `node --version` in that shell.

## Deploy

No entry yet. The two errors that were here belonged to the hosting before Vercel. Add an entry
when a deploy fails on Vercel, with what was measured.
