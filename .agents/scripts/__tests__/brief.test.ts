import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  fillNumber, findTemplate, problems, realDraftSystem, run, stripFrontMatter, USAGE, type DraftSystem,
} from '../brief.ts';

const ROOT = path.resolve('/repo');
const TEMPLATE_FILE = path.join(ROOT, '.github', 'ISSUE_TEMPLATE', 'task-brief.md');

const TEMPLATE = `---
name: Task brief
about: One change.
---

<!-- An issue is a small plan. -->

# <What changes>

## Context

- **Goal:** one sentence.
- **Branch:** \`<type>/<issue>-<kebab>\`

## Acceptance criteria

<!-- Binary, with the deciding values.
     They die with the issue. -->

- [ ] <...>

## Verification

1. \`pnpm verify\`
`;

const FILLED = `# The dock snaps to the grid

## Context

- **Goal:** the dock lands on a cell.
- **Branch:** \`feature/<issue>-dock-snaps\`

## Acceptance criteria

- [ ] A drop at 0.4 cells lands on the cell.

## Verification

1. \`pnpm verify\`
`;

function fakeSystem(files: Record<string, string> = { [TEMPLATE_FILE]: TEMPLATE }) {
  const disk = new Map(Object.entries(files));
  const out: string[] = [];
  const err: string[] = [];
  const sys: DraftSystem = {
    isDir: target => [...disk.keys()].some(file => file.startsWith(target + path.sep)),
    exists: target => disk.has(target),
    read(file) {
      const text = disk.get(file);
      if (text === undefined) throw new Error(`ENOENT ${file}`);
      return text;
    },
    write: (file, text) => void disk.set(file, text),
    out: line => void out.push(line),
    err: line => void err.push(line),
  };
  return { sys, disk, out, err };
}

const DRAFT = path.join(ROOT, 'tmp', 'draft.md');
const bare = stripFrontMatter(TEMPLATE);

describe('findTemplate', () => {
  it('searches upwards from a skill folder', () => {
    const { sys } = fakeSystem();
    expect(findTemplate(path.join(ROOT, '.claude', 'skills', 'to-issue', 'scripts'), target => sys.isDir(target))).toBe(TEMPLATE_FILE);
  });

  it('returns null when no folder above holds the template', () => {
    expect(findTemplate(ROOT, () => false)).toBeNull();
  });
});

describe('stripFrontMatter', () => {
  it('drops the front matter and the blank lines after it', () => {
    expect(bare.startsWith('<!-- An issue')).toBe(true);
  });

  it('leaves a text without front matter, or with an unclosed one, as is', () => {
    expect(stripFrontMatter('# Title\n')).toBe('# Title\n');
    expect(stripFrontMatter('---\nname: x\n')).toBe('---\nname: x\n');
  });
});

describe('problems', () => {
  it('a filled draft has none before publishing, and only the number after', () => {
    expect(problems(FILLED, bare, false)).toEqual([]);
    expect(problems(FILLED, bare)).toEqual(['line 6: placeholder <issue> is still unfilled']);
    expect(problems(fillNumber(FILLED, 42), bare)).toEqual([]);
  });

  it('the raw template reports every placeholder once per line, and the copied fields', () => {
    const found = problems(bare, bare, false);
    expect(found).toContain('line 3: placeholder <What changes> is still unfilled');
    expect(found).toContain('line 8: placeholder <type> is still unfilled');
    expect(found).toContain('line 8: placeholder <kebab> is still unfilled');
    expect(found).toContain('field left as in the template: - **Goal:** one sentence.');
    expect(found.filter(p => p.includes('<...>'))).toHaveLength(1);
  });

  it('names a missing section and an invented one', () => {
    const draft = FILLED.replace('## Verification', '## Notes');
    expect(problems(draft, bare, false)).toEqual([
      'missing section "## Verification"',
      'section "## Notes" is not in the template',
    ]);
  });

  it('reports the order only when the set of sections is right', () => {
    const draft = `# T\n\n## Verification\n\n## Context\n\n## Acceptance criteria\n`;
    expect(problems(draft, bare, false)).toEqual([
      "sections are out of the template's order: Context, Acceptance criteria, Verification",
    ]);
  });

  it('wants exactly one title, and ignores what lives in a comment', () => {
    expect(problems(FILLED.replace('# The dock', '<!-- # The dock -->'), bare, false)).toEqual([
      'there must be exactly one "# ..." title, and there are 0',
    ]);
    expect(problems(`# Other\n${FILLED}`, bare, false)).toEqual([
      'there must be exactly one "# ..." title, and there are 2',
    ]);
  });

  it('a multi-line comment keeps the line numbers of the file', () => {
    const draft = FILLED.replace('## Acceptance criteria\n', '## Acceptance criteria\n<!-- a\nb -->\n<x>\n');
    expect(problems(draft, bare, false)).toEqual(['line 11: placeholder <x> is still unfilled']);
  });
});

describe('run', () => {
  it('rejects a bad usage with 2', () => {
    for (const args of [[], ['new'], ['erase', 'f'], ['number', 'f'], ['number', 'f', 'x'], ['check', 'f', '1']]) {
      const { sys, err } = fakeSystem();
      expect(run(args, ROOT, sys)).toBe(2);
      expect(err).toEqual([USAGE]);
    }
  });

  it('fails with 2 when no template is found', () => {
    const { sys, err } = fakeSystem({});
    expect(run(['check', DRAFT], ROOT, sys)).toBe(2);
    expect(err[0]).toMatch(/^no \.github\/ISSUE_TEMPLATE\/task-brief\.md above/);
  });

  it('new copies the template without its front matter, and never overwrites', () => {
    const { sys, disk, out, err } = fakeSystem();
    expect(run(['new', DRAFT], ROOT, sys)).toBe(0);
    expect(disk.get(DRAFT)).toBe(bare);
    expect(out).toEqual([`Draft created from the template: ${DRAFT}`]);
    expect(run(['new', DRAFT], ROOT, sys)).toBe(1);
    expect(err).toEqual([`${DRAFT} already exists: a draft is never overwritten.`]);
  });

  it('check passes a filled draft, CRLF included, and lists the problems of a fresh one', () => {
    const { sys, out, err } = fakeSystem({ [TEMPLATE_FILE]: TEMPLATE.replaceAll('\n', '\r\n'), [DRAFT]: FILLED.replaceAll('\n', '\r\n') });
    expect(run(['check', DRAFT], ROOT, sys)).toBe(0);
    expect(out).toEqual([`${DRAFT} follows the template.`]);
    sys.write(DRAFT, bare);
    expect(run(['check', DRAFT], ROOT, sys)).toBe(1);
    expect(err[0]).toBe(`${DRAFT} does not follow the template:`);
    expect(err).toContain('  - line 3: placeholder <What changes> is still unfilled');
  });

  it('number writes the number and then checks without tolerating anything', () => {
    const { sys, disk, err } = fakeSystem({ [TEMPLATE_FILE]: TEMPLATE, [DRAFT]: FILLED });
    expect(run(['number', DRAFT, '42'], ROOT, sys)).toBe(0);
    expect(disk.get(DRAFT)).toContain('`feature/42-dock-snaps`');
    sys.write(DRAFT, FILLED.replace('## Verification', '## Notes'));
    expect(run(['number', DRAFT, '7'], ROOT, sys)).toBe(1);
    expect(err).toContain('  - missing section "## Verification"');
  });
});

describe('realDraftSystem', () => {
  it('reads, writes with its parent folders, and tells files from folders', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'brief-'));
    const sys = realDraftSystem();
    const file = path.join(root, 'a', 'b', 'draft.md');
    sys.write(file, 'text');
    expect(readFileSync(file, 'utf8')).toBe('text');
    expect(sys.read(file)).toBe('text');
    expect(sys.exists(file)).toBe(true);
    expect(sys.isDir(path.join(root, 'a'))).toBe(true);
    expect(sys.isDir(file)).toBe(false);
    expect(sys.isDir(path.join(root, 'nope'))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it('out and err write to the console', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sys = realDraftSystem();
    sys.out('a');
    sys.err('b');
    expect(log).toHaveBeenCalledWith('a');
    expect(error).toHaveBeenCalledWith('b');
    log.mockRestore();
    error.mockRestore();
  });

  it('runs end to end on a real template', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'brief-'));
    mkdirSync(path.join(root, '.github', 'ISSUE_TEMPLATE'), { recursive: true });
    writeFileSync(path.join(root, '.github', 'ISSUE_TEMPLATE', 'task-brief.md'), TEMPLATE);
    const draft = path.join(root, 'draft.md');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(run(['new', draft], path.join(root, 'deep', 'dir'), realDraftSystem())).toBe(0);
    expect(readFileSync(draft, 'utf8')).toBe(bare);
    log.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });
});

describe('task-brief.ts', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../brief.ts');
    process.exitCode = undefined;
  });

  it('returns the exit code of the run', async () => {
    vi.doMock('../brief.ts', () => ({ run: () => 2, realDraftSystem: () => ({}) }));
    await import('../task-brief.ts');
    expect(process.exitCode).toBe(2);
  });
});
