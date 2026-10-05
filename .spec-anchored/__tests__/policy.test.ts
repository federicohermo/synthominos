import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PROFILES, hashJson, resolvePolicy, validateScope } from '../kernel.ts';
import { json, strictJsonLoads } from '../pyjson.ts';

const POLICY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../policy');
const read = (file: string) => readFileSync(path.join(POLICY, file), 'utf8');
const fileOf = (profile: string) => `profiles/${profile.replace('/', '-')}.json`;

describe('the profile files are the profiles of the kernel', () => {
  it('there is one file for each profile, and no other file', () => {
    expect(readdirSync(path.join(POLICY, 'profiles')).sort()).toEqual([...PROFILES.keys()].map(p => path.basename(fileOf(p))).sort());
  });

  it.each([...PROFILES.keys()])('%s: the file resolves to the profile', profile => {
    expect(hashJson(resolvePolicy(strictJsonLoads(read(fileOf(profile)))))).toBe(hashJson(resolvePolicy(profile)));
  });
});

describe('every instance in policy/ is a policy the kernel accepts', () => {
  const instances = readdirSync(path.join(POLICY, 'instances'));

  it.each(instances)('%s narrows a known profile', file => {
    const instance = strictJsonLoads(read(`instances/${file}`));
    const resolved = resolvePolicy(instance);
    expect(PROFILES.has(resolved.get('profile_id') as string)).toBe(true);
  });

  it('the example lets an autonomous run change its capability folder, and nothing else', () => {
    const policy = resolvePolicy(strictJsonLoads(read('instances/example-autonomous-circuit.json')));
    const manifest = json({
      schema_version: 1, run_id: 'RUN-001', capability: 'CAP-CIR', adapter: 'implement-orchestrated', execution_mode: 'autonomous',
      policy_profile: 'orchestrated-autonomous/v1', semantic_scope: { implements: [], verifies: ['AC-CIR-004'], non_goals: [] },
      mechanical_scope: {
        allowed_paths: ['src/circuit/**'], denied_paths: [],
        permissions: { dependency_change: false, schema_change: false, data_migration: false, external_side_effect: false },
      },
      truth_change: { policy: 'none', allowed_spec_paths: [] },
    });
    expect(validateScope(manifest, [['M', 'src/circuit/sequence.ts'], ['A', 'src/circuit/__tests__/tour.test.ts']], policy)).toEqual([]);
    expect(validateScope(manifest, [['M', 'src/playback/scheduler.ts']], policy)).toEqual(['src/playback/scheduler.ts: outside allowed_paths']);
    expect(validateScope(manifest, [['D', 'src/circuit/sequence.ts']], policy)).toEqual([
      "src/circuit/sequence.ts: operation 'D' is outside allowed_operations ['A', 'M']"]);
    expect(validateScope(manifest, [['M', 'specs/circuit/circuit.md']], policy)[0]).toContain("spec_semantics only as 'proposal-only'");
  });
});
