/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'

// Read from `process.argv`: a `COVERAGE=1 vitest` in front of the command does not work on Windows.
const BAJO_COVERAGE = process.argv.some(a => a.startsWith('--coverage'))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // `extends: true` gives each project the `plugins` and the one `coverage` block. The browser
    // must be Chromium while the coverage provider is v8.
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          // A gate that is not in this list stops running in silence.
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
          exclude: ['**/*.budget.test.ts'],
        },
      },
      {
        // `pnpm verify` runs this project alone: next to lint and typecheck, or under the
        // counters of v8, a median goes up with nothing wrong in the product (#107).
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
          // The setup imports the stylesheet: without it `getComputedStyle` returns defaults.
          setupFiles: ['./src/__tests__/browser-setup.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                // Without this, Chromium creates every `AudioContext` as `suspended`, and
                // `resume()` waits for a gesture that does not come in a test.
                args: ['--autoplay-policy=no-user-gesture-required'],
              },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],

    // The counters of v8 slow the combinatorial tests about six times: under `verify`, one of
    // them passes the default of 5 s with nothing wrong.
    testTimeout: BAJO_COVERAGE ? 30_000 : 5_000,

    coverage: {
      provider: 'v8',

      // Without `include`, vitest measures only the files that a test imported: a file with no
      // test would not be in the table.
      include: ['src/**/*.{ts,tsx}', 'eslint-rules/**/*.mjs', '.agents/scripts/*.ts', '.spec-anchored/*.ts'],

      exclude: [
        'src/**/__tests__/**',
        'eslint-rules/**/__tests__/**',
        '.agents/scripts/__tests__/**',
        '.spec-anchored/__tests__/**',
        'src/vite-env.d.ts',
        // Bootstrap only.
        'src/main.tsx',
        // v8 reports every file that ran. `pnpm mcp:test` holds this package at 100.
        'mcp-server/**',
      ],

      reporter: ['text'],
      // Without this, a red test makes vitest not print the table.
      reportOnFailure: true,

      thresholds: { lines: 100, statements: 100, functions: 100, branches: 100 },
    },
  },
})
