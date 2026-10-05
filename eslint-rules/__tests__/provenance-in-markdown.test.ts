import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve, relative } from 'node:path';
import { provenanceIn } from '../comment-anchor.mjs';

/**
 * No living `.md` names a spec of the old regime: `spec 031`, a bare `031`, `AC6`.
 *
 * `local/comment-anchor` holds the same check for the comments of the code. Without this gate
 * the number comes back in the next paragraph someone writes. The test lives here and not in
 * `docs/__tests__/` because it imports the patterns of the rule, a `.mjs`, and only the
 * tsconfig of this folder lets a `.ts` do that.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** What is not walked: installed code, build output, and the copies a generator writes. */
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'worktrees', '.stryker-tmp', 'reports', '.agent-runs']);
const GENERATED = [/^\.claude\/(skills|rules|agents)\//, /^\.codex\//, /.\/AGENTS\.md$/];

/**
 * The files that name an old number on purpose: the one table from a number to its issue, and
 * the rule that shows the forms the linter refuses.
 */
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

/**
 * The lines of a document, with the lines of its frontmatter emptied. The `provenance:` field of
 * a contract is the place where an old number belongs: it says which issues the contract
 * comes from.
 */
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
