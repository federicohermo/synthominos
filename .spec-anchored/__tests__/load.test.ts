import { describe, it, expect } from 'vitest';

/**
 * Each module of the kernel loads. This file imports them INSIDE a test, and it must stay so.
 *
 * The kernel builds its tables when it loads. A defect there throws at import, and a test file
 * that imports the kernel at its top then has no test to fail: Vitest reports a file that could
 * not load, and Stryker reads that as a mutant no test noticed. Here the import is the test.
 */

describe('the kernel loads', () => {
  it.each(['../pyjson.ts', '../kernel.ts', '../cli.ts'])('%s', async module => {
    await expect(import(module)).resolves.toBeDefined();
  });

  it('the four profiles are built, each with the ceiling of its mode', async () => {
    const { PROFILES } = await import('../kernel.ts');
    const { plainJson } = await import('../pyjson.ts');
    const ceiling = (profile: string) => plainJson(PROFILES.get(profile)?.get('permission_ceiling') ?? null);
    const all = (open: boolean) =>
      `{"dependency_change": ${open}, "schema_change": ${open}, "data_migration": ${open}, "external_side_effect": ${open}}`;
    expect(ceiling('supervised-local/v1')).toBe(all(true));
    expect(ceiling('orchestrated-assisted/v1')).toBe(all(false));
    expect(ceiling('orchestrated-autonomous/v1')).toBe(all(false));
    expect(ceiling('unattended/v1')).toBe(all(false));
  });
});
