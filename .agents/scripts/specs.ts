import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The spec gate: the shape of the `specs/` corpus, and the link between each criterion and its test.
 *
 * It verifies the CITATION, not that the test exercises the criterion. Review checks that.
 */

/** A corpus file: POSIX path relative to the root, and its text. */
export interface SourceFile { readonly path: string; readonly text: string }

/** `findings` turn the gate red. `report` only informs. */
export interface Audit { readonly findings: readonly string[]; readonly report: readonly string[] }

export const STATUSES = ['draft', 'ratified', 'superseded'] as const;
/** The files of the previous spec regime. They do not come back. */
export const FORBIDDEN = ['spec.md', 'research.md', 'plan.md', 'tasks.md'] as const;
const FIELDS = ['schema_version', 'capability_id', 'status', 'owner', 'provenance'] as const;
const AC = /\bAC-[A-Z]{3}-\d{3}\b/g;

interface Spec {
  readonly file: string;
  readonly code: string | null;
  readonly status: string;
  readonly criteria: readonly string[];
}

/** The flat frontmatter: `key: value` lines between two `---`. `null` if there is none. */
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

/** Reads one spec and adds to `findings` what breaks the shape. */
function readSpec(file: SourceFile, findings: string[]): Spec {
  const fields = frontmatter(file.text);
  if (fields === null) findings.push(`${file.path}: missing frontmatter`);
  for (const f of FIELDS) if (fields !== null && !fields.has(f)) findings.push(`${file.path}: frontmatter has no \`${f}\``);
  const id = fields?.get('capability_id') ?? '';
  const match = /^CAP-([A-Z]{3})$/.exec(id);
  const code = match === null ? null : match[1];
  if (fields !== null && code === null) findings.push(`${file.path}: \`capability_id\` is not CAP-XXX: \`${id}\``);
  const status = fields?.get('status') ?? '';
  if (fields !== null && !(STATUSES as readonly string[]).includes(status)) findings.push(`${file.path}: \`status\` is not draft, ratified or superseded: \`${status}\``);

  const rules = new Set<string>();
  const criteria: string[] = [];
  const seen = new Set<string>();
  const verifies: [string, string[]][] = [];
  for (const line of file.text.split(/\r?\n/)) {
    const h = /^###\s+((?:BR|AC)-([A-Z]{3})-\d{3})\b(.*)$/.exec(line);
    if (h === null) continue;
    const [, heading, headingCode, rest] = h;
    if (code !== null && headingCode !== code) findings.push(`${file.path}: \`${heading}\` does not carry the code \`${code}\``);
    if (seen.has(heading)) findings.push(`${file.path}: \`${heading}\` appears twice`);
    seen.add(heading);
    // Retiring is deleting: a retired ID does not stay written.
    if (/\bretired\b/i.test(rest)) findings.push(`${file.path}: \`${heading}\` is marked as retired; delete it`);
    if (heading.startsWith('BR-')) {
      rules.add(heading);
      continue;
    }
    criteria.push(heading);
    const listed = /\(verifies ([^)]*)\)/.exec(rest)?.[1].match(/BR-[A-Z]{3}-\d{3}/g) ?? [];
    if (listed.length === 0) findings.push(`${file.path}: \`${heading}\` names no rule it verifies`);
    verifies.push([heading, listed]);
  }
  for (const [criterion, listed] of verifies) {
    for (const br of listed) if (!rules.has(br)) findings.push(`${file.path}: \`${criterion}\` verifies \`${br}\`, which does not exist`);
  }
  if (criteria.length === 0) findings.push(`${file.path}: has no acceptance criteria`);
  return { file: file.path, code, status, criteria };
}

/** The IDs cited in a test title: the first string argument of `describe`, `it` or `test`. */
export function citedIds(text: string): Set<string> {
  const cited = new Set<string>();
  const titles = /\b(?:describe|it|test)(?:\.each\([\s\S]*?\))?\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;
  for (const m of text.matchAll(titles)) for (const id of m[2].match(AC) ?? []) cited.add(id);
  return cited;
}

/** The gate verdict on a corpus. Pure: it does not read the disk. */
export function audit(specs: readonly SourceFile[], tests: readonly SourceFile[]): Audit {
  const findings: string[] = [];
  const report: string[] = [];
  const corpus: Spec[] = [];

  for (const file of specs) {
    const parts = file.path.split('/');
    if (parts[0] !== 'specs' || parts.length < 2) continue;
    const name = parts[parts.length - 1];
    if ((FORBIDDEN as readonly string[]).includes(name)) {
      findings.push(`${file.path}: belongs to the previous spec regime; the contract lives in \`specs/<capability>/<capability>.md\``);
      continue;
    }
    // `_template/` and `__tests__/` are not capabilities.
    if (parts[1].startsWith('_')) continue;
    if (parts.length === 3 && name === `${parts[1]}.md`) corpus.push(readSpec(file, findings));
  }

  const owners = new Map<string, string>();
  for (const spec of corpus) {
    if (spec.code === null) continue;
    const other = owners.get(spec.code);
    if (other !== undefined) findings.push(`${spec.file}: the code \`${spec.code}\` already belongs to ${other}`);
    owners.set(spec.code, spec.file);
  }

  const cited = new Set<string>();
  for (const test of tests) for (const id of citedIds(test.text)) cited.add(id);
  const existing = new Set(corpus.flatMap(s => s.criteria));
  for (const id of [...cited].sort()) if (!existing.has(id)) findings.push(`a test cites \`${id}\`, which no spec declares`);

  for (const spec of corpus) {
    if (spec.status === 'superseded') continue;
    const missing = spec.criteria.filter(c => !cited.has(c));
    const covered = spec.criteria.length - missing.length;
    if (spec.status === 'ratified') {
      for (const c of missing) findings.push(`${spec.file}: is \`ratified\` and no test cites \`${c}\``);
    } else {
      report.push(`${spec.file}: ${covered}/${spec.criteria.length} criteria with a test${missing.length === 0 ? ' — ready to ratify' : ''}`);
    }
  }
  return { findings, report };
}

/** Folders that are not part of the repo, or that hold generated copies. */
const SKIPPED = new Set(['node_modules', '.git', 'dist', 'coverage', '.claude', '.codex', '.vercel']);

/** Every file under `dir`, as POSIX paths relative to `root`. */
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

/** The repo corpus: all of `specs/`, and every test by its suffix (not by a list of roots). */
export function readCorpus(root: string): { specs: SourceFile[]; tests: SourceFile[] } {
  const read = (rel: string): SourceFile => ({ path: rel, text: readFileSync(path.join(root, rel), 'utf8') });
  const files = walk(root, '');
  return {
    specs: files.filter(f => f.startsWith('specs/') && f.endsWith('.md')).map(read),
    tests: files.filter(f => /\.test\.tsx?$/.test(f) && !f.startsWith('.agents/skills/')).map(read),
  };
}
