import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * El gate de specs: la forma del corpus de `specs/` y el ancla entre cada criterio y su test.
 *
 * Verifica la CITA, no que el test ejerza el criterio. Eso lo mira la revisión.
 */

/** Un archivo del corpus: ruta POSIX relativa a la raíz, y su texto. */
export interface SourceFile { readonly path: string; readonly text: string }

/** `findings` pone el gate en rojo. `report` sólo informa. */
export interface Audit { readonly findings: readonly string[]; readonly report: readonly string[] }

export const STATUSES = ['draft', 'ratified', 'superseded'] as const;
/** Los archivos del régimen anterior. No vuelven. */
export const FORBIDDEN = ['spec.md', 'research.md', 'plan.md', 'tasks.md'] as const;
const FIELDS = ['schema_version', 'capability_id', 'status', 'owner', 'provenance'] as const;
const AC = /\bAC-[A-Z]{3}-\d{3}\b/g;

interface Spec {
  readonly file: string;
  readonly code: string | null;
  readonly status: string;
  readonly rules: ReadonlySet<string>;
  readonly criteria: readonly string[];
}

/** El frontmatter plano: `clave: valor` entre dos `---`. `null` si no hay. */
function frontmatter(text: string): Map<string, string> | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (m === null) return null;
  const fields = new Map<string, string>();
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-z_]+):\s*(.*?)\s*$/.exec(line);
    if (kv !== null) fields.set(kv[1], kv[2]);
  }
  return fields;
}

/** Lee un spec y anota en `findings` lo que no cumple la forma. */
function readSpec(file: SourceFile, findings: string[]): Spec {
  const fields = frontmatter(file.text);
  if (fields === null) findings.push(`${file.path}: falta el frontmatter`);
  for (const f of FIELDS) if (fields !== null && !fields.has(f)) findings.push(`${file.path}: falta \`${f}\` en el frontmatter`);
  const id = fields?.get('capability_id') ?? '';
  const match = /^CAP-([A-Z]{3})$/.exec(id);
  const code = match === null ? null : match[1];
  if (fields !== null && code === null) findings.push(`${file.path}: \`capability_id\` no es CAP-XXX: \`${id}\``);
  const status = fields?.get('status') ?? '';
  if (fields !== null && !(STATUSES as readonly string[]).includes(status)) findings.push(`${file.path}: \`status\` no es draft, ratified ni superseded: \`${status}\``);

  const rules = new Set<string>();
  const criteria: string[] = [];
  const seen = new Set<string>();
  const verifies: [string, string[]][] = [];
  for (const line of file.text.split(/\r?\n/)) {
    const h = /^###\s+((?:BR|AC)-([A-Z]{3})-\d{3})\b(.*)$/.exec(line);
    if (h === null) continue;
    const [, heading, headingCode, rest] = h;
    if (code !== null && headingCode !== code) findings.push(`${file.path}: \`${heading}\` no lleva el código \`${code}\``);
    if (seen.has(heading)) findings.push(`${file.path}: \`${heading}\` aparece dos veces`);
    seen.add(heading);
    // Retirar es borrar: un criterio retirado no queda escrito.
    if (/retirad/i.test(rest)) findings.push(`${file.path}: \`${heading}\` está marcado como retirado; se borra`);
    if (heading.startsWith('BR-')) {
      rules.add(heading);
      continue;
    }
    criteria.push(heading);
    const listed = /\(verifica ([^)]*)\)/.exec(rest)?.[1].match(/BR-[A-Z]{3}-\d{3}/g) ?? [];
    if (listed.length === 0) findings.push(`${file.path}: \`${heading}\` no nombra la regla que verifica`);
    verifies.push([heading, listed]);
  }
  for (const [criterion, listed] of verifies) {
    for (const br of listed) if (!rules.has(br)) findings.push(`${file.path}: \`${criterion}\` verifica \`${br}\`, que no existe`);
  }
  if (criteria.length === 0) findings.push(`${file.path}: no tiene ningún criterio de aceptación`);
  return { file: file.path, code, status, rules, criteria };
}

/** Los IDs citados en el título de un test: el primer argumento string de `describe`, `it` o `test`. */
export function citedIds(text: string): Set<string> {
  const cited = new Set<string>();
  const titles = /\b(?:describe|it|test)(?:\.each\([\s\S]*?\))?\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;
  for (const m of text.matchAll(titles)) for (const id of m[2].match(AC) ?? []) cited.add(id);
  return cited;
}

/** El veredicto del gate sobre un corpus. Pura: no lee el disco. */
export function audit(specs: readonly SourceFile[], tests: readonly SourceFile[]): Audit {
  const findings: string[] = [];
  const report: string[] = [];
  const corpus: Spec[] = [];

  for (const file of specs) {
    const parts = file.path.split('/');
    if (parts[0] !== 'specs' || parts.length < 2) continue;
    const name = parts[parts.length - 1];
    if ((FORBIDDEN as readonly string[]).includes(name)) {
      findings.push(`${file.path}: es un archivo del régimen anterior; el contrato vive en \`specs/<capacidad>/<capacidad>.md\``);
      continue;
    }
    // `_template/` y `__tests__/` no son capacidades.
    if (parts[1].startsWith('_')) continue;
    if (parts.length === 3 && name === `${parts[1]}.md`) corpus.push(readSpec(file, findings));
  }

  const owners = new Map<string, string>();
  for (const spec of corpus) {
    if (spec.code === null) continue;
    const other = owners.get(spec.code);
    if (other !== undefined) findings.push(`${spec.file}: el código \`${spec.code}\` ya es de ${other}`);
    owners.set(spec.code, spec.file);
  }

  const cited = new Set<string>();
  for (const test of tests) for (const id of citedIds(test.text)) cited.add(id);
  const existing = new Set(corpus.flatMap(s => s.criteria));
  for (const id of [...cited].sort()) if (!existing.has(id)) findings.push(`un test cita \`${id}\`, que no existe en ningún spec`);

  for (const spec of corpus) {
    if (spec.status === 'superseded') continue;
    const missing = spec.criteria.filter(c => !cited.has(c));
    const covered = spec.criteria.length - missing.length;
    if (spec.status === 'ratified') {
      for (const c of missing) findings.push(`${spec.file}: es \`ratified\` y ningún test cita \`${c}\``);
    } else {
      report.push(`${spec.file}: ${covered}/${spec.criteria.length} criterios con test${missing.length === 0 ? ' — ratificable' : ''}`);
    }
  }
  return { findings, report };
}

/** Las carpetas que no son del repo, o que son copias generadas. */
const SKIPPED = new Set(['node_modules', '.git', 'dist', 'coverage', '.claude', '.codex', '.vercel']);

/** Todos los archivos bajo `dir`, como rutas POSIX relativas a `root`. */
function walk(root: string, dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir === '' ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name)) out.push(...walk(root, rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

/** El corpus del repo: todo `specs/`, y todo test por su sufijo (no por una lista de raíces). */
export function readCorpus(root: string): { specs: SourceFile[]; tests: SourceFile[] } {
  const read = (rel: string): SourceFile => ({ path: rel, text: readFileSync(path.join(root, rel), 'utf8') });
  const files = walk(root, '');
  return {
    specs: files.filter(f => f.startsWith('specs/') && f.endsWith('.md')).map(read),
    tests: files.filter(f => /\.test\.tsx?$/.test(f) && !f.startsWith('.agents/skills/')).map(read),
  };
}
