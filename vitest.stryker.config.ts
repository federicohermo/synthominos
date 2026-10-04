import { defineConfig } from 'vitest/config'

/**
 * The Vitest config that Stryker runs, and only Stryker: `pnpm mutation`.
 *
 * It is the `node` project of `vite.config.ts` without the gates that do not test the product.
 * Stryker cannot run the `browser` project, so a module that only Chromium covers is not in the
 * `mutate` list of `stryker.config.json`.
 *
 * The time budgets are out, as under v8: Stryker instruments every module, and a budget would
 * measure the instrumentation. The timeout is the one of the coverage pass.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/*.test.ts', '.spec-anchored/__tests__/*.test.ts'],
    exclude: ['**/*.budget.test.ts'],
    testTimeout: 30_000,
  },
})
