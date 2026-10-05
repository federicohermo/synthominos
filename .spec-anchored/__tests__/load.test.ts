import { describe, it, expect } from 'vitest';

/** The import is inside the test: a defect at load then fails a test, and Stryker sees the mutant killed. */

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
