import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// The gate verifies the citation, not that the test exercises the criterion.

/** A corpus file: POSIX path relative to the root, and its text. */
export interface SourceFile { readonly path: string; readonly text: string }

/** `findings` turn the gate red. `report` only informs. */
export interface Audit { readonly findings: readonly string[]; readonly report: readonly string[] }

export const STATUSES = ['draft', 'ratified', 'superseded'] as const;
export const FORBIDDEN = ['spec.md', 'research.md', 'plan.md', 'tasks.md'] as const;
const FIELDS = ['schema_version', 'capability_id', 'status', 'owner', 'provenance'] as const;
export const SHELL = ['__tests__', 'styles'] as const;
export const TESTS = '__tests__';
const AC = /\bAC-[A-Z]{3}-\d{3}\b/g;

interface Spec {
  readonly file: string;
  readonly code: string | null;
  readonly status: string;
  readonly criteria: readonly string[];
}

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

export function citedIds(text: string): Set<string> {
  const cited = new Set<string>();
  const titles = /\b(?:describe|it|test)(?:\.(?:each|skipIf|runIf)\([\s\S]*?\))?\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;
  for (const m of text.matchAll(titles)) for (const id of m[2].match(AC) ?? []) cited.add(id);
  return cited;
}

function folderFindings(corpus: readonly Spec[], sources: readonly string[]): string[] {
  const findings: string[] = [];
  const folders = new Set<string>();
  const withCode = new Set<string>();
  for (const file of sources) {
    const parts = file.split('/');
    if (parts[0] !== 'src' || parts.length < 3 || (SHELL as readonly string[]).includes(parts[1])) continue;
    folders.add(parts[1]);
    if (parts.length === 3 && parts[2] === 'AGENTS.md') continue;
    withCode.add(parts[1]);
    if (parts.length > 3 && parts[2] !== TESTS) {
      findings.push(`${file}: lies in a subfolder; a capability is flat, with only ${TESTS}/ below it`);
    }
  }
  const live = corpus.filter(s => s.status !== 'superseded').map(s => s.file.split('/')[1]);
  for (const folder of [...folders].sort()) {
    if (!live.includes(folder)) findings.push(`src/${folder}/: no contract has its name; write specs/${folder}/${folder}.md`);
  }
  for (const capability of live) {
    if (!withCode.has(capability)) findings.push(`specs/${capability}/${capability}.md: has no code in src/${capability}/`);
  }
  return findings;
}

export function audit(specs: readonly SourceFile[], tests: readonly SourceFile[], sources: readonly string[]): Audit {
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
  findings.push(...folderFindings(corpus, sources));

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

const SKIPPED = new Set(['node_modules', '.git', 'dist', 'coverage', '.claude', '.codex', '.vercel']);

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

export function readCorpus(root: string): { specs: SourceFile[]; tests: SourceFile[]; sources: string[] } {
  const read = (rel: string): SourceFile => ({ path: rel, text: readFileSync(path.join(root, rel), 'utf8') });
  const files = walk(root, '');
  return {
    specs: files.filter(f => f.startsWith('specs/') && f.endsWith('.md')).map(read),
    tests: files.filter(f => /\.test\.tsx?$/.test(f) && !f.startsWith('.agents/skills/')).map(read),
    sources: files.filter(f => f.startsWith('src/')),
  };
}
