import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve, relative } from 'node:path';
import { provenanceIn } from '../comment-anchor.mjs';

// It lives here because it imports the patterns of the rule, a `.mjs`: only the tsconfig of
// this folder lets a `.ts` do that.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'worktrees', '.stryker-tmp', 'reports', '.agent-runs']);
const GENERATED = [/^\.claude\/(skills|rules|agents)\//, /^\.codex\//, /.\/AGENTS\.md$/];

// The table from an old number to its issue, and the rule that shows the refused forms.
const ALLOWED = new Set([
  'docs/architecture/decisions/2026-10-04-contract-per-capability.md',
  '.agents/rules/comments.md',
]);

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (SKIPPED_DIRS.has(entry.name)) return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.md') ? [relative(ROOT, full).replaceAll('\\', '/')] : [];
  });

const FILES = walk(ROOT).filter(file => !GENERATED.some(pattern => pattern.test(file)) && !ALLOWED.has(file));

// The frontmatter is emptied: the `provenance:` field of a contract is where an old number belongs.
function bodyLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return lines;
  const end = lines.indexOf('---', 1);
  return lines.map((line, index) => (index <= end ? '' : line));
}

describe('no living document names a numbered spec', () => {
  it('the walk finds the documents', () => {
    // An empty list would make the gate below pass without reading a file.
    expect(FILES.length).toBeGreaterThan(30);
    expect(FILES).toContain('AGENTS.md');
    expect(FILES).toContain('specs/circuit/circuit.md');
  });

  it('each line of each document is clean', () => {
    const findings = FILES.flatMap(file =>
      bodyLines(readFileSync(join(ROOT, file), 'utf8')).flatMap((line, index) => {
        const form = provenanceIn(line);
        return form === null ? [] : [`${file}:${index + 1}: "${form}"`];
      }));
    expect(findings, 'name the rule itself, or a criterion with its capability code').toEqual([]);
  });
});
