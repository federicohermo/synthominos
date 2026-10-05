import { defineConfig } from 'vitest/config'

// Stryker runs this config, and it cannot run the `browser` project.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/*.test.ts', '.spec-anchored/__tests__/*.test.ts'],
    exclude: ['**/*.budget.test.ts'],
    testTimeout: 30_000,
  },
})
