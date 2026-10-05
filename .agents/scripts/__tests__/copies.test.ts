import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MODULES_DOC, modulesDoc } from '../modules.ts';
import { COPIES, GENERATED_MARK, codexAgent, contractSection, differences, planCopies, realDisk, rebaseLinks, ruleFolders, sync, type Disk, type Tree } from '../copies.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const sources = (): [string, string][] => [...COPIES.keys()].map(p => [p, `// ${p}\n`]);
const rule = (paths: string[], body: string) => `---\npaths:\n${paths.map(p => `  - "${p}"`).join('\n')}\n---\n\n${body}`;

const AGENT = '---\nname: reviewer\ndescription: "Reviews one exact candidate."\neffort: max\nisolation: worktree\n---\n\n# Reviewer\n\nRead `AGENTS.md`.\n';

function fakeDisk(initial: Tree) {
  const files = new Map(initial);
  const log: string[] = [];
  const disk: Disk = {
    read: () => new Map(files),
    write: (f, t) => { files.set(f, t); },
    remove: f => { files.delete(f); },
    log: l => log.push(l),
  };
  return { disk, files, log };
}

describe('ruleFolders: the static prefix of each glob, minimal cover', () => {
  it.each([
    [['src/audio/**/*.ts', 'src/components/Spectrum.tsx'], ['src/audio', 'src/components']],
    [['src/playback/**', 'src/spectrum/Spectrum.tsx', 'src/**/*.tsx'], ['src']],
    [['src/**/*.{ts,tsx}', 'src/components/**/*.tsx', 'mcp-server/src/**/*.ts'], ['mcp-server/src', 'src']],
    [['specs/**'], ['specs']],
    [['README.md'], ['']],
  ])('%j → %j', (paths, expected) => {
    expect(ruleFolders(rule(paths, 'x'))).toEqual(expected);
  });
  it('a rule without frontmatter applies nowhere', () => {
    expect(ruleFolders('# no frontmatter')).toEqual([]);
  });
  it('reads CRLF files', () => {
    expect(ruleFolders(rule(['src/domain/**/*.ts'], 'x').replaceAll('\n', '\r\n'))).toEqual(['src/domain']);
  });
});

describe('rebaseLinks', () => {
  it('moves relative links and keeps anchors, URLs and in-page anchors', () => {
    const text = '[a](../../docs/x.md) [b](../../docs/x.md#part) [c](https://e.org/y) [d](#top) [e](mailto:x@y.z)';
    expect(rebaseLinks(text, '.agents/rules', 'src/components')).toBe(
      '[a](../../docs/x.md) [b](../../docs/x.md#part) [c](https://e.org/y) [d](#top) [e](mailto:x@y.z)',
    );
    expect(rebaseLinks(text, '.agents/rules', 'src')).toContain('[a](../docs/x.md) [b](../docs/x.md#part)');
  });
});

describe('planCopies', () => {
  it('mirrors skills and rules, carries declared copies, and maps agents to both harnesses', () => {
    const plan = planCopies(new Map([
      ...sources(),
      ['.agents/skills/shape/SKILL.md', 'skill\r\n'],
      ['.agents/rules/domain.md', rule(['src/domain/**/*.ts'], '# Domain\n')],
      ['agents/reviewer.md', AGENT],
      ['agents/notes/readme.md', 'nested files are not agents'],
    ]));
    expect(plan.problems).toEqual([]);
    expect(plan.files.get('.claude/skills/shape/SKILL.md')).toBe('skill\n');
    expect(plan.files.get('.claude/rules/domain.md')).toBe(rule(['src/domain/**/*.ts'], '# Domain\n'));
    expect(plan.files.get('.claude/agents/reviewer.md')).toBe(AGENT);
    expect(plan.files.get('.codex/agents/reviewer.toml')).toBe(codexAgent('reviewer', AGENT).toml);
    expect(plan.files.has('.codex/agents/readme.toml')).toBe(false);
    expect(plan.files.has('.claude/agents/notes/readme.md')).toBe(false);
    for (const [from, targets] of COPIES) {
      for (const to of targets) {
        expect(plan.files.get(to)).toBe(`// ${from}\n`);
        expect(plan.files.get(to.replace('.agents/skills/', '.claude/skills/'))).toBe(`// ${from}\n`);
      }
    }
  });

  it('writes one AGENTS.md per folder, joining the rules that apply there', () => {
    const plan = planCopies(new Map([
      ...sources(),
      ['.agents/rules/b.md', rule(['src/**/*.ts'], '# B\n')],
      ['.agents/rules/a.md', rule(['src/App.tsx'], '# A\n')],
    ]));
    const agents = plan.files.get('src/AGENTS.md') ?? '';
    expect(agents.startsWith(GENERATED_MARK)).toBe(true);
    expect(agents).toContain('`.agents/rules/a.md`, `.agents/rules/b.md`');
    expect(agents.indexOf('# A')).toBeLessThan(agents.indexOf('# B'));
    expect(agents).toContain('> Applies to `src/App.tsx`.\n\n# A');
  });

  it('writes the module map from the modules of `src/`, with CRLF read as LF', () => {
    const modules = (eol: string): [string, string][] => [['src/a/a.ts', `import { b } from './b.ts';${eol}`], ['src/a/b.ts', `export const b = 1;${eol}`]];
    expect(planCopies(new Map([...sources(), ...modules('\r\n')])).files.get(MODULES_DOC)).toBe(modulesDoc(new Map(modules('\n'))));
    expect(planCopies(new Map(sources())).files.has(MODULES_DOC)).toBe(false);
  });

  it('opens the AGENTS.md of a capability folder with its contract, then the rules that cover it', () => {
    const contract = (code: string) => `---\ncapability_id: CAP-${code}\nstatus: draft\n---\n\n# Capability: ${code}\n`;
    const plan = planCopies(new Map([
      ...sources(),
      ['specs/alpha/alpha.md', contract('ALP')],
      ['specs/beta/beta.md', contract('BET')],
      ['specs/_template/_template.md', contract('TPL')],
      ['specs/alpha/notes.md', 'a companion file'],
      ['.agents/rules/b.md', rule(['src/beta/**'], '# B\n')],
    ]));
    expect(plan.files.get('src/alpha/AGENTS.md')).toBe(
      `${GENERATED_MARK} from \`specs/alpha/alpha.md\`. Edit the source. -->\n\n${contractSection('alpha', contract('ALP'))}`);
    const beta = plan.files.get('src/beta/AGENTS.md') ?? '';
    expect(beta.startsWith(`${GENERATED_MARK} from \`specs/beta/beta.md\`, \`.agents/rules/b.md\`.`)).toBe(true);
    expect(beta.indexOf('# Capability: BET')).toBeLessThan(beta.indexOf('# B'));
    expect([...plan.files.keys()].filter(f => f.startsWith('src/')).sort()).toEqual(['src/alpha/AGENTS.md', 'src/beta/AGENTS.md']);
    expect(plan.problems).toEqual([]);
  });

  it('reports a missing source, a reach into another skill, an undeclared copy and a root rule', () => {
    const [first] = COPIES.keys();
    const plan = planCopies(new Map([
      ...sources().filter(([p]) => p !== first),
      ['.agents/skills/x/SKILL.md', 'see ../other-skill/file.md'],
      ['.agents/skills/x/scripts/' + path.posix.basename([...COPIES.keys()][1]), 'a stray copy'],
      ['.agents/rules/root.md', rule(['README.md'], '# Root\n')],
      ['.agents/rules/notes.txt', 'not a rule'],
      ['agents/loose.md', '# no frontmatter'],
    ]));
    expect(plan.files.get('.claude/agents/loose.md')).toBe('# no frontmatter');
    expect(plan.files.has('.codex/agents/loose.toml')).toBe(false);
    expect(plan.problems).toEqual([
      `${first}: declared as a canonical copy, but it does not exist`,
      '.agents/skills/x/SKILL.md: reaches into another skill with `../`; carry a declared copy instead',
      `.agents/skills/x/scripts/${path.posix.basename([...COPIES.keys()][1])}: has the name of \`${[...COPIES.keys()][1]}\` but is not a declared copy`,
      'agents/loose.md: has no frontmatter',
      '.agents/rules/root.md: applies to the repo root, whose AGENTS.md is written by hand',
    ]);
  });
});

describe('codexAgent: the TOML form of an agent contract', () => {
  it('carries the name, the description, the highest effort and the body', () => {
    expect(codexAgent('reviewer', AGENT)).toEqual({
      problems: [],
      toml: [
        '# Generated by `node .agents/scripts/sync.ts` from `agents/reviewer.md`. Edit the source.',
        'name = "reviewer"',
        'description = "Reviews one exact candidate."',
        'model_reasoning_effort = "max"',
        'sandbox_mode = "workspace-write"',
        '',
        "developer_instructions = '''",
        '# Reviewer',
        '',
        'Read `AGENTS.md`.',
        "'''",
        '',
      ].join('\n'),
    });
    expect(codexAgent('reviewer', AGENT.replaceAll('\n', '\r\n')).toml).toBe(codexAgent('reviewer', AGENT).toml);
  });

  it.each([
    [AGENT.replace('name: reviewer', 'name: other'), '`name` must be `reviewer`, the name of the file'],
    [AGENT.replace('name: reviewer\n', ''), '`name` must be `reviewer`, the name of the file'],
    [AGENT.replace('"Reviews one exact candidate."', 'Reviews one exact candidate.'), '`description` must be one double-quoted line, with no quote and no backslash inside'],
    [AGENT.replace(/description: .*\n/, ''), '`description` must be one double-quoted line, with no quote and no backslash inside'],
    [AGENT.replace('effort: max', 'effort: max\nmodel: opus'), 'pins a model: an internal agent inherits the model of the Owner'],
    [AGENT.replace('effort: max', 'effort: high'), 'must declare `effort: max`'],
    [AGENT.replace('Read `AGENTS.md`.', "A ''' block."), "holds `'''`, which a TOML literal string cannot carry"],
  ])('a contract that breaks one rule gets no TOML: %#', (contract, problem) => {
    expect(codexAgent('reviewer', contract)).toEqual({ toml: null, problems: [problem] });
  });
});

describe('contractSection', () => {
  const contract = (status: string) =>
    `---\nschema_version: 1\n# a note\ncapability_id: CAP-ABC\nstatus: ${status}\n---\n\n# Capability: alpha beta\n\nbody\n`;

  it('points the code folder at its contract, with its title and its code', () => {
    const section = contractSection('alpha', contract('draft')) ?? '';
    expect(section.startsWith('# Capability: alpha beta\n')).toBe(true);
    expect(section).toContain('[`specs/alpha/alpha.md`](../../specs/alpha/alpha.md), `CAP-ABC`');
    expect(section).toContain('`AC-ABC-###`');
    expect(section).toContain('[`src/AGENTS.md`](../AGENTS.md)');
  });

  it('a superseded contract gets no section, and a contract with no title uses the folder name', () => {
    expect(contractSection('alpha', contract('superseded'))).toBeNull();
    expect(contractSection('alpha', 'no frontmatter, no title')).toContain('# alpha\n');
  });
});

describe('differences', () => {
  const plan = { files: new Map([['.claude/rules/a.md', 'a\n'], ['src/AGENTS.md', `${GENERATED_MARK} x -->\n`]]), problems: [] };

  it('finds missing, different and stale files, ignoring line endings and hand-written files', () => {
    const disk = new Map([
      ['.claude/rules/a.md', 'a\r\n'],
      ['.claude/rules/old.md', 'old'],
      ['docs/AGENTS.md', `${GENERATED_MARK} y -->\n`],
      ['AGENTS.md', 'hand written'],
      ['src/app.ts', 'not managed'],
    ]);
    expect(differences(plan, disk)).toEqual([
      { kind: 'stale', path: '.claude/rules/old.md' },
      { kind: 'stale', path: 'docs/AGENTS.md' },
      { kind: 'missing', path: 'src/AGENTS.md' },
    ]);
    expect(differences(plan, new Map([['.claude/rules/a.md', 'b'], ['src/AGENTS.md', `${GENERATED_MARK} x -->\n`]]))).toEqual([
      { kind: 'different', path: '.claude/rules/a.md' },
    ]);
  });
});

describe('sync', () => {
  const tree = () => new Map([
    ...sources(),
    ['.agents/rules/r.md', rule(['src/**'], '# R\n')],
    ['.agents/rules/same.md', rule(['docs/**'], '# S\n')],
    ['.claude/rules/same.md', rule(['docs/**'], '# S\n')],
    ['.claude/rules/gone.md', 'x'],
  ]);

  it('--check lists each difference and exits 1, without writing', () => {
    const { disk, files, log } = fakeDisk(tree());
    expect(sync(['--check'], disk)).toBe(1);
    expect(log).toContain('stale: .claude/rules/gone.md');
    expect(log.at(-1)).toMatch(/Run `node \.agents\/scripts\/sync\.ts`/);
    expect(files.has('.claude/rules/r.md')).toBe(false);
  });

  it('writes and removes, and then --check is clean', () => {
    const { disk, files, log } = fakeDisk(tree());
    expect(sync([], disk)).toBe(0);
    expect(files.has('.claude/rules/gone.md')).toBe(false);
    expect(files.get('.claude/rules/r.md')).toBe(rule(['src/**'], '# R\n'));
    expect(log).toContain('removed .claude/rules/gone.md');
    expect(sync(['--check'], disk)).toBe(0);
  });

  it('a problem exits 1 in both modes and is logged', () => {
    const broken = new Map([...tree(), ['.agents/rules/root.md', rule(['x.md'], '# X\n')]]);
    const { disk, log } = fakeDisk(broken);
    expect(sync([], disk)).toBe(1);
    expect(sync(['--check'], disk)).toBe(1);
    expect(log).toContain('.agents/rules/root.md: applies to the repo root, whose AGENTS.md is written by hand');
  });
});

describe('realDisk', () => {
  it('reads canonical and managed trees, writes, removes and logs', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sync-'));
    const put = (rel: string, text: string) => {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), text);
    };
    put('.agents/rules/r.md', 'r');
    put('.claude/rules/r.md', 'copy');
    put('src/AGENTS.md', 'agents');
    put('node_modules/p/AGENTS.md', 'dependency');
    put('src/app.ts', 'module');
    put('src/__tests__/app.test.ts', 'not read');
    put('docs/architecture/modules.md', 'generated');
    put('docs/architecture/other.md', 'not read');
    put('specs/alpha/alpha.md', 'contract');
    put('specs/alpha/notes.md', 'companion, not read');
    const disk = realDisk(root);
    expect([...disk.read().keys()].sort()).toEqual(['.agents/rules/r.md', '.claude/rules/r.md', 'docs/architecture/modules.md', 'specs/alpha/alpha.md', 'src/AGENTS.md', 'src/app.ts']);
    disk.write('.claude/skills/s/SKILL.md', 'new');
    expect(readFileSync(path.join(root, '.claude/skills/s/SKILL.md'), 'utf8')).toBe('new');
    disk.remove('.claude/rules/r.md');
    expect(existsSync(path.join(root, '.claude/rules/r.md'))).toBe(false);
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    disk.log('hello');
    expect(out).toHaveBeenCalledWith('hello');
    out.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });
});

describe('the repo', () => {
  it('every generated copy matches its canonical source', () => {
    const log: string[] = [];
    const disk = { ...realDisk(ROOT), log: (l: string) => log.push(l) };
    expect(sync(['--check'], disk), log.join('\n')).toBe(0);
  });
});
