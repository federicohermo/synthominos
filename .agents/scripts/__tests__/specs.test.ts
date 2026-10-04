import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { audit, citedIds, readCorpus, type SourceFile } from '../specs.ts';

/** Un spec mínimo y válido, con el estado y los encabezados que se le pasen. */
function spec(folder: string, code: string, status: string, body: string): SourceFile {
  const text = `---\nschema_version: 1\ncapability_id: CAP-${code}\nstatus: ${status}\nowner: x\nprovenance: x\n---\n\n${body}`;
  return { path: `specs/${folder}/${folder}.md`, text };
}
const BASE = '### BR-ABC-001 — una regla\n\n### AC-ABC-001 — un criterio *(verifica BR-ABC-001)*\n';
/** Un archivo de test con un solo título. */
const testFile = (title: string): SourceFile => ({ path: 'src/__tests__/x.test.ts', text: `it('${title}', () => {});` });
/**
 * Un ID armado en tiempo de ejecución. Escrito literal en un título, el gate real lo leería
 * como una cita de este archivo a un criterio que no existe.
 */
const ac = (n: number) => ['AC', 'ABC', String(n).padStart(3, '0')].join('-');

describe('audit: la forma', () => {
  it('un spec válido en draft sin tests sólo informa', () => {
    expect(audit([spec('alfa', 'ABC', 'draft', BASE)], [])).toEqual({
      findings: [],
      report: ['specs/alfa/alfa.md: 0/1 criterios con test'],
    });
  });

  it('los archivos del régimen anterior dan rojo en cualquier lugar de specs/', () => {
    const { findings } = audit([{ path: 'specs/alfa/tasks.md', text: '' }, { path: 'specs/_template/plan.md', text: '' }], []);
    expect(findings).toHaveLength(2);
  });

  it('ignora la plantilla, lo que está fuera de specs/ y los archivos acompañantes', () => {
    const files = [
      { path: 'specs/_template/capability-spec.md', text: '' },
      { path: 'docs/alfa.md', text: '' },
      { path: 'specs/README.md', text: '' },
      { path: 'specs/alfa/tables/valores.md', text: '' },
    ];
    expect(audit(files, [])).toEqual({ findings: [], report: [] });
  });

  it('sin frontmatter', () => {
    const { findings } = audit([{ path: 'specs/alfa/alfa.md', text: BASE }], []);
    expect(findings).toContain('specs/alfa/alfa.md: falta el frontmatter');
  });

  it('frontmatter incompleto, código y estado inválidos', () => {
    const text = '---\n# una nota\ncapability_id: CAP-abcd\nstatus: listo\n---\n' + BASE;
    const { findings } = audit([{ path: 'specs/alfa/alfa.md', text }], []);
    expect(findings).toEqual(expect.arrayContaining([
      'specs/alfa/alfa.md: falta `schema_version` en el frontmatter',
      'specs/alfa/alfa.md: `capability_id` no es CAP-XXX: `CAP-abcd`',
      'specs/alfa/alfa.md: `status` no es draft, ratified ni superseded: `listo`',
    ]));
  });

  it('IDs con otro código, repetidos, retirados, sin regla o con una regla que no existe', () => {
    const body = [
      '### BR-ABC-001 — r', '### BR-ABC-001 — r otra vez', '### BR-XYZ-002 — ajena',
      '### AC-ABC-001 — sin regla', '### AC-ABC-002 — retirado *(verifica BR-ABC-001)* *Retirado*',
      '### AC-ABC-003 — fantasma *(verifica BR-ABC-009)*',
    ].join('\n');
    const { findings } = audit([spec('alfa', 'ABC', 'draft', body)], []);
    expect(findings).toEqual([
      'specs/alfa/alfa.md: `BR-ABC-001` aparece dos veces',
      'specs/alfa/alfa.md: `BR-XYZ-002` no lleva el código `ABC`',
      'specs/alfa/alfa.md: `AC-ABC-001` no nombra la regla que verifica',
      'specs/alfa/alfa.md: `AC-ABC-002` está marcado como retirado; se borra',
      'specs/alfa/alfa.md: `AC-ABC-003` verifica `BR-ABC-009`, que no existe',
    ]);
  });

  it('un spec sin criterios', () => {
    const { findings } = audit([spec('alfa', 'ABC', 'draft', '### BR-ABC-001 — r')], []);
    expect(findings).toEqual(['specs/alfa/alfa.md: no tiene ningún criterio de aceptación']);
  });

  it('dos specs con el mismo código', () => {
    const { findings } = audit([spec('alfa', 'ABC', 'draft', BASE), spec('beta', 'ABC', 'draft', BASE)], []);
    expect(findings).toEqual(['specs/beta/beta.md: el código `ABC` ya es de specs/alfa/alfa.md']);
  });
});

describe('audit: el ancla entre criterio y test', () => {
  it('un ratified con un criterio sin test da rojo', () => {
    const { findings } = audit([spec('alfa', 'ABC', 'ratified', BASE)], []);
    expect(findings).toEqual(['specs/alfa/alfa.md: es `ratified` y ningún test cita `AC-ABC-001`']);
  });

  it('un ratified con todo citado pasa, y un draft completo dice que es ratificable', () => {
    expect(audit([spec('alfa', 'ABC', 'ratified', BASE)], [testFile(`${ac(1)} — algo`)]).findings).toEqual([]);
    expect(audit([spec('alfa', 'ABC', 'draft', BASE)], [testFile(`${ac(1)} — algo`)]).report).toEqual([
      'specs/alfa/alfa.md: 1/1 criterios con test — ratificable',
    ]);
  });

  it('un superseded no se cuenta, y su código no tiene por qué ser válido', () => {
    const text = '---\nschema_version: 1\ncapability_id: x\nstatus: superseded\nowner: x\nprovenance: x\n---\n' + BASE;
    const { report } = audit([{ path: 'specs/alfa/alfa.md', text }], []);
    expect(report).toEqual([]);
  });

  it('citar un criterio que no existe da rojo', () => {
    const { findings } = audit([spec('alfa', 'ABC', 'draft', BASE)], [testFile(`${ac(777)} — fantasma`)]);
    expect(findings).toEqual(['un test cita `AC-ABC-777`, que no existe en ningún spec']);
  });
});

describe('citedIds: sólo el título cuenta', () => {
  it('el título de describe, it, test y each, con cualquier comilla', () => {
    const text = [
      `describe("${ac(1)} y ${ac(2)}", () => {`,
      `  it.each([1, 2])('${ac(3)} — %s', () => {});`,
      '  test(`' + ac(4) + ' — con \\` adentro`, () => {});',
      `  // ${ac(5)} en un comentario no cuenta`,
      `  it('sin cita', () => { expect('${ac(6)}').toBe(1); });`,
    ].join('\n');
    expect([...citedIds(text)].sort()).toEqual([ac(1), ac(2), ac(3), ac(4)]);
  });
});

describe('readCorpus', () => {
  it('lee specs/ y los tests por sufijo, salteando copias y dependencias', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'corpus-'));
    const write = (rel: string, text = '') => {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), text);
    };
    write('specs/alfa/alfa.md', 'x');
    write('specs/alfa/notas.txt');
    write('src/a/__tests__/b.test.ts', 'y');
    write('src/a/__tests__/c.browser.test.tsx');
    write('src/a/d.ts');
    write('node_modules/x/e.test.ts');
    write('.claude/skills/s/f.test.ts');
    write('.agents/skills/s/g.test.ts');
    const { specs, tests } = readCorpus(root);
    expect(specs).toEqual([{ path: 'specs/alfa/alfa.md', text: 'x' }]);
    expect(tests.map(t => t.path).sort()).toEqual(['src/a/__tests__/b.test.ts', 'src/a/__tests__/c.browser.test.tsx']);
    rmSync(root, { recursive: true, force: true });
  });
});
