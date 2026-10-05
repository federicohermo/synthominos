import {
  PROFILES, hashJson, hashText, parseNameStatus, resolvePolicy, validateScope, verifyApproval, type ResolvedPolicy,
} from '../../.spec-anchored/kernel.ts';
import { ContractViolation, InputError, get, isDict, isStr, strictJsonLoads, type Json, type JsonObject } from '../../.spec-anchored/pyjson.ts';
import { PRODUCT_PREFIXES, ourMainCheckout, type Git, type Intent, type Verdict } from './policy.ts';

// The kernel judges a run only when someone calls it. This gate calls it when the PR opens.

export interface RunStore {
  /** The names inside a folder. Empty when the folder does not exist. */
  list(dir: string): readonly string[];
  read(file: string): string | null;
  /** `git diff --name-status -z` from `base` to the local `branch`, or `null` when git refuses. */
  diff(tree: string, base: string, branch: string): string | null;
}

export const RUNS = '.agent-runs';
const POLICY_FILE = /^policy.*\.json$/;

class Refusal extends Error {}

const lf = (text: string) => text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');

function runPolicy(bundle: JsonObject, files: readonly Json[]): ResolvedPolicy {
  const profile = get(bundle, 'policy_profile');
  const candidates = [...(typeof profile === 'string' && PROFILES.has(profile) ? [profile] : []), ...files];
  for (const candidate of candidates) {
    const resolved = resolvePolicy(candidate);
    if (hashJson(resolved) === get(bundle, 'policy_sha256')) return resolved;
  }
  throw new Refusal('no policy of the run hashes to the `policy_sha256` of the approval');
}

/** What the kernel refuses in one run folder. Empty when the approval and the scope hold. */
export function runFindings(dir: string, tree: string, branch: string, git: Git, store: RunStore): string[] {
  const text = (name: string) => {
    const found = store.read(git.paths.join(dir, name));
    if (found === null) throw new Refusal(`the run has no \`${name}\``);
    return lf(found);
  };
  const document = (name: string) => strictJsonLoads(text(name));
  try {
    const bundle = document('approval.json');
    const approved = isDict(bundle) ? get(bundle, 'approval_bundle') : null;
    if (!isDict(approved)) throw new Refusal('`approval.json` holds no `approval_bundle`');
    const policy = runPolicy(approved, store.list(dir).filter(name => POLICY_FILE.test(name)).sort().map(document));
    const manifest = document('scope-manifest.json');
    const base = get(approved, 'base_sha');
    const diff = isStr(base) ? store.diff(tree, base, branch) : null;
    return [
      ...verifyApproval(document('approval-record.json'), approved, policy),
      ...(hashJson(manifest) === get(approved, 'scope_manifest_sha256') ? [] : ['`scope-manifest.json` is not the manifest that was approved']),
      ...(hashText(text('plan.md')) === get(approved, 'plan_sha256') ? [] : ['`plan.md` is not the plan that was approved']),
      ...(diff === null ? [`git cannot diff from the \`base_sha\` of the approval to \`${branch}\``] : validateScope(manifest, parseNameStatus(diff, true), policy)),
    ];
  } catch (error) {
    if (error instanceof Refusal || error instanceof ContractViolation || error instanceof InputError) return [error.message];
    throw error;
  }
}

function branchOfRun(dir: string, git: Git, store: RunStore): string | null {
  try {
    const state: unknown = JSON.parse(store.read(git.paths.join(dir, 'run-state.json')) ?? 'null');
    return typeof state === 'object' && state !== null && 'branch' in state && typeof state.branch === 'string' ? state.branch : null;
  } catch {
    return null;
  }
}

export function pullRequestRule(intent: Intent, git: Git, store: RunStore): Verdict {
  for (const pr of intent.pullRequests) {
    const tree = git.treeOf(pr.cwd);
    if (tree === null || ourMainCheckout(git, tree) === null) continue;
    const branch = pr.head ?? git.branchOf(tree);
    if (branch === null || !PRODUCT_PREFIXES.some(prefix => branch.startsWith(prefix))) continue;
    const runs = git.paths.join(tree, RUNS);
    const run = store.list(runs).filter(name => branchOfRun(git.paths.join(runs, name), git, store) === branch).sort().at(-1);
    if (run === undefined) {
      return {
        kind: 'warn',
        reason: `run gate: the branch \`${branch}\` has no run in \`${RUNS}/\`. No approval and no scope check stand behind this PR.`,
      };
    }
    const findings = runFindings(git.paths.join(runs, run), tree, branch, git, store);
    if (findings.length > 0) {
      return {
        kind: 'deny',
        reason: `The kernel refuses the run \`${run}\`:\n${findings.map(f => `- ${f}`).join('\n')}\n` +
          'Finish Phase 3 of `.agents/protocols/implementation-protocol.md`, or go back to it: a changed plan, manifest or policy needs a new approval.',
      };
    }
  }
  return { kind: 'no-opinion' };
}
