import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), 'utf8');

// It throws: two missing values would be two equal `undefined`, and the gate would pass.
const extract = (text: string, pattern: RegExp, where: string) => {
  const m = pattern.exec(text);
  if (!m) throw new Error(`Branch model not found in ${where}`);
  return m[1];
};

const quoted = (text: string) => [...text.matchAll(/['`]([^'`]+)['`]/g)].map((m) => m[1]);

const asSet = (branches: string[]) => [...branches].sort();

// A pattern, not a parser: the repo has no YAML dependency. `branches:` must be the line right
// after `push:`.
const workflowBranches = (text: string, where: string) =>
  extract(text, /^\s*push:\s*\r?\n\s*branches:\s*\[([^\]]*)\]/m, where)
    .split(',')
    .map((branch) => branch.trim());

const verify = read('.github/workflows/verify.yml');
const policy = read('.agents/scripts/policy.ts');
const doc = read('docs/infra/branches.md');

const branchesPerDoc = (file: string) => {
  const row = new RegExp(`^\\|\\s*\`${file.replaceAll('.', '\\.')}\`\\s*\\|[^|]*\\|([^|]*)\\|`, 'm');
  return quoted(extract(doc, row, `docs/infra/branches.md, row of \`${file}\``));
};

const VERIFY_BRANCHES = workflowBranches(verify, '.github/workflows/verify.yml');
const SHARED = ['INTEGRATION_BRANCH', 'RELEASE_BRANCH'].map((name) =>
  extract(policy, new RegExp(`^export const ${name} = '([^']+)';`, 'm'), `.agents/scripts/policy.ts, \`${name}\``),
);

describe('the two-branch model says the same in the machinery and in the document', () => {
  it('both copies were read and are not empty', () => {
    expect([VERIFY_BRANCHES, SHARED].map((branches) => branches.length === 0)).toEqual([false, false]);
  });

  it('`verify.yml` runs on the branches the document names', () => {
    expect(asSet(VERIFY_BRANCHES)).toEqual(asSet(branchesPerDoc('.github/workflows/verify.yml')));
  });

  it('the hook names the branches the document names', () => {
    expect(asSet(SHARED)).toEqual(asSet(branchesPerDoc('.agents/scripts/policy.ts')));
  });

  it('every shared branch has its own `verify` run', () => {
    expect(asSet(SHARED)).toEqual(asSet(VERIFY_BRANCHES));
  });

  it('the document names both roles', () => {
    const staging = extract(doc, /^\|\s*`staging`\s*\|([^|]*)\|/m, 'docs/infra/branches.md, row of `staging`');
    const main = extract(doc, /^\|\s*`main`\s*\|([^|]*)\|/m, 'docs/infra/branches.md, row of `main`');
    expect(staging).toMatch(/Integration/);
    expect(staging).toMatch(/default/);
    expect(main).toMatch(/Release/);
  });

  it('the document states that nobody verifies the ruleset', () => {
    expect(doc).toMatch(/## What nobody verifies/);
  });
});

describe('the gate is falsified from the test itself, without mutating a repo file', () => {
  it('`extract` throws naming the file when the pattern does not match', () => {
    expect(() => extract('', /(matches nothing)/, 'an invented file')).toThrow('Branch model not found in an invented file');
  });

  it('an `on.push.branches` other than the one the document states is red', () => {
    const synthetic = workflowBranches('on:\n  push:\n    branches: [gh-pages]\n', 'a synthetic workflow');
    expect(asSet(synthetic)).not.toEqual(asSet(branchesPerDoc('.github/workflows/verify.yml')));
  });
});
