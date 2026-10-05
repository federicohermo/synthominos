import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Imports only `node:*`: the `to-issue` skill carries a byte-for-byte copy of this file.

export const TEMPLATE = ['.github', 'ISSUE_TEMPLATE', 'task-brief.md'] as const;

export const NUMBER = '<issue>';

export const USAGE = [
  'usage: node task-brief.ts new <file>       copy the template, without its front matter',
  '       node task-brief.ts check <file>     exit 1 and list each problem if the draft breaks the template',
  '       node task-brief.ts number <file> <n> write the issue number where the draft says <issue>, then check',
].join('\n');

const COMMENT = /<!--[\s\S]*?-->/g;
const PLACEHOLDER = /<[^<>\n!][^<>\n]*>/g;
const SECTION = /^## (.+)$/gm;
const TITLE = /^# (.+)$/gm;
const FIELD = /^- \*\*[^*]+:\*\*.*$/gm;

export interface DraftSystem {
  isDir(target: string): boolean;
  exists(target: string): boolean;
  read(file: string): string;
  /** Creates the parent folders. */
  write(file: string, text: string): void;
  out(line: string): void;
  err(line: string): void;
}

/** Searched upwards: the skill copy lives at another depth than the canonical. */
export function findTemplate(start: string, isDir: (target: string) => boolean): string | null {
  let current = path.resolve(start);
  for (;;) {
    if (isDir(path.join(current, TEMPLATE[0], TEMPLATE[1]))) return path.join(current, ...TEMPLATE);
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function stripFrontMatter(text: string): string {
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return text;
  return text.slice(end + '\n---'.length).replace(/^\n+/, '');
}

/** Each comment keeps its line breaks, so a reported line number is the file's. */
function withoutComments(text: string): string {
  return text.replace(COMMENT, comment => '\n'.repeat(comment.split('\n').length - 1));
}

function all(pattern: RegExp, text: string): string[] {
  return [...text.matchAll(pattern)].map(m => m[1] ?? m[0]);
}

export function fillNumber(draft: string, issue: number): string {
  return draft.replaceAll(NUMBER, String(issue));
}

export function problems(draft: string, template: string, published = true): string[] {
  const visible = withoutComments(draft);
  const bare = withoutComments(template);
  const found: string[] = [];

  const expected = all(SECTION, bare);
  const present = all(SECTION, visible);
  for (const section of expected) if (!present.includes(section)) found.push(`missing section "## ${section}"`);
  for (const section of present) if (!expected.includes(section)) found.push(`section "## ${section}" is not in the template`);
  if (found.length === 0 && present.join('\n') !== expected.join('\n')) {
    found.push(`sections are out of the template's order: ${expected.join(', ')}`);
  }

  const titles = all(TITLE, visible);
  if (titles.length !== 1) found.push(`there must be exactly one "# ..." title, and there are ${titles.length}`);

  visible.split('\n').forEach((line, index) => {
    for (const placeholder of new Set(line.match(PLACEHOLDER))) {
      if (placeholder === NUMBER && !published) continue;
      found.push(`line ${index + 1}: placeholder ${placeholder} is still unfilled`);
    }
  });

  const templateFields = new Set(all(FIELD, bare));
  for (const field of all(FIELD, visible)) {
    if (templateFields.has(field)) found.push(`field left as in the template: ${field}`);
  }
  return found;
}

function validUsage(args: readonly string[]): boolean {
  if (args.length === 2) return args[0] === 'new' || args[0] === 'check';
  return args.length === 3 && args[0] === 'number' && /^\d+$/.test(String(args[2]));
}

/** Python's universal newlines: a CRLF checkout must not split a section name. */
function readText(sys: DraftSystem, file: string): string {
  return sys.read(file).replaceAll('\r\n', '\n');
}

export function run(args: readonly string[], start: string, sys: DraftSystem): 0 | 1 | 2 {
  if (!validUsage(args)) {
    sys.err(USAGE);
    return 2;
  }
  const action = args[0];
  const file = String(args[1]);
  const templateFile = findTemplate(start, target => sys.isDir(target));
  if (templateFile === null) {
    sys.err(`no ${TEMPLATE.join('/')} above ${start}`);
    return 2;
  }
  const template = stripFrontMatter(readText(sys, templateFile));

  if (action === 'new') {
    if (sys.exists(file)) {
      sys.err(`${file} already exists: a draft is never overwritten.`);
      return 1;
    }
    sys.write(file, template);
    sys.out(`Draft created from the template: ${file}`);
    return 0;
  }

  let text = readText(sys, file);
  if (action === 'number') {
    text = fillNumber(text, Number(args[2]));
    sys.write(file, text);
  }
  const found = problems(text, template, action === 'number');
  if (found.length > 0) {
    sys.err(`${file} does not follow the template:`);
    for (const problem of found) sys.err(`  - ${problem}`);
    return 1;
  }
  sys.out(`${file} follows the template.`);
  return 0;
}

export function realDraftSystem(): DraftSystem {
  return {
    isDir: target => existsSync(target) && statSync(target).isDirectory(),
    exists: existsSync,
    read: file => readFileSync(file, 'utf8'),
    write(file, text) {
      mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      writeFileSync(file, text, 'utf8');
    },
    out: line => console.log(line),
    err: line => console.error(line),
  };
}
