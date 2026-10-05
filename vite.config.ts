/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'

/**
 * Whether this run is instrumented. It sets the test timeout, below.
 *
 * It is read from `process.argv` because that is the only place that holds the fact when the
 * config is built. A `COVERAGE=1 vitest` in front of the command does not work on Windows.
 */
const BAJO_COVERAGE = process.argv.some(a => a.startsWith('--coverage'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    /**
     * Three projects. `node` and `browser` run in ONE command: a `test` and a
     * `test:browser` would let `verify` report green after it ran half. `budget` runs
     * alone, and its block below says why.
     *
     * The split is not by layer but by what the test NEEDS:
     *
     * - `node`: the domain is pure, and the audio runs against `node-web-audio-api`, a
     *   native implementation of Web Audio.
     * - `browser`: a real Chromium, through Playwright. It is here because jsdom cannot do
     *   it: `Spectrum.tsx` needs canvas 2D, `createLinearGradient`, `ResizeObserver`,
     *   `matchMedia` and a `getBoundingClientRect` with numbers, and `engine.ts` needs
     *   `new AudioContext()` and `window.setInterval`. With jsdom, to cover them would
     *   take a mock of exactly the code to cover, which is coverage with no verification.
     *
     * The discriminant is the SUFFIX and not a folder: a test of `Board.tsx` that needs a
     * browser is still a test of `Board.tsx` and lives next to it. The extension also
     * separates by itself (`node` takes `.ts` and the browser `.tsx`), so a test with JSX
     * cannot fall into node by accident.
     *
     * `extends: true` in each, and it avoids a duplicate config: measured, with it the
     * projects inherit `plugins` (without that the JSX of the browser project does not
     * compile) and also the `coverage` block. `coverage` is ONE and lives above, so the
     * projects report in one table and against one threshold.
     *
     * The browser is not a free choice while coverage is v8: vitest validates the name and
     * fails explicitly with firefox or webkit, and offers istanbul as the alternative.
     */
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          /**
           * Eight roots, and seven are not `src/`: **each gate lives next to its subject**.
           * `__tests__/` checks the root files (`index.html`, the manifest, `README.md`);
           * `docs/__tests__/` the documentation; `specs/__tests__/` the capability
           * contracts; `.claude/scripts/__tests__/` and `.agents/scripts/__tests__/` the
           * harness scripts; `eslint-rules/__tests__/` the local lint rules;
           * `.spec-anchored/__tests__/` the kernel of the implementation protocol.
           *
           * None of them imports app code, so `src/__tests__/` keeps only what belongs to
           * the app. Without one of these entries its gate stops running SILENTLY: a red
           * that turns green by not running.
           */
          include: [
            'src/**/__tests__/*.test.ts',
            '__tests__/*.test.ts',
            'docs/__tests__/*.test.ts',
            'specs/__tests__/*.test.ts',
            '.claude/scripts/__tests__/*.test.ts',
            'eslint-rules/__tests__/*.test.ts',
            '.agents/scripts/__tests__/*.test.ts',
            '.spec-anchored/__tests__/*.test.ts',
          ],
          // The time budgets are a project of their own, below.
          exclude: ['**/*.budget.test.ts'],
        },
      },
      {
        // The time budgets. `pnpm verify` runs this project ALONE, after its parallel block: a
        // median measured next to lint, typecheck and the MCP suite goes up by contention, with
        // nothing wrong in the product (#107). `test` and `coverage` name the two other
        // projects, so neither runs it: under the counters of v8 a budget measures the counters.
        extends: true,
        test: {
          name: 'budget',
          environment: 'node',
          include: ['src/**/__tests__/*.budget.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/__tests__/*.browser.test.tsx'],
          // The stylesheet is imported ONCE, from the setup, not from each test. Measured:
          // without it `z-10` is in the `className` but `getComputedStyle(...).zIndex`
          // returns `auto`, so a layout test passes or fails for the wrong reason, in
          // silence.
          setupFiles: ['./src/__tests__/browser-setup.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                // Without this, the autoplay policy of Chromium creates every
                // `AudioContext` as `suspended`, and `resume()` waits for a gesture that
                // does not come in a test. `engine.ts` and `Spectrum.tsx` depend on
                // `ctx.state === 'running'` to do anything, so without the flag not one
                // of their active branches can be covered.
                args: ['--autoplay-policy=no-user-gesture-required'],
              },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],

    // ## The timeout is looser under coverage, for a measured reason
    //
    // v8 instruments by inserting counters in each branch, and the combinatorial tests of
    // the domain (the ones that walk the 96 orientations or solve boards of 12 pieces) are
    // the ones that run the most branches. Measured on the time budgets: 11.3 ms against
    // 1.8 ms without instrumentation. With the four nodes of `verify` competing for CPU at
    // the same time, that takes one of those tests above the 5 s of the default and turns
    // it red **with nothing wrong**.
    //
    // A false red in the convergence node is worse than no node: it teaches people to read
    // red as noise. Time is still checked where it means something, in the `budget` project.
    testTimeout: BAJO_COVERAGE ? 30_000 : 5_000,

    coverage: {
      provider: 'v8',

      // The denominator is declared WHOLE and discounted by name, and that is the decision:
      // by default vitest measures only the files that some test imported. So a file at
      // absolute zero, the one that matters most, would not appear in the table, and the
      // number would look better and mean nothing. In vitest 4, `include` is enough: it has
      // no `all` flag, and the typecheck rejects one.
      // And `eslint-rules/**/*.mjs`, which is not under `src/`: v8 reports every file that
      // RAN, so the `.mjs` that the `RuleTester` imports enters the table, declared or not.
      // It is the same mechanism that forces the exclusion of `mcp-server/**` below. The way
      // out chosen here is the opposite one: include and cover. `mcp-server/**` is excluded
      // because it has its own gate at 100 with another runner; these rules have no other
      // runner, so vitest covers them.
      //
      // And `.agents/scripts/*.ts`, for the same reason as `eslint-rules/`: it is code of
      // this repo that runs from outside (the hooks of Claude and of Codex, the worktree
      // cleaner and the generator of copies), and its tests import it in the same process.
      // The copies that travel inside the skills are not included: no test runs them, and
      // they are byte for byte the ones here.
      include: ['src/**/*.{ts,tsx}', 'eslint-rules/**/*.mjs', '.agents/scripts/*.ts', '.spec-anchored/*.ts'],

      exclude: [
        // These are the tests.
        'src/**/__tests__/**',
        'eslint-rules/**/__tests__/**',
        '.agents/scripts/__tests__/**',
        '.spec-anchored/__tests__/**',
        // Type declarations: they do not reach the runtime.
        'src/vite-env.d.ts',
        // Bootstrap: `createRoot(...).render(<App />)`. To cover it verifies that React
        // mounts, not that this repo works.
        'src/main.tsx',
        // The other package, which has its own gate at 100. v8 reports every file that
        // RAN, so a Vitest test that imports one `mcp-server/` module would add the file
        // to this table. That package runs its tests with `node --test`, and `pnpm
        // mcp:test` (a node of `verify`) holds it at 100 on all four metrics.
        'mcp-server/**',
      ],

      // `text` and nothing else: the gate is binary, and the table in the console is enough
      // to read it. `reportOnFailure` is NOT optional: without it, a red test makes vitest
      // not print the table, so the run that needs the report most is the one that does
      // not give it.
      reporter: ['text'],
      reportOnFailure: true,

      // ## One hundred, and not ninety-five
      //
      // A threshold below 100 is a debt budget with NO OWNER: nobody knows which lines the
      // margin lets stay uncovered, so nobody reviews them and the margin fills by itself.
      // 100 does not admit that ambiguity: each line that enters the repo is covered, or it
      // is excluded by name with a reason written above. It moves the discussion from the
      // average to the file, where it can be resolved.
      //
      // It is the same form the repo chose for "zero `any` and zero `@ts-ignore`", not
      // "few". The corollary holds too: if a branch looks unreachable, the way out is to
      // delete it or to make it reachable, never the magic comment that asks the coverage
      // provider to skip it.
      //
      // That periphrasis is not modesty: `no-warning-comments` forbids the three terms, and
      // the rule looks at text and not at syntax, so **to spell the term to explain why not
      // to use it breaks the rule too**. The literal list lives in `eslint.config.js`, the
      // only place of the repo where it must be.
      thresholds: { lines: 100, statements: 100, functions: 100, branches: 100 },
    },
  },
})
