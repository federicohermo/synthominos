import js from '@eslint/js'
import markdown from '@eslint/markdown'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import vitest from '@vitest/eslint-plugin'
import importX from 'eslint-plugin-import-x'
import { globalIgnores } from 'eslint/config'
import commentShape from './eslint-rules/comment-shape.mjs'
import commentAnchor from './eslint-rules/comment-anchor.mjs'

/**
 * The global state packages that `AGENTS.md` forbids. This rule is among the easiest to break
 * by accident: the temptation does not come with the import, but three levels of props below.
 */
const ESTADO_GLOBAL = ['zustand', 'redux', '@reduxjs/toolkit', 'jotai', 'valtio', 'recoil', 'mobx', 'mobx-react-lite']

const GRUPO_ESTADO = {
  group: ESTADO_GLOBAL,
  message: 'No global state: the state lives in App.tsx and goes down through props.',
}

/**
 * The forbidden zones, by path. `mcp-server/` is tooling, and the direction is one: it imports
 * from `src/`, NEVER the reverse.
 */
const ZONAS = [
  {
    target: './src',
    from: './mcp-server',
    message: 'mcp-server/ is tooling: it imports from src/, never the reverse.',
  },
]

/**
 * The rules the documentation states, as esquery selectors with no plugin. The ones for all of
 * the repo live in this array; `REGLA_EFECTOS`, for `.tsx` files only, lives below in its block.
 *
 * They share one array because `no-restricted-syntax` is REPLACED between overrides: a block
 * below that adds its own rule repeats these, or turns them off for the files it matches.
 */
/**
 * The four nodes that name a module by its path.
 *
 * All four are listed, and not only `ImportDeclaration`, because the other forms do appear: the
 * tests that import a module again after `vi.resetModules()` use `import()`. A rule that covers
 * one form passes green and reads as complete.
 *
 * The measure that fixed the list: `import-x/no-restricted-paths` resolves paths and does not
 * look at strings, so it fires on every form with no list. This selector is written by hand,
 * and it must list them to match that rule.
 *
 * An `export { x }` with no `from` has `source: null`, so the attribute does not match and the
 * selector does not fire. An `import(variable)` does not fire either: with no `source.value`
 * there is no string to judge.
 */
const NODOS_CON_RUTA = ['ImportDeclaration', 'ImportExpression', 'ExportNamedDeclaration', 'ExportAllDeclaration']

/**
 * The local specifier with no extension.
 *
 * `.mjs` is in the list because the tests of the two local rules import the rule, which is a
 * `.mjs`. Without this alternative the selector reads `../comment-shape.mjs` as an import with
 * NO extension, which is the opposite of the fact.
 */
const SIN_EXTENSION = '[source.value=/^[.].*(?<![.]ts|[.]tsx|[.]mjs|[.]css|[.]json)$/]'

const REGLAS_DEL_REPO = [
  {
    // "No barrels, explicit extensions, no aliases." A missing extension does not break the
    // app: Vite and the `moduleResolution: bundler` of the tsconfig resolve it anyway. So the
    // error is invisible on the browser side, and shows only when raw node loads a module of
    // `src/`, which is what the MCP server does.
    selector: NODOS_CON_RUTA.map((nodo) => nodo + SIN_EXTENSION).join(', '),
    message: 'Every local import has an explicit extension: ./music.ts, not ./music.',
  },
  {
    // The other half of "no barrels". The node IS in `NODOS_CON_RUTA`, but there it is joined
    // with `SIN_EXTENSION`, so the selector above checks the extension and not the barrel: an
    // `export * from './x.ts'` SATISFIES it. This entry forbids the same node without that
    // filter.
    //
    // The reason: a re-export loads extra files and makes the module responsible for
    // propagating those re-exports through HMR.
    //
    // **The name `index.ts` is NOT forbidden, on purpose.** The three that exist
    // (`mcp-server/src/index.ts`, `resources/index.ts` and `tools/index.ts`) are an entrypoint
    // and two registries that build a `readonly [...]`, not barrels. The convention is against
    // an `index.ts` that re-exports, and a selector cannot evaluate "re-export". A block
    // `files: ['**/index.ts']` would give three false positives. It would also turn
    // `REGLAS_DEL_REPO` off for them, which is the flat config trap this file guards against.
    // The barrel that re-exports by hand (`export { a } from './a.ts'`) stays outside, and
    // `docs/guides/conventions.md` states it: half a net, written as half a net, is honest.
    selector: 'ExportAllDeclaration',
    message: 'No barrels: no export *. Import from the file that defines the symbol.',
  },
  {
    // `erasableSyntaxOnly` catches it in the typecheck, but with the message of TypeScript.
    // Here it fails with the reason of the repo, and in the editor, while you write.
    selector: 'TSEnumDeclaration',
    message: 'Zero enum: a closed set is a const object plus a derived union type.',
  },
  {
    // The other half of "no global state": the import of `react` is legitimate in a
    // component, so the call must be forbidden, not the package.
    selector: "CallExpression[callee.name='createContext'], CallExpression[callee.property.name='createContext']",
    message: 'No global state: no Context, Redux or Zustand. The state lives in App.tsx.',
  },
]

/**
 * "A `.tsx` does not declare the logic of an effect."
 *
 * The reason is not style. `react-refresh/only-export-components` forbids a `.tsx` to export
 * anything but the component, so effect logic declared there **cannot be exported and so
 * cannot be tested**. The same argument keeps the domain out of `App.tsx`.
 *
 * The anchor is the name and not the import, because the import of `react` is legitimate in a
 * component: the call must be forbidden, as with `createContext`.
 *
 * **It names BOTH hooks, not only `useEffect`.** `use-grid.ts` mounts its effect with
 * `useLayoutEffect`, on purpose, so that the viewport measure does not show for one frame. A
 * selector on `useEffect` alone lets the same logic through, in the same `.tsx`, under the
 * other name: a net with a hole that reads as complete. Zero findings with both: no `.tsx`
 * declares a `useLayoutEffect`.
 */
const REGLA_EFECTOS = {
  selector: "CallExpression[callee.name=/^use(Layout)?Effect$/]",
  message: 'A .tsx does not declare the logic of an effect: it goes in a .ts module, and the .tsx mounts it.',
}

export default tseslint.config([
  /**
   * `.claude/worktrees/` is ignored for the same reason it is in `.gitignore`: it holds a
   * complete checkout of the repo while a parallel task runs.
   *
   * Without this entry `pnpm lint` **fails** during those tasks. The overrides of this file
   * match by PATH, and `.claude/worktrees/agent-x/src/main.tsx` does not match `src/main.tsx`.
   * So the three non-null assertions that the repo declares deliberate read as forbidden in
   * the copy, and the red shows in the main checkout for work that is not its own.
   */
  // The generated copies of the harness: `node .agents/scripts/sync.ts --check` verifies they
  // match their canonical source, which is linted. A nested `AGENTS.md` joins several rules.
  globalIgnores([
    'dist', '.claude/worktrees', '.claude/skills', '.claude/rules', '.claude/agents', '.codex',
    '.agents/skills/*/scripts', '*/**/AGENTS.md',
    // What a mutation run writes: the sandbox, which is a copy of the repo, and the report.
    '.stryker-tmp', 'reports',
  ]),

  {
    // No `files`, so these hold for all of the repo.
    //
    // `reportUnusedDisableDirectives` is `warn` by default in ESLint 9, and a warn breaks
    // nothing: the script runs with `--max-warnings 0` so that it does.
    //
    // `noInlineConfig` is the lint counterpart of "zero `any`, zero `@ts-ignore`". Measured
    // when it went in: ZERO `eslint-disable` in `src/` and in `mcp-server/src/`, so it cost
    // nothing. A real exception goes as a per-file override in this file, where the diff
    // shows it and a comment explains it, and not as a loose comment.
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      noInlineConfig: true,
    },
  },

  {
    // The `.js` files of the repo, which today is this file alone. The block that extends
    // `js.configs.recommended` for TypeScript is tied to `**/*.{ts,tsx}`, so without this
    // block the file that decides what is verified is the one file that is not verified.
    // Measured without it, with `--print-config eslint.config.js`: 0 rules.
    //
    // It needs no `disableTypeChecked`, which is what typescript-eslint documents for this
    // case, because the typed block below matches `**/*.{ts,tsx}` and does not reach it.
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },

  {
    // TypeScript in all of the repo, WITH type information. `projectService: true` is the
    // form typescript-eslint documents: each file is typechecked with the tsconfig that owns
    // it (`tsconfig.app.json` for `src/`, `tsconfig.node.json` for `vite.config.ts`,
    // `mcp-server/tsconfig.json` for the server), with no list here.
    //
    // The cost is measured, and it is why this is on: `recommendedTypeChecked` on the whole
    // repo gives 100 findings, and 97 are one pattern of `node:test` that one option turns
    // off (see `no-floating-promises` below). What it buys is prospective, and that is the
    // point: `no-floating-promises` on the audio code, where `resume()` and `close()` return
    // promises, is the error that no test of this repo can see, because audio is not tested
    // by its sound.
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 'latest',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'import-x': importX },
    settings: {
      // The default resolver of import-x does not know `.ts`. `createNodeResolver` is used
      // and not the TypeScript resolver because this repo has no alias and no `paths`: the
      // only thing to resolve is a relative path with an explicit extension. The node
      // resolver is enough for that, and it does not bring the native binary
      // (`unrs-resolver`), whose install script the `allowBuilds` of `pnpm-workspace.yaml`
      // blocks.
      'import-x/resolver-next': [importX.createNodeResolver({ extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'] })],
    },
    rules: {
      // The dependency direction, by path.
      //
      // `basePath` is not optional even with a default: the default is `process.cwd()`, so
      // the zones resolve against **where eslint was run from** and not against the repo
      // root. Measured: the same file with the same violation gives 1 error from the root
      // and **0 when `eslint` runs from `src/`**, with no warning. That is the failure mode
      // this file guards against, failing green, and one line anchors it.
      'import-x/no-restricted-paths': ['error', { basePath: import.meta.dirname, zones: ZONAS }],

      // `import-x/no-cycle` is NOT here, and its absence is the decision. It was tried and
      // measured: it finds ZERO cycles and costs ~15 s on a `pnpm lint` that takes
      // **21.78 s**. So it would take lint from 21.78 s to ~37 s, more than one and a half
      // times, because it walks the whole graph for each file, and `mcp-server/` imports 31
      // symbols of `src/`.
      //
      // What it would buy: no zone orders the modules of `src/` any more, so a cycle between
      // two of them passes lint. Run once by hand when the layer zones left
      // (`eslint --rule '{"import-x/no-cycle":"error"}' src mcp-server/src`), it found ZERO
      // cycles. What is checked each time it comes up is the price, against the cycles found.
      //
      // **One more cost, against it:** the stop hook runs lint ONCE PER TURN on the list of
      // what changed (4.42 s measured for one file, with a budget of less than 6 s). There
      // `no-cycle` builds the whole graph on that startup, with no full run to amortize it.
      // So the extra cost is paid per turn, not once per PR.
      //
      // If it is turned on some day, the change is NOT one line: `pnpm verify` measures
      // 23.7 s in parallel against 41.2 s in series, and `lint` is the long node of that
      // parallel block, so that measurement stops being true.

      // Every tsconfig has `verbatimModuleSyntax: true`, so a type imported without `type`
      // BREAKS THE BUILD and gives no warning first. The rule is autofixable: the error
      // cannot reach the build.
      //
      // `disallowTypeAnnotations: false` lets `typeof import('./x.ts')` through, which is a
      // different thing from what the rule exists to catch. The uses are in tests that
      // import the module again with `vi.resetModules()` or `vi.doMock`
      // (`playback/__tests__/route-source.test.ts` and
      // `pieces/__tests__/invariants.test.ts`, among others): there `typeof import(...)` is
      // the idiomatic way to name the type of a module that the file does NOT want
      // imported. With `verbatimModuleSyntax` both forms are erased the same, so a rewrite
      // would change the intent and not the runtime.
      '@typescript-eslint/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],
      '@typescript-eslint/no-import-type-side-effects': 'error',

      // `Cell` is `[number, number]`, and the repo interpolates it on purpose in failure
      // messages (`${TODAS[i]} / ${TODAS[j]}`). `allowArray` allows exactly that, arrays
      // whose elements are already interpolable, and keeps the part of the rule that
      // matters: objects, `any` and nullish stay forbidden. Without the option there are 35
      // findings, 25 of them in one test file.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowArray: true }],

      // `node:test` returns a promise that must NOT be awaited: it is the documented way to
      // write a test for `node --test`, which is what `mcp-server` runs. These are 97 of the
      // 100 findings the preset gives. `allowForKnownSafeCalls` exists for this, and it
      // points to the package, not to the name: a `test()` from another origin stays
      // forbidden.
      '@typescript-eslint/no-floating-promises': ['error', {
        allowForKnownSafeCalls: [
          { from: 'package', name: 'test', package: 'node:test' },
          { from: 'package', name: 'describe', package: 'node:test' },
          { from: 'package', name: 'it', package: 'node:test' },
        ],
      }],

      'no-restricted-syntax': ['error', ...REGLAS_DEL_REPO],

      // The non-null assertion is a small `any`: it tells the compiler to be quiet without
      // a reason.
      //
      // The rule is off in two places and in no other, both below with their reason. That
      // pair of overrides is the ONLY source of the number. A count in prose goes out of
      // sync: it said TWO in production when there were THREE.
      '@typescript-eslint/no-non-null-assertion': 'error',

      // The corollary of the 100 threshold. If a branch looks unreachable, the way out is to
      // delete it or to make it reachable, never to ask the coverage provider to skip it: a
      // threshold with escapes is a lower threshold with no owner, which is the argument
      // against 95.
      //
      // `location: 'anywhere'` and not the default `start`: the three terms appear in the
      // middle of a sentence, not at the head of the comment.
      //
      // The rule looks at TEXT and not at syntax, so **to spell a term to explain why not to
      // use it breaks the rule too**. That is the price of a textual rule, and the comment
      // of `vite.config.ts` on the threshold pays it: it names the mechanism and not the
      // term.
      //
      // The three terms live here and in no comment of the repo, but mind the reason: **this
      // file is not under the rule**. The rule is declared in the `**/*.{ts,tsx}` block and
      // this is a `.js`: verified with `--print-config eslint.config.js`, where it does not
      // appear. And if it were, `terms` is an array of strings and not a comment. The
      // periphrasis above is for consistency with that comment, not because the linter
      // requires it here.
      'no-warning-comments': ['error', {
        terms: ['v8 ignore', 'c8 ignore', 'istanbul ignore'],
        location: 'anywhere',
      }],
    },
  },

  {
    // The THREE non-null assertions of production, each with the reason the compiler cannot
    // see. They go as a per-file override and not as a loose comment because `noInlineConfig`
    // admits no `eslint-disable`, and because the written rule states this mechanism: "A
    // real exception goes as a per-file override in `eslint.config.js`, where the diff shows
    // it and a comment explains it" (`docs/guides/conventions.md`).
    //
    // Before you add a fourth, try a `const`: TypeScript loses the narrowing inside the
    // closure of a `forEach` when the variable is a module `let`, and a local `const` keeps
    // it.
    //
    // - `main.tsx`         the Vite idiom on a `#root` that `index.html` itself guarantees.
    // - `invariants.ts`    the `queue.shift()!` of a BFS, inside a `while` that already
    //                      guarantees a non-empty queue.
    // - `Board.tsx`        the `[role="grid"]` ancestor exists by construction: the handler
    //                      lives in a descendant of that grid. The alternative `if` is an
    //                      unreachable branch, and the 100 threshold does not let it be
    //                      covered.
    files: ['src/main.tsx', 'src/pieces/invariants.ts', 'src/board-editing/Board.tsx'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },

  {
    // In a test, the `!` on a `find` or a `querySelector` that the test itself just set up
    // makes the test **fail** if the node is missing, which is what is wanted.
    // `docs/guides/conventions.md` declares them deliberate.
    files: [
      'src/**/__tests__/**/*.{ts,tsx}', '__tests__/*.ts', 'docs/__tests__/*.ts',
      'specs/__tests__/*.ts', '.claude/scripts/__tests__/*.ts', '.agents/scripts/__tests__/*.ts',
      '.spec-anchored/__tests__/*.ts', 'mcp-server/**/__tests__/**/*.ts',
    ],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },

  {
    // The globals by environment. `globals.browser` on `**/*.{ts,tsx}` would also reach
    // `mcp-server/` and `vite.config.ts`: verified with `--print-config`,
    // `mcp-server/src/index.ts` then gets `window`, `document` and `AudioContext` defined,
    // and NOT `process`. That breaks nothing, because `no-undef` is off for TypeScript (the
    // tseslint preset turns it off, with reason: the compiler verifies that), but it is a
    // surprise in store.
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    // The gates that are not of the app go here and not above: they read the disk with
    // `node:fs` and `node:url`, they launch `gh`, and none touches a DOM. Under `src/` they
    // would get `globals.browser`: `window` and `document` defined, and NOT `process`.
    files: [
      'mcp-server/**/*.ts', '__tests__/*.ts', 'docs/__tests__/*.ts',
      'specs/__tests__/*.ts', '.claude/scripts/**/*.ts', '.agents/scripts/**/*.ts', '.spec-anchored/**/*.ts', '*.config.ts',
    ],
    languageOptions: { globals: globals.node },
  },

  {
    // React only where React is: the hook rules read the `.tsx` files and the `use-*.ts`
    // hooks, which are the only files with hooks.
    //
    // The key is `configs.flat[...]` and not `configs[...]`: in the 7.x plugin the top
    // export is the eslintrc one, with `plugins` as an array of strings, and flat config
    // rejects it with a startup error. The preset has 17 rules: besides `rules-of-hooks` and
    // `exhaustive-deps` it brings those of the React Compiler, which react.dev says ship in
    // this plugin and not in a separate one. They are useful even if the compiler is not
    // adopted. `set-state-in-effect` is the pattern that `use-engine.ts` concentrates;
    // `immutability` and `purity` are the React version of a pure function.
    files: ['src/**/*.tsx', 'src/**/use-*.ts'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },
  {
    // `only-export-components` makes sense only where a component can be. The same holds
    // for `jsx-a11y`, which reads JSX: only a `.tsx` has JSX.
    //
    // **`strict` and not `recommended`**, with the two measured numbers: on this code
    // `recommended` gives ONE finding and `strict` gives TWO, and the second is in the same
    // file, on a construction that the block below exempts. So `strict` costs nothing more
    // today and covers more from here on. The real difference between the two configs is not
    // the list of rules, which is almost the same. `recommended` comes with wired
    // exceptions: it limits the handlers of `no-static-element-interactions` (so
    // `onContextMenu` escapes it), it gives the two `element-to-role` rules a tolerated map
    // of `tag: [roles]`, and it leaves `no-noninteractive-tabindex` with
    // `allowExpressionValues`.
    //
    // This plugin **needs no type information**: it reads the JSX and nothing else, so it
    // does not bring the cost of type-aware linting.
    //
    // What it does NOT cover, which is why a browser gate exists too: none of its configs
    // requires `aria-label` on an icon-only control or `aria-pressed` on a control that
    // toggles. It cannot tell a glyph from a text, or know which button is a toggle. Only
    // the rendered accessibility tree answers that
    // (`src/__tests__/arbol-accesible.browser.test.tsx`).
    files: ['src/**/*.tsx'],
    extends: [reactRefresh.configs.vite, jsxA11y.flatConfigs.strict],
  },
  {
    // The TWO findings of `jsx-a11y` on the repo, with **one reason per rule**, because they
    // are two different constructions of the same file. They go as a per-file override with
    // the rules named, not by glob and not with the category off, by the mechanism that
    // declares the three non-null assertions above: `noInlineConfig` admits no
    // `eslint-disable`, so the diff shows the exception and a comment explains it.
    //
    // It is its own block and not one more line in the block of `src/main.tsx`,
    // `invariants.ts` and `Board.tsx`. That block names the same file but explains another
    // thing. In one block, a `Board.tsx` that stops needing one of the two exemptions would
    // take the other with it.
    //
    // **(a) `interactive-supports-focus`**: the `<div role="grid">` of `Board.tsx`. The rule
    // asks that an element with an interactive role be focusable, and this grid **is not, on
    // purpose**. It implements *roving tabindex*: the cell of the cursor has `tabIndex={0}`
    // and the others `-1`, and the arrows move the focus. A focusable container PLUS
    // focusable cells would give 61 tab stops on a board of 60 cells, where the correct
    // pattern asks for one. It is what `.agents/rules/ui.md` documents: a composite region
    // is ONE tab stop, and the arrows move inside it.
    //
    // **(b) `no-static-element-interactions`**: the positioned wrapper of `Board.tsx`
    // (`<div ref={boardRef} className="relative" onContextMenu={...}>`), which is NOT the
    // grid. The rule asks for a sibling keyboard handler on the same node. Here the keyboard
    // counterpart exists, but it lives in the global listener of `use-input.ts`. That
    // asymmetry is measured and written in `Board.tsx`, above the wrapper: react-dom
    // registers `touchstart`, `touchmove` and `wheel` as PASSIVE, so the wheel must go
    // through `addEventListener(..., { passive: false })` from the hook. `contextmenu` is
    // not among those three, so it can go through a prop, but its keyboard sibling stays on
    // the other side.
    //
    // Both are the generic rule against a decision that the repo took, measured and wrote.
    // If one of the two constructions changes, its own argument stops the exemption.
    files: ['src/board-editing/Board.tsx'],
    rules: {
      'jsx-a11y/interactive-supports-focus': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
    },
  },

  {
    // The forbidden packages. `no-restricted-imports` holds only this: an npm package has no
    // path in the repo, so the zones of `import-x` cannot see it.
    //
    // The typescript-eslint variant is used and not the core one because it also sees the
    // `import type`, which is what a careless refactor would use to get in.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [GRUPO_ESTADO] }],
    },
  },
  {
    // The effects rule, only where a component can be. It repeats `REGLAS_DEL_REPO` because
    // the override REPLACES `no-restricted-syntax`: without that, this block would turn the
    // other four off for every `.tsx`.
    //
    // **`__tests__/` stays outside by a written decision, not by omission** (issue #147).
    // The glob `src/**/*.tsx` also matches the **twelve** `.tsx` test files, and they would
    // pass green there: none declares an effect, and where they name the two hooks it is in
    // a comment. So the red would never come and the decision would take itself: a future
    // harness that mounts a component with an effect would be blocked by a rule that never
    // decided to apply to it. The ban is on the components, not on what mounts them, so the
    // test directories are named, as the two neighbor blocks that tell them apart do. The
    // tests stay under `REGLAS_DEL_REPO` by the general block.
    files: ['src/**/*.tsx'],
    ignores: ['src/**/__tests__/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...REGLAS_DEL_REPO, REGLA_EFECTOS],
    },
  },
  {
    // The TWO `.tsx` files that mount an effect, named one by one and not by glob. The
    // precedent is the three non-null assertions above. It is per file because a glob grows
    // by itself: `src/*.tsx` would exempt every future component with no decision.
    //
    // Both meet the reason of the rule and break its letter, which makes them an exception
    // and not a tolerance. Each is ONE LINE and declares no logic of its own:
    //
    //     useEffect(() => iniciarCabeza(capaRef.current, ref.current, resalteRef.current), [])
    //     useEffect(() => iniciarEspectro(ref.current), [])
    //
    // `iniciarCabeza` and `iniciarEspectro` live in `playhead-loop.ts` and `spectrum-loop.ts`,
    // outside the `.tsx`, and they are tested. **If one of those lines grows, its own
    // argument stops the exemption**, and the linter does not count lines: so the reason is
    // written here.
    //
    // It repeats `REGLAS_DEL_REPO` for the same flat config trap, and it omits
    // `REGLA_EFECTOS`: that is exactly what it exempts.
    files: ['src/playback/Playhead.tsx', 'src/spectrum/Spectrum.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...REGLAS_DEL_REPO],
    },
  },

  {
    // Failing green is the bug this repo has had twice: the `--filter "{.}"` without which
    // the script reports success with nothing run, and the `$` of the regex without which a
    // second vitest starts. A forgotten `.only` is the same bug: it lets the whole suite
    // pass with no warning. Measured when the rule went in: zero `.only` and zero `.skip`.
    //
    // `fixable: false` is deliberate: `--fix` must not delete the `.only` in silence, it
    // must fail.
    files: [
      'src/**/__tests__/**/*.{ts,tsx}', '__tests__/*.ts', 'docs/__tests__/*.ts',
      'specs/__tests__/*.ts', '.claude/scripts/__tests__/*.ts',
      'eslint-rules/__tests__/*.ts', '.agents/scripts/__tests__/*.ts', '.spec-anchored/__tests__/*.ts',
    ],
    plugins: { vitest },
    rules: {
      'vitest/no-focused-tests': ['error', { fixable: false }],
      'vitest/no-disabled-tests': 'error',
      'vitest/expect-expect': 'error',
      // `maxArgs: 2` because Vitest, unlike Jest, takes a message as the second argument
      // (`expect(x, 'why')`), and this repo uses it. Measured: with the default of the rule,
      // 24 assertions failed for an API difference, not for a problem.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      'vitest/no-identical-title': 'error',
    },
  },

  {
    // The same "failing green", for the other runner. `mcp-server/` runs with `node --test`
    // and `@vitest/eslint-plugin` does not look at it, so without this block its tests are
    // outside the rule that `AGENTS.md` writes for all of the repo.
    //
    // Without this a `.skip` there fails too, but **by accident**: `no-floating-promises`
    // catches it, because `allowForKnownSafeCalls` names `test`/`describe`/`it` and not
    // their members. So the message talks about unawaited promises and not about the reason,
    // and a `void` silences it with no warning.
    //
    // It repeats `REGLAS_DEL_REPO` because `no-restricted-syntax` is REPLACED between
    // overrides: the same flat config trap as in the rest of the file.
    //
    // The test without an assertion has no cheap equivalent with `node:test`, which has no
    // `expect` to count, and it stays outside on purpose. `docs/guides/conventions.md` says
    // so.
    files: ['mcp-server/**/__tests__/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...REGLAS_DEL_REPO, {
        selector: 'CallExpression[callee.object.name=/^(test|it|describe|suite)$/][callee.property.name=/^(only|skip)$/]',
        message: 'No .only and no .skip: they let the suite pass green. Fix the test or delete it.',
      }],
    },
  },

  {
    // ## The two local rules
    //
    // They check the comment conventions. A rule that is written and not verified is out of
    // sync half of the time. They live in `eslint-rules/`. They are ported from another repo
    // of the same owner, but NOT copied: verbatim they gave 1007 findings in 92 of 93 files.
    // The reason for each check that went in, and for each one that was rejected, is written
    // above its code.
    //
    // The criterion that orders both: **accuracy, not length**. Neither measures how much a
    // comment says. Both measure if what it says is still true.
    //
    // They are declared as an inline plugin and not as a package: they are files of this
    // repo, and a package would ask for a `package.json` and a version for a thing that
    // never leaves this repo. The `local/` prefix tells them apart in the linter output.
    //
    // The two trees and not `**/*.{ts,tsx}`: `eslint-rules/` would lint itself, which is a
    // cycle with the startup of ESLint.
    files: ['src/**/*.{ts,tsx}', 'mcp-server/src/**/*.ts'],
    plugins: { local: { rules: { 'comment-shape': commentShape, 'comment-anchor': commentAnchor } } },
    rules: {
      'local/comment-shape': 'error',
      'local/comment-anchor': 'error',
    },
  },

  {
    // Every `.md` of the repo: the documentation, the rules, the skills and the specs per
    // capability. The whole preset: each file is kept up to date, so it can meet it.
    //
    // **`extends` takes the OBJECT and not the string `'markdown/recommended'`**, and it is
    // not a preference: this file is built with `tseslint.config()`, which throws on a
    // string there ("This is a feature of eslint's defineConfig() helper and is not
    // supported by typescript-eslint"). So the form that `@eslint/markdown` documents, which
    // assumes `defineConfig`, does not fail when it lints a `.md`: it fails when the config
    // LOADS, and all of `pnpm lint` goes down.
    files: ['**/*.md'],
    plugins: { markdown },
    language: 'markdown/gfm',
    languageOptions: {
      // Without this the `---` of the frontmatter reads as content, and the `name:` and
      // `description:` inside come out as headings. Measured: 22 false positives, and all
      // 22 are YAML comments of the files of `.claude/`.
      frontmatter: 'yaml',
    },
    extends: [markdown.configs.recommended],
    rules: {
      // Off because **to fix what it marks breaks the link for real**. Its slugger does not
      // match the one of GitHub on a heading with backticks and an underscore: a link to the
      // anchor `#find_symbol`, which resolves on GitHub, comes out broken.
      // What is verified, links and anchors with the correct slugger, is
      // `docs/__tests__/enlaces-resueltos.test.ts`, which also covers the links to ANOTHER
      // file, which this rule does not look at.
      'markdown/no-missing-link-fragments': 'off',
    },
  },

  {
    // A constant or a type lives in the module that defines or produces it, so each value
    // exists once. A file named for its role (`*.constants.ts`, `*.types.ts`) or a role
    // folder is red from its first line: without this, the folder comes back in the next PR.
    files: ['src/**/*.constants.ts', 'src/**/*.types.ts', 'src/**/constants/**', 'src/**/types/**'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'Program',
        message: 'A value or a type lives in the module that owns it: no *.constants.ts, *.types.ts, constants/ or types/ under src/.',
      }],
    },
  },

  {
    // The cyclomatic complexity of each function of the product, at most 10. It is the
    // complexity gate of the implementation protocol: the two hardening agents work under it.
    //
    // It covers the product and not the harness. The kernel in `.spec-anchored/` keeps the
    // shape of the Python functions it ports, and one function per contract there is the
    // property that lets a reader compare the two.
    files: ['src/**/*.{ts,tsx}', 'mcp-server/src/**/*.ts'],
    rules: { complexity: ['error', 10] },
  },
  // The files that were over 10 on 2026-10-04, each with the value measured that day as its
  // ceiling. A ceiling goes down when the function gets simpler. It never goes up, and no file
  // joins this list: a new function over 10 is split.
  ...[
    ['src/board-editing/Board.tsx', 22],
    ['src/board-editing/input.ts', 17],
    ['src/pieces/invariants.ts', 16],
    ['src/pieces/transform.ts', 15],
    ['src/circuit/sequence.ts', 13],
    ['src/playback/playhead-loop.ts', 12],
    ['src/playback/__tests__/test-context.ts', 12],
    ['src/circuit/routing.ts', 11],
    ['mcp-server/src/symbols.ts', 25],
  ].map(([file, ceiling]) => ({ files: [file], rules: { complexity: ['error', ceiling] } })),
])
