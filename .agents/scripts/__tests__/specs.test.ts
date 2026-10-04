import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { audit, citedIds, readCorpus, type SourceFile } from '../specs.ts';

/** A minimal valid spec, with the given status and headings. */
function spec(folder: string, code: string, status: string, body: string): SourceFile {
  const text = `---\nschema_version: 1\ncapability_id: CAP-${code}\nstatus: ${status}\nowner: x\nprovenance: x\n---\n\n${body}`;
  return { path: `specs/${folder}/${folder}.md`, text };
}
const BASE = '### BR-ABC-001 — a rule\n\n### AC-ABC-001 — a criterion *(verifies BR-ABC-001)*\n';
/** A test file with a single title. */
const testFile = (title: string): SourceFile => ({ path: 'src/__tests__/x.test.ts', text: `it('${title}', () => {});` });
/**
 * An ID built at run time. Written literally in a title, the real gate would read it as a
 * citation from this file to a criterion that does not exist.
 */
const ac = (n: number) => ['AC', 'ABC', String(n).padStart(3, '0')].join('-');

describe('audit: shape', () => {
  it('a valid draft spec with no tests only reports', () => {
    expect(audit([spec('alpha', 'ABC', 'draft', BASE)], [])).toEqual({
      findings: [],
      report: ['specs/alpha/alpha.md: 0/1 criteria with a test'],
    });
  });

  it('files of the previous regime are red anywhere under specs/', () => {
    const { findings } = audit([{ path: 'specs/alpha/tasks.md', text: '' }, { path: 'specs/_template/plan.md', text: '' }], []);
    expect(findings).toHaveLength(2);
  });

  it('ignores the template, files outside specs/ and companion files', () => {
    const files = [
      { path: 'specs/_template/capability-spec.md', text: '' },
      { path: 'docs/alpha.md', text: '' },
      { path: 'specs/README.md', text: '' },
      { path: 'specs/alpha/tables/values.md', text: '' },
    ];
    expect(audit(files, [])).toEqual({ findings: [], report: [] });
  });

  it('no frontmatter', () => {
    const { findings } = audit([{ path: 'specs/alpha/alpha.md', text: BASE }], []);
    expect(findings).toContain('specs/alpha/alpha.md: missing frontmatter');
  });

  it('incomplete frontmatter, invalid code and invalid status', () => {
    const text = '---\n# a note\ncapability_id: CAP-abcd\nstatus: done\n---\n' + BASE;
    const { findings } = audit([{ path: 'specs/alpha/alpha.md', text }], []);
    expect(findings).toEqual(expect.arrayContaining([
      'specs/alpha/alpha.md: frontmatter has no `schema_version`',
      'specs/alpha/alpha.md: `capability_id` is not CAP-XXX: `CAP-abcd`',
      'specs/alpha/alpha.md: `status` is not draft, ratified or superseded: `done`',
    ]));
  });

  it('IDs with another code, repeated, retired, with no rule or with a missing rule', () => {
    const body = [
      '### BR-ABC-001 — r', '### BR-ABC-001 — r again', '### BR-XYZ-002 — foreign',
      '### AC-ABC-001 — no rule', '### AC-ABC-002 — gone *(verifies BR-ABC-001)* *Retired*',
      '### AC-ABC-003 — ghost *(verifies BR-ABC-009)*',
    ].join('\n');
    const { findings } = audit([spec('alpha', 'ABC', 'draft', body)], []);
    expect(findings).toEqual([
      'specs/alpha/alpha.md: `BR-ABC-001` appears twice',
      'specs/alpha/alpha.md: `BR-XYZ-002` does not carry the code `ABC`',
      'specs/alpha/alpha.md: `AC-ABC-001` names no rule it verifies',
      'specs/alpha/alpha.md: `AC-ABC-002` is marked as retired; delete it',
      'specs/alpha/alpha.md: `AC-ABC-003` verifies `BR-ABC-009`, which does not exist',
    ]);
  });

  it('a spec with no criteria', () => {
    const { findings } = audit([spec('alpha', 'ABC', 'draft', '### BR-ABC-001 — r')], []);
    expect(findings).toEqual(['specs/alpha/alpha.md: has no acceptance criteria']);
  });

  it('two specs with the same code', () => {
    const { findings } = audit([spec('alpha', 'ABC', 'draft', BASE), spec('beta', 'ABC', 'draft', BASE)], []);
    expect(findings).toEqual(['specs/beta/beta.md: the code `ABC` already belongs to specs/alpha/alpha.md']);
  });
});

describe('audit: the link between criterion and test', () => {
  it('a ratified spec with an untested criterion is red', () => {
    const { findings } = audit([spec('alpha', 'ABC', 'ratified', BASE)], []);
    expect(findings).toEqual(['specs/alpha/alpha.md: is `ratified` and no test cites `AC-ABC-001`']);
  });

  it('a fully cited ratified spec passes, and a complete draft says it is ready to ratify', () => {
    expect(audit([spec('alpha', 'ABC', 'ratified', BASE)], [testFile(`${ac(1)} — something`)]).findings).toEqual([]);
    expect(audit([spec('alpha', 'ABC', 'draft', BASE)], [testFile(`${ac(1)} — something`)]).report).toEqual([
      'specs/alpha/alpha.md: 1/1 criteria with a test — ready to ratify',
    ]);
  });

  it('a superseded spec is not counted, and its code need not be valid', () => {
    const text = '---\nschema_version: 1\ncapability_id: x\nstatus: superseded\nowner: x\nprovenance: x\n---\n' + BASE;
    const { report } = audit([{ path: 'specs/alpha/alpha.md', text }], []);
    expect(report).toEqual([]);
  });

  it('citing a criterion that does not exist is red', () => {
    const { findings } = audit([spec('alpha', 'ABC', 'draft', BASE)], [testFile(`${ac(777)} — ghost`)]);
    expect(findings).toEqual(['a test cites `AC-ABC-777`, which no spec declares']);
  });
});

describe('citedIds: only the title counts', () => {
  it('the title of describe, it, test, each, skipIf and runIf, with any quote', () => {
    const text = [
      `describe("${ac(1)} and ${ac(2)}", () => {`,
      `  it.each([1, 2])('${ac(3)} — %s', () => {});`,
      '  test(`' + ac(4) + ' — with \\` inside`, () => {});',
      `  // ${ac(5)} in a comment does not count`,
      `  it('no citation', () => { expect('${ac(6)}').toBe(1); });`,
      `  it.skipIf(SLOW)('${ac(7)} — measured', () => {});`,
      `  test.runIf(FAST)("${ac(8)} — measured", () => {});`,
    ].join('\n');
    expect([...citedIds(text)].sort()).toEqual([ac(1), ac(2), ac(3), ac(4), ac(7), ac(8)]);
  });
});

describe('readCorpus', () => {
  it('reads specs/ and tests by suffix, skipping copies and dependencies', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'corpus-'));
    const write = (rel: string, text = '') => {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), text);
    };
    write('specs/alpha/alpha.md', 'x');
    write('specs/alpha/notes.txt');
    write('src/a/__tests__/b.test.ts', 'y');
    write('src/a/__tests__/c.browser.test.tsx');
    write('src/a/d.ts');
    write('node_modules/x/e.test.ts');
    write('.claude/skills/s/f.test.ts');
    write('.agents/skills/s/g.test.ts');
    const { specs, tests } = readCorpus(root);
    expect(specs).toEqual([{ path: 'specs/alpha/alpha.md', text: 'x' }]);
    expect(tests.map(t => t.path).sort()).toEqual(['src/a/__tests__/b.test.ts', 'src/a/__tests__/c.browser.test.tsx']);
    rmSync(root, { recursive: true, force: true });
  });
});
