import {
  ContractViolation, InputError, canonicalJson, codePoints, get, getOr, isDict, isInt, isList, isPySpace, isStr, json,
  plainJson, pyEq, pyIn, repr, rstrip, sha256Hex, sortedStrings, str, strip, truthy, typeName, utf8,
  type Json, type JsonObject,
} from './pyjson.ts';

// A port of `scripts/spec-anchored` from spec-anchored-agentic-development at commit `4f8a13e`.
// It is a fork: a change upstream is carried over by hand.

export const SCHEMA_VERSION = 1n;
export const CANON_ALGO = 'sa-canon/1';

/** A policy that already passed `resolvePolicy`. JSON cannot produce this type. */
export class ResolvedPolicy extends Map<string, Json> {}

const TERMINALS = ['PR_READY_AWAITING_HUMAN', 'NAMED_BLOCKER', 'NO_CHANGE_REQUIRED'];
const CLASSIFICATIONS_TERMINAL = ['ALREADY_SATISFIED', 'STALE_REQUEST'];
const CLASSIFICATIONS_BLOCKING = ['WRONG_SYSTEM', 'UNVERIFIABLE'];
const BLOCKER_KINDS = ['AMBIGUITY', 'MISSING_ORACLE', 'TRUTH_CONFLICT', 'SCOPE_VIOLATION', 'SPEC_CHANGE_REQUIRED',
  'SPEC_STALE', 'GRAPH_DECISION_REQUIRED', 'ENVIRONMENT', 'REPEATED_FAILURE'];
const CLAIM_STATES = ['parked', 'released'];
const MERGE_CLAIMS = ['merged', 'landed', 'auto-merged', 'merge_complete'];

const TRUTH_ROOTS: readonly (readonly [string, readonly string[]])[] = [
  ['spec_semantics', ['specs/**']],
  ['golden_oracle', ['**/golden/**', '**/*.golden', '**/goldens/**']],
  ['metrics_baseline', ['**/.metrics-baseline.json']],
];
/** `external_side_effect` has no pattern: no path can show it. It is declared, and review enforces it. */
const PERMISSION_TRIGGERS: readonly (readonly [string, readonly string[]])[] = [
  ['dependency_change', ['**/requirements.txt', 'requirements/*.txt', '**/package.json', '**/package-lock.json',
    '**/yarn.lock', '**/pnpm-lock.yaml', '**/go.mod', '**/go.sum', '**/Cargo.toml', '**/Cargo.lock',
    '**/pyproject.toml', '**/poetry.lock', '**/uv.lock', '**/Gemfile', '**/Gemfile.lock', '**/pom.xml',
    '**/build.gradle', '**/build.gradle.kts', '**/*.csproj', '**/composer.json', '**/composer.lock', '**/mix.exs']],
  ['schema_change', ['**/migrations/**', '**/schema.sql', '**/*.prisma', '**/schema.graphql', 'db/schema.rb',
    '**/schema.json', '**/openapi.yaml', '**/openapi.yml', '**/openapi.json', '**/*.proto', '**/swagger.yaml']],
  ['data_migration', ['**/migrations/**', '**/seeds/**', '**/fixtures/data/**', '**/migrate_*.py', '**/migrate-*.sql',
    '**/backfill_*.py']],
];

// Surfaces, not a list of today's files: `scripts/**` stays reserved so a new gate there is covered.
// The Python original also lists the root spelling of `**/AGENTS.md`. Here the operator also matches no folder.
const GOVERNANCE_FLOOR: readonly string[] = [
  'scripts/**', '.spec-anchored/**', 'tests/_harness.py', 'tests/test_kernel*.py', 'tests/test_corpus*.py',
  'tests/test-mutants.py',
  'policy/**',
  '.claude/**', '.agents/**', 'agents/**', '.codex/**', '.cursor/**', 'reviewer-system/**', 'protocols/**', 'rules/**',
  'routines/**', 'implement-*/**', 'adaptations/**',
  '.github/**', '.gitlab-ci.yml', 'azure-pipelines.yml',
  'spec-templates/**',
  'GUIDELINE*.md', 'AUTONOMY-PLAYBOOK.md', 'INSTALL.md', 'REVIEW-FINDINGS.md', 'sources-and-learnings.md',
  // a run that edits its own instructions works under the new ones
  '**/AGENTS.md', '**/CLAUDE.md', '**/CLAUDE-*.md', '.cursorrules',
  'architecture/**/constitution*.md', '**/constitution.md',
  'EVALS*.md', 'evals/spec-anchored/**', 'eval-results/spec-anchored/**',
  '.agent-runs/**',
];

function profile(fields: Record<string, unknown>): JsonObject {
  const mode = fields.execution_mode;
  const supervised = mode === 'supervised';
  const unowned = mode === 'autonomous' || mode === 'unattended';
  return json({
    permission_ceiling: {
      dependency_change: supervised, schema_change: supervised, data_migration: supervised, external_side_effect: supervised,
    },
    denied_path_patterns: [],
    requires_scope_roots: unowned,
    max_scope_roots: unowned ? 4 : null,
    max_recursive_scope_patterns: unowned ? 4 : null,
    max_exact_paths: unowned ? 20 : null,
    forbidden_path_patterns: unowned ? ['**', '*'] : [],
    // A closed grammar, not a blacklist of spellings: `src/**/*` is as broad as `src/**`.
    pattern_grammar: supervised
      ? { forms: ['exact', 'trailing-recursive', 'free'], minimum_literal_segments: 1,
          forbid_leading_wildcard: false, forbid_intermediate_wildcard: false }
      : { forms: ['exact', 'trailing-recursive'], minimum_literal_segments: 2,
          forbid_leading_wildcard: true, forbid_intermediate_wildcard: true },
    ...fields,
  }) as JsonObject;
}

const HUMAN_ONLY = { golden_oracle: 'human-only', metrics_baseline: 'human-only', governance: 'deny' };

export const PROFILES: ReadonlyMap<string, JsonObject> = new Map([
  ['supervised-local/v1', profile({
    execution_mode: 'supervised', adapters: ['implement-feature'], spec_semantics: 'gated', ...HUMAN_ONLY })],
  ['orchestrated-assisted/v1', profile({
    execution_mode: 'assisted', adapters: ['implement-orchestrated'], spec_semantics: 'proposal-only', ...HUMAN_ONLY })],
  ['orchestrated-autonomous/v1', profile({
    execution_mode: 'autonomous', adapters: ['implement-orchestrated'], spec_semantics: 'proposal-only', ...HUMAN_ONLY })],
  ['unattended/v1', profile({
    execution_mode: 'unattended', adapters: ['implement-backlog'], spec_semantics: 'proposal-only', ...HUMAN_ONLY,
    forbidden_path_patterns: ['**', '*', 'src/**', '**/*'] })],
]);

/** From most authority to least: an overlay moves a ceiling down this list, never up. */
const CEILING_ORDER = ['gated', 'proposal-only', 'human-only'];
const IMMUTABLE_POLICY_KEYS = ['profile_id', 'execution_mode', 'adapters', 'governance'];
const TRUTH_PROFILE_KEYS = ['spec_semantics', 'golden_oracle', 'metrics_baseline'];
const ALLOWED_FORGE_HOSTS = ['github.com'];
const PROVIDERS = ['github', 'gitlab', 'local'];

// Python's `\w` and `\d` are Unicode, and its `$` also matches before a final newline.
const W = String.raw`\p{L}\p{N}_`;
const D = String.raw`\p{Nd}`;
const END = String.raw`\n?$`;
const rx = (source: string) => new RegExp(source + END, 'u');
const RFC3339 = rx(`^${D}{4}-${D}{2}-${D}{2}T${D}{2}:${D}{2}:${D}{2}(\\.${D}+)?(Z|[+-]${D}{2}:${D}{2})`);
const REPO_REF = rx(`^[${W}.\\-]+/[${W}.\\-]+`);
const COMMENT_URL = rx(`^https://[${W}.\\-]+/[${W}.\\-]+/[${W}.\\-]+/issues/${D}+#issuecomment-${D}+`);
const GIT_STATUS = rx(`^(?:[AMDTUX]|[RC]${D}{0,3})`);
const HEX64 = rx('^[0-9a-f]{64}');
const HEX40 = rx('^[0-9a-f]{40}');
const ISSUE_REF = rx(`^[${W}.\\-]+/[${W}.\\-]+#${D}+`);
const RUN_ID = rx(`^RUN-[${W}.\\-]{1,64}`);
const PR_URL = rx(`^https://[${W}.\\-]+/[${W}.\\-]+/[${W}.\\-]+/pull/${D}+`);
const STABLE_ID = rx(`^(BR|AC|INV|CTR|OR|QC|OBS|OQ)-[A-Z][A-Z0-9]*-${D}{3,}`);
const DRIVE = /^[A-Za-z]:/;
function endsInHardBreak(line: string): boolean {
  const cps = codePoints(line);
  let spaces = 0;
  // Past the start of the line the index is -1, which holds no space: the loop needs no bound.
  while (cps[cps.length - 1 - spaces] === ' ') spaces++;
  return spaces >= 2 && spaces < cps.length && !isPySpace(cps[cps.length - 1 - spaces]);
}

/** Longest token first, so `**` is never read as two `*`. */
export const OPERATORS: readonly (readonly [string, string])[] = [
  ['**/', '(?:[^\\n]*/)?'], // zero or more path segments
  ['**', '[^\\n]*'], // crosses slashes
  ['*', '[^/]*'], // zero or more non-slash characters
  ['?', '[^/]'], // exactly one non-slash character
];
const GLOB_CHARS = '*?';
const PATTERN_LOOKALIKE_CHARS = '[]{}!^@+';

const hasAny = (value: string, chars: string) => codePoints(value).some(ch => chars.includes(ch));
const charsIn = (value: string, chars: string) => sortedStrings(codePoints(value).filter(ch => chars.includes(ch)));
const isControl = (ch: string) => ch < ' ' || ch === '\x7f';
const escapeRegExp = (ch: string) => ch.replace(/[\\^$.*+?()[\]{}|/]/, '\\$&');

export function match(path: string, pattern: string): boolean {
  let source = '';
  let i = 0;
  const cps = codePoints(pattern);
  while (i < cps.length) {
    const rest = cps.slice(i).join('');
    const operator = OPERATORS.find(([token]) => rest.startsWith(token));
    if (operator === undefined) {
      source += escapeRegExp(cps[i]);
      i += 1;
    } else {
      source += operator[1];
      i += operator[0].length;
    }
  }
  return new RegExp(`^(?:${source})$`, 'u').test(path);
}

export const isPattern = (value: string): boolean => hasAny(value, GLOB_CHARS);

export type PathKind = 'path' | 'exact' | 'pattern';

export function canonicalViolation(value: Json, kind: PathKind): string | null {
  if (!isStr(value)) return 'not a string';
  if (value === '' || value !== strip(value)) return 'empty or padded';
  if (value.startsWith('/') || DRIVE.test(value)) return 'absolute path';
  if (value.includes('\\')) return 'backslash separator (ambiguous across platforms)';
  if (codePoints(value).some(isControl)) return 'control character';
  if (value.endsWith('/')) return 'trailing slash';
  const segments = value.split('/');
  for (const segment of segments) {
    if (segment === '') return 'empty segment (leading, trailing or doubled slash)';
    if (segment === '.') return '`.` segment';
    if (segment === '..') return 'parent traversal';
  }
  return KIND_CHECKS[kind](value, segments);
}

const KIND_CHECKS: Record<PathKind, (value: string, segments: readonly string[]) => string | null> = {
  path: () => null,
  exact(value) {
    if (!hasAny(value, GLOB_CHARS)) return null;
    return `uses a matcher operator (${charsIn(value, GLOB_CHARS).join(', ')}) where an exact path is required — `
      + 'a grant is never half a glob';
  },
  pattern(value, segments) {
    const bad = charsIn(value, PATTERN_LOOKALIKE_CHARS);
    if (bad.length > 0) {
      return `uses ${bad.map(repr).join(', ')}, which looks like an operator but is matched literally `
        + `(implemented operators: ${OPERATORS.map(([token]) => token).join(', ')}) — express it as an exact path instead`;
    }
    if (segments.some(segment => segment.includes('**') && segment !== '**')) {
      return '`**` must be a complete segment, not part of one';
    }
    return null;
  },
};

const pathMode = (value: string): PathKind => (isPattern(value) ? 'pattern' : 'exact');

export function patternViolation(pattern: string, grammar: JsonObject): string | null {
  const bad = canonicalViolation(pattern, pathMode(pattern));
  if (bad !== null) return bad;
  const segments = pattern.split('/');
  const wild = segments.map(segment => hasAny(segment, GLOB_CHARS));
  if (truthy(get(grammar, 'forbid_leading_wildcard')) && wild[0]) return 'starts with a wildcard segment';
  const minimum = getOr(grammar, 'minimum_literal_segments', 0n) as bigint;
  if (BigInt(wild.filter(w => !w).length) < minimum) {
    return `needs at least ${minimum.toString()} literal path segments to be a scope rather than the tree`;
  }
  if (pyIn('free', getOr(grammar, 'forms', []) as Json[])) return null;
  if (truthy(get(grammar, 'forbid_intermediate_wildcard')) && wild.slice(0, -1).some(Boolean)) {
    return 'every wildcard must be the final segment; `src/*/foo/**` and `src/pay/**/**` are intermediate-wildcard forms';
  }
  if (wild.some(Boolean) && segments[segments.length - 1] !== '**') return 'the recursive form must end in `**`';
  return null;
}

/** Checks every element before any set operation: the contract owes a refusal, not a crash. */
function strList(value: Json, field: string): string[] {
  if (!isList(value)) throw new ContractViolation(`${field} must be a list`);
  for (const item of value) {
    if (!isStr(item)) throw new ContractViolation(`${field} must be a list of strings (found ${typeName(item)})`);
  }
  return value as string[];
}

/** A malformed policy path must not apply less than its issuer meant: `"src/pay/secret/** "` matches nothing. */
function policyPath(value: string, field: string, allowGlob: boolean): void {
  const bad = canonicalViolation(value, allowGlob ? pathMode(value) : 'exact');
  if (bad !== null) throw new ContractViolation(`${field}: ${repr(value)} — ${bad}`);
}

const reprList = (items: Iterable<string>) => repr(sortedStrings(items));
const difference = (a: readonly string[], b: readonly string[]) => a.filter(x => !b.includes(x));
const stringsOf = (value: Json): string[] => (isList(value) ? (value as string[]) : []);

function narrowedLimit(key: string, value: Json, existing: Json): bigint {
  if (!isInt(value) || value < 0n) throw new ContractViolation(`${key} must be a non-negative int`);
  if (isInt(existing) && value > existing) {
    throw new ContractViolation(`overlay raises ${key} from ${existing.toString()} to ${value.toString()} (limits only go down)`);
  }
  return value;
}

// The base is a profile of `PROFILES`: it declares no operations, no classes, no denies and no roots.
// The Python original checks a drop of those too. Here there is nothing to drop.
function monotonicMerge(base: JsonObject, overlay: JsonObject): JsonObject {
  const effective = new Map(base);
  for (const [key, value] of overlay) {
    if (IMMUTABLE_POLICY_KEYS.includes(key)) {
      throw new ContractViolation(`overlay may not touch ${repr(key)}: mode, adapters, governance and profile `
        + "identity are the launcher's, not the run's");
    }
    if (key === 'forbidden_path_patterns') {
      const patterns = strList(value, key);
      // The Python original exempts the universal spellings `**`, `*` and `**/*` from this check.
      // The check accepts the three, so the exemption changes nothing and is not ported.
      for (const pattern of patterns) policyPath(pattern, key, true);
      const before = get(base, key) as string[];
      const dropped = before.filter(pattern => !patterns.includes(pattern));
      if (dropped.length > 0) {
        throw new ContractViolation(`overlay drops forbidden patterns ${repr(sortedStrings(dropped))}: an overlay may ADD `
          + 'restrictions, never remove them');
      }
      effective.set(key, sortedStrings([...before, ...patterns]));
    } else if (key === 'allowed_operations') {
      const operations = strList(value, key);
      for (const operation of operations) {
        if (!GIT_STATUS.test(operation)) {
          throw new ContractViolation(`allowed_operations: ${repr(operation)} is not a git status letter`);
        }
      }
      effective.set(key, sortedStrings(operations));
    } else if (key === 'protected_path_classes') {
      if (!isDict(value)) throw new ContractViolation('protected_path_classes must be an object');
      const merged = new Map<string, Json>();
      for (const [permission, patterns] of value) {
        const field = `protected_path_classes.${permission}`;
        for (const pattern of strList(patterns, field)) policyPath(pattern, field, true);
        merged.set(permission, sortedStrings(patterns as string[]));
      }
      effective.set(key, merged);
    } else if (key === 'denied_path_patterns') {
      const patterns = strList(value, key);
      for (const pattern of patterns) policyPath(pattern, key, true);
      effective.set(key, sortedStrings(patterns));
    } else if (key === 'authorized_scope_roots') {
      const roots = strList(value, key);
      for (const root of roots) policyPath(root, key, false);
      const cap = getOr(overlay, 'max_scope_roots', get(base, 'max_scope_roots'));
      if (isInt(cap) && BigInt(roots.length) > cap) {
        throw new ContractViolation(`authorized_scope_roots declares ${roots.length} roots but max_scope_roots is `
          + `${cap.toString()} — the limit binds the authorized set itself`);
      }
      effective.set(key, sortedStrings(roots));
    } else if (['max_scope_roots', 'max_exact_paths', 'max_recursive_scope_patterns'].includes(key)) {
      effective.set(key, narrowedLimit(key, value, get(base, key)));
    } else if (TRUTH_PROFILE_KEYS.includes(key)) {
      const before = get(base, key) as string;
      if (!isStr(value) || !CEILING_ORDER.includes(value)) {
        throw new ContractViolation(`${key}: illegal ceiling ${repr(value)}`);
      }
      if (CEILING_ORDER.indexOf(value) < CEILING_ORDER.indexOf(before)) {
        throw new ContractViolation(`overlay may not raise the ${key} ceiling from ${repr(before)} to ${repr(value)}`);
      }
      effective.set(key, value);
    } else {
      throw new ContractViolation(`overlay may only narrow policy (${repr(key)} is not a narrowing key)`);
    }
  }
  return effective;
}

const withId = (base: JsonObject, id: string): JsonObject => new Map<string, Json>(base).set('profile_id', id);

/** A raw object passes only when it is byte-identical to the canonical resolution of the profile it names. */
export function resolvePolicy(spec: Json | ResolvedPolicy): ResolvedPolicy {
  if (spec instanceof ResolvedPolicy) return spec;
  if (isStr(spec)) {
    const base = PROFILES.get(spec);
    if (base === undefined) throw new ContractViolation(`unknown policy profile ${repr(spec)}`);
    return new ResolvedPolicy(withId(base, spec));
  }
  if (!isDict(spec)) throw new ContractViolation('policy must be a profile id or an object');
  if (spec.has('base_profile')) {
    const id = get(spec, 'base_profile');
    const base = isStr(id) ? PROFILES.get(id) : undefined;
    if (!isStr(id) || base === undefined) throw new ContractViolation(`unknown base_profile ${repr(id)}`);
    const given = get(spec, 'overlay');
    const overlay = truthy(given) ? given : new Map<string, Json>();
    if (!isDict(overlay)) throw new ContractViolation('policy overlay must be an object');
    for (const key of spec.keys()) {
      if (key !== 'base_profile' && key !== 'overlay') throw new ContractViolation(`unknown policy key ${repr(key)}`);
    }
    return new ResolvedPolicy(monotonicMerge(withId(base, id), overlay).set('profile_id', id));
  }
  const id = get(spec, 'profile_id');
  const base = isStr(id) ? PROFILES.get(id) : undefined;
  if (!isStr(id) || base === undefined) {
    throw new ContractViolation('a policy object must name a known profile_id, or use base_profile + '
      + 'overlay: an unrecognised policy is a self-declaration, not an authority');
  }
  const canonical = withId(base, id);
  if (hashJson(spec) !== hashJson(canonical)) {
    throw new ContractViolation(`this policy object differs from the canonical ${repr(id)} artifact; issue it `
      + 'as base_profile + overlay so the narrowing is explicit and provable');
  }
  return new ResolvedPolicy(canonical);
}

export const canonicalJsonBytes = (value: Json): Buffer => utf8(canonicalJson(value));

/** Strict mode refuses a Markdown hard break: without it, two plans that render differently share one hash. */
export function canonicalTextBytes(text: string, strict: boolean): Buffer {
  let lines = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  if (strict) {
    lines.forEach((line, i) => {
      if (endsInHardBreak(line)) {
        throw new ContractViolation(`line ${i + 1} ends in a Markdown hard break; canonicalization `
          + 'would erase a rendering difference - rewrite the line');
      }
    });
  }
  lines = lines.map(line => rstrip(line));
  // An empty list has no first and no last line, so neither loop needs a bound.
  while (lines[0] === '') lines.shift();
  while (lines.at(-1) === '') lines.pop();
  return utf8(`${lines.join('\n')}\n`);
}

export const hashJson = (value: Json): string => sha256Hex(canonicalJsonBytes(value));
export const hashText = (text: string, strict = true): string => sha256Hex(canonicalTextBytes(text, strict));

/** Every truth class of a path: `specs/pay/golden/cases.json` is spec semantics and the oracle. */
export function truthClasses(path: string): string[] {
  return TRUTH_ROOTS.filter(([, patterns]) => patterns.some(p => match(path, p))).map(([kind]) => kind);
}

const BUNDLE_FIELDS: Record<string, 'int' | 'str' | 'str-or-null'> = {
  schema_version: 'int', run_id: 'str',
  adapter: 'str', execution_mode: 'str', policy_profile: 'str', policy_sha256: 'str',
  ticket_ref: 'str', ticket_body_sha256: 'str', base_sha: 'str',
  spec_entrypoint: 'str', spec_pinned_commit: 'str', spec_corpus_sha256: 'str',
  plan_artifact_id: 'str', plan_sha256: 'str',
  scope_manifest_sha256: 'str', semantic_amendment_sha256: 'str-or-null',
};
const FIELD_FORMATS: readonly (readonly [string, RegExp])[] = [
  ['run_id', RUN_ID], ['ticket_ref', ISSUE_REF], ['ticket_body_sha256', HEX64], ['base_sha', HEX40],
  ['spec_pinned_commit', HEX40], ['plan_sha256', HEX64], ['scope_manifest_sha256', HEX64],
  ['spec_corpus_sha256', HEX64], ['policy_sha256', HEX64],
];

export interface ApprovalOptions {
  readonly policy?: Json | ResolvedPolicy;
  readonly shapeOnly?: boolean;
}

export function buildApproval(parts: Json, options: ApprovalOptions = {}): [JsonObject, string] {
  if (!isDict(parts)) throw new ContractViolation('approval bundle is not an object');
  const known = Object.keys(BUNDLE_FIELDS);
  const unknown = sortedStrings([...parts.keys()].filter(k => !known.includes(k)));
  if (unknown.length > 0) {
    throw new ContractViolation(`unknown bundle fields: ${repr(unknown)} (a bundle never carries its own fingerprint)`);
  }
  const missing = sortedStrings(known.filter(k => !parts.has(k)));
  if (missing.length > 0) throw new ContractViolation(`approval bundle missing fields: ${repr(missing)}`);
  for (const [field, type] of Object.entries(BUNDLE_FIELDS)) {
    const value = get(parts, field);
    if (type === 'int' && !isInt(value)) {
      throw new ContractViolation(`${field}: expected a plain int, got ${typeName(value)}`);
    }
    if (type === 'str' && !isStr(value)) throw new ContractViolation(`${field}: expected a string, got ${typeName(value)}`);
    if (type === 'str-or-null' && value !== null && !isStr(value)) {
      throw new ContractViolation(`${field}: expected a string or null, got ${typeName(value)}`);
    }
  }
  const text = (field: string) => get(parts, field) as string;
  if (get(parts, 'schema_version') !== SCHEMA_VERSION) {
    throw new ContractViolation(`schema_version must be ${SCHEMA_VERSION.toString()}`);
  }
  for (const [field, format] of FIELD_FORMATS) {
    if (!format.test(text(field))) throw new ContractViolation(`${field}: malformed value ${repr(text(field))}`);
  }
  const amendment = get(parts, 'semantic_amendment_sha256');
  if (isStr(amendment) && !HEX64.test(amendment)) {
    throw new ContractViolation('semantic_amendment_sha256: malformed value');
  }
  const bad = canonicalViolation(text('spec_entrypoint'), 'path');
  if (bad !== null) throw new ContractViolation(`spec_entrypoint: ${bad}`);
  if (!text('spec_entrypoint').startsWith('specs/')) throw new ContractViolation('spec_entrypoint must live under specs/');
  if (options.policy === undefined || options.policy === null) {
    if (options.shapeOnly !== true) {
      throw new ContractViolation('build_approval requires the resolved policy: without it policy_sha256 '
        + 'is a declaration, not a binding (pass policy=..., or _shape_only=True '
        + 'when you explicitly want shape validation with no policy claim)');
    }
  } else {
    const effective = resolvePolicy(options.policy);
    if (text('policy_sha256') !== hashJson(effective)) {
      throw new ContractViolation('policy_sha256 does not match the resolved policy artifact '
        + '(a declared hash is an assertion; only a computed one binds)');
    }
    if (text('policy_profile') !== get(effective, 'profile_id')) {
      throw new ContractViolation('policy_profile does not name the resolved policy');
    }
  }
  const named = PROFILES.get(text('policy_profile'));
  if (named === undefined) {
    throw new ContractViolation(`policy_profile: unknown profile ${repr(text('policy_profile'))} `
      + `(legal: ${repr(sortedStrings(PROFILES.keys()))})`);
  }
  if (text('execution_mode') !== get(named, 'execution_mode')) {
    throw new ContractViolation(`execution_mode ${repr(text('execution_mode'))} contradicts profile `
      + repr(text('policy_profile')));
  }
  if (!pyIn(text('adapter'), get(named, 'adapters') as Json[])) {
    throw new ContractViolation(`adapter ${repr(text('adapter'))} is not allowed by profile ${repr(text('policy_profile'))}`);
  }
  if (strip(text('plan_artifact_id')) === '') {
    throw new ContractViolation('plan_artifact_id: the approved plan needs an address '
      + '(e.g. issue-comment:12345) - a hash alone cannot bind an approval to the post it approved');
  }
  const bundle: JsonObject = new Map(sortedStrings(known).map(field => [field, get(parts, field)]));
  return [bundle, hashJson(bundle)];
}

const RECORD_FIELDS: Record<string, 'int' | 'str'> = {
  schema_version: 'int', approval_fingerprint: 'str', approval_artifact_id: 'str', approver: 'str',
  approved_at: 'str', provider: 'str', repository: 'str', run_id: 'str',
};

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** No `^`: the caller already matched `RFC3339` from the start, and this shape cannot begin later. */
const INSTANT = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

/** A real instant, as `datetime.fromisoformat` of Python 3.13 reads it: the shape is not a calendar. */
function isRealInstant(stamp: string): boolean {
  const m = INSTANT.exec(stamp);
  if (m === null) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (year < 1 || month < 1 || month > 12) return false;
  if (day < 1 || day > DAYS[month - 1] + (month === 2 && leap ? 1 : 0)) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  return m[7] === undefined || Number(m[7]) * 60 + Number(m[8]) < 24 * 60;
}

/** It takes the bundle, not only its fingerprint: a record that names another run or repository is a replay. */
export function verifyApproval(record: Json, bundle: Json, policy?: Json | ResolvedPolicy): string[] {
  if (!isDict(bundle)) {
    throw new ContractViolation('verify_approval needs the approval bundle, not a fingerprint: without '
      + "it the record's run and repository cannot be checked (twelfth audit)");
  }
  if (policy === undefined || policy === null) {
    throw new ContractViolation('verify_approval requires the resolved policy: a record verified without '
      + 'one proves nothing about the authority the run operated under');
  }
  const [, expected] = buildApproval(bundle, { policy });
  if (!isDict(record)) return ['approval record is not an object'];
  const known = Object.keys(RECORD_FIELDS);
  const shape = [
    ...sortedStrings(known.filter(f => !record.has(f))).map(f => `approval record missing field: ${f}`),
    ...sortedStrings([...record.keys()].filter(f => !known.includes(f))).map(f => `approval record has unknown field: ${f}`),
  ];
  if (shape.length > 0) return shape;
  const v: string[] = [];
  const field = (name: string) => get(record, name);
  if (!pyEq(field('schema_version'), SCHEMA_VERSION)) v.push(`schema_version must be ${SCHEMA_VERSION.toString()}`);
  const fingerprint = field('approval_fingerprint');
  if (!HEX64.test(str(fingerprint))) v.push('approval_fingerprint: malformed');
  else if (fingerprint !== expected) {
    v.push('approval record does not match this bundle (stale approval, or approval of a different object)');
  }
  for (const [name, type] of Object.entries(RECORD_FIELDS)) {
    if (type === 'int' && !isInt(field(name))) v.push(`${name}: expected a plain int`);
    if (type === 'str' && !isStr(field(name))) v.push(`${name}: expected a string`);
  }
  for (const name of ['approval_artifact_id', 'approver', 'approved_at', 'provider', 'repository', 'run_id']) {
    const value = field(name);
    if (isStr(value) && strip(value) === '') v.push(`${name}: empty`);
  }
  const provider = field('provider');
  if (isStr(provider) && !PROVIDERS.includes(provider)) {
    v.push(`provider: ${repr(provider)} is not a known provider (legal: ${repr(PROVIDERS)})`);
  }
  const stamp = field('approved_at');
  if (isStr(stamp)) {
    if (!RFC3339.test(stamp)) v.push('approved_at: expected an RFC3339 timestamp');
    else if (!isRealInstant(stamp)) v.push(`approved_at: ${repr(stamp)} is not a real instant (shape is not a calendar)`);
  }
  const repository = field('repository');
  if (isStr(repository) && !REPO_REF.test(repository)) v.push('repository: expected owner/repo');
  const run = field('run_id');
  if (isStr(run) && !RUN_ID.test(run)) v.push('run_id: malformed');
  if (!pyEq(run, get(bundle, 'run_id'))) {
    v.push(`approval record names run ${repr(run)} but the bundle is for ${repr(get(bundle, 'run_id'))} (cross-run replay)`);
  }
  const ticketRepository = str(get(bundle, 'ticket_ref')).split('#')[0];
  if (!pyEq(repository, ticketRepository)) {
    v.push(`approval record names repository ${repr(repository)} but the ticket lives in ${repr(ticketRepository)} `
      + '(cross-repository replay)');
  }
  return v;
}

// `approved_expansions` is not a key: an expansion changes the manifest, so its hash, so the approval bundle.
const MANIFEST_KEYS = ['schema_version', 'run_id', 'capability', 'adapter', 'execution_mode', 'policy_profile',
  'semantic_scope', 'mechanical_scope', 'truth_change'];
const SEMANTIC_KEYS = ['implements', 'verifies', 'non_goals'];
const MECHANICAL_KEYS = ['allowed_paths', 'denied_paths', 'permissions'];
const PERMISSIONS = ['dependency_change', 'schema_change', 'data_migration', 'external_side_effect'];
const TRUTH_KEYS = ['policy', 'allowed_spec_paths', 'golden_policy', 'allowed_golden_paths', 'baseline_policy',
  'allowed_baseline_paths'];
const TRUTH_LISTS: readonly (readonly [string, string | null, string])[] = [
  ['allowed_spec_paths', 'specs/', 'spec_semantics'],
  ['allowed_golden_paths', null, 'golden_oracle'],
  ['allowed_baseline_paths', null, 'metrics_baseline'],
];

const unknownKeys = (d: JsonObject, known: readonly string[]) => sortedStrings([...d.keys()].filter(k => !known.includes(k)));

function semanticScopeViolations(sem: Json): string[] {
  if (!isDict(sem)) return ['semantic_scope must be an object with implements/verifies/non_goals'];
  const v = unknownKeys(sem, SEMANTIC_KEYS).map(k => `unknown semantic_scope key: ${k} (schemas are closed at every level)`);
  for (const k of SEMANTIC_KEYS) if (!isList(get(sem, k))) v.push(`semantic_scope.${k} must be a list`);
  for (const k of ['implements', 'verifies']) {
    for (const item of stringsOf(get(sem, k))) {
      if (isStr(item) && !STABLE_ID.test(item)) {
        v.push(`semantic_scope.${k}: ${repr(item)} is not a typed stable ID (TYPE-<CAP>-###)`);
      }
    }
  }
  return v;
}

function nonStringEntries(sem: Json): string[] {
  if (!isDict(sem)) return [];
  return SEMANTIC_KEYS.flatMap(k => (stringsOf(get(sem, k)) as Json[])
    .filter(item => !isStr(item))
    .map(item => `semantic_scope.${k} contains a non-string entry (${typeName(item)})`));
}

function operationViolations(operations: Json): string[] {
  if (!isList(operations)) {
    return [`mechanical_scope.allowed_operations must be a list of git status letters, got ${typeName(operations)}`];
  }
  return operations.flatMap(o => {
    if (!isStr(o)) return [`mechanical_scope.allowed_operations: ${typeName(o)} is not a string`];
    return GIT_STATUS.test(o) ? [] : [`mechanical_scope.allowed_operations: ${repr(o)} is not a git status letter`];
  });
}

function truthChangeViolations(tc: JsonObject): string[] {
  const v = unknownKeys(tc, TRUTH_KEYS).map(k => `unknown truth_change key: ${k}`);
  if (!pyIn(getOr(tc, 'policy', 'none'), ['none', 'semantic-amendment'])) {
    v.push(`truth_change.policy: illegal value ${repr(get(tc, 'policy'))}`);
  }
  for (const k of ['golden_policy', 'baseline_policy']) {
    if (!pyIn(getOr(tc, k, 'none'), ['none', 'gated'])) v.push(`truth_change.${k}: illegal value ${repr(get(tc, k))}`);
  }
  for (const [listKey, root, kind] of TRUTH_LISTS) {
    const entries = getOr(tc, listKey, []) ?? [];
    if (!isList(entries)) {
      v.push(`truth_change.${listKey} must be a list, got ${typeName(entries)}`);
      continue;
    }
    for (const p of entries) {
      if (!isStr(p)) {
        v.push(`${listKey}: non-string entry`);
        continue;
      }
      const bad = canonicalViolation(p, 'exact');
      if (bad !== null) {
        v.push(`${listKey}: ${repr(p)} - ${bad} (a wildcard grant is not a grant; exact paths only)`);
        continue;
      }
      if (root !== null && !p.startsWith(root)) v.push(`${listKey}: ${repr(p)} must live under ${root}`);
      if (!truthClasses(p).includes(kind)) v.push(`${listKey}: ${repr(p)} is not ${kind} truth`);
    }
  }
  return v;
}

export function validateManifest(m: Json): string[] {
  if (!isDict(m)) return ['scope manifest is not an object'];
  let v = [
    ...unknownKeys(m, MANIFEST_KEYS).map(k => `unknown manifest key: ${k}`),
    ...MANIFEST_KEYS.filter(k => !m.has(k)).map(k => `manifest missing required key: ${k}`),
  ];
  if (v.length > 0) return v;
  const field = (k: string) => get(m, k);
  if (field('schema_version') !== SCHEMA_VERSION) v.push(`schema_version must be the plain int ${SCHEMA_VERSION.toString()}`);
  const run = field('run_id');
  if (!isStr(run) || !RUN_ID.test(run)) v.push('run_id: malformed');
  const capability = field('capability');
  if (!isStr(capability) || strip(capability) === '') v.push('capability: empty or not a string');
  const sem = field('semantic_scope');
  v.push(...semanticScopeViolations(sem));
  const policyProfile = field('policy_profile');
  if (!isStr(policyProfile)) v.push(`policy_profile must be a string, got ${typeName(policyProfile)}`);
  else if (!PROFILES.has(policyProfile)) v.push(`policy_profile: unknown profile ${repr(policyProfile)}`);
  for (const k of ['adapter', 'execution_mode']) {
    if (!isStr(field(k))) v.push(`${k} must be a string, got ${typeName(field(k))}`);
  }
  v.push(...nonStringEntries(sem));
  const mech = field('mechanical_scope');
  if (!isDict(mech)) return [...v, 'mechanical_scope is not an object'];
  const tc = field('truth_change');
  if (!isDict(tc)) return [...v, 'truth_change is not an object'];
  if (mech.has('allowed_operations')) v.push(...operationViolations(get(mech, 'allowed_operations')));
  v = [
    ...v,
    ...unknownKeys(mech, [...MECHANICAL_KEYS, 'allowed_operations'])
      .map(k => `unknown mechanical_scope key: ${k} (schemas are closed at every level)`),
    ...MECHANICAL_KEYS.filter(k => !mech.has(k)).map(k => `mechanical_scope missing key: ${k}`),
  ];
  if (v.length > 0) return v;
  for (const k of ['allowed_paths', 'denied_paths']) {
    const paths = get(mech, k);
    if (!isList(paths) || paths.some(x => !isStr(x))) {
      v.push(`mechanical_scope.${k} must be a list of strings`);
      continue;
    }
    for (const pattern of paths as string[]) {
      const bad = canonicalViolation(pattern, pathMode(pattern));
      if (bad !== null) {
        v.push(`mechanical_scope.${k}: ${repr(pattern)} — ${bad} (an authorization artifact has one spelling)`);
      }
    }
  }
  const permissions = get(mech, 'permissions');
  if (!isDict(permissions)) {
    v.push('mechanical_scope.permissions must be an object');
  } else {
    v.push(...unknownKeys(permissions, PERMISSIONS).map(k =>
      `unknown permission: ${k} (a permission the validator does not know is not a permission it enforces)`));
    for (const p of PERMISSIONS) {
      if (!permissions.has(p)) v.push(`permissions missing declaration: ${p}`);
      else if (typeof get(permissions, p) !== 'boolean') v.push(`permissions.${p} must be a boolean`);
    }
  }
  return [...v, ...truthChangeViolations(tc)];
}

export type Change = readonly [status: string, path: string];

/** The NUL form (`-z`) is the only unambiguous one when a file name can hold a space, a quote or a tab. */
export function parseNameStatus(text: string, nul: boolean): Change[] {
  const out: Change[] = [];
  const paired = (status: string) => 'RC'.includes(status[0]);
  if (nul) {
    if (text !== '' && !text.endsWith('\x00')) {
      throw new ContractViolation('NUL stream does not end with its terminator: a truncated record '
        + 'must fail closed, not look like a complete diff');
    }
    const fields = text.split('\x00').filter(f => f !== '');
    let i = 0;
    while (i < fields.length) {
      const status = strip(fields[i]);
      if (!GIT_STATUS.test(status)) throw new ContractViolation(`unreadable status field: ${repr(status)}`);
      const n = paired(status) ? 2 : 1;
      if (i + n >= fields.length) throw new ContractViolation('truncated name-status record');
      for (const path of fields.slice(i + 1, i + 1 + n)) out.push([status, path]);
      i += 1 + n;
    }
    return out;
  }
  text.split('\n').forEach((line, index) => {
    if (strip(line) === '') return;
    const columns = line.split('\t');
    const status = strip(columns[0]);
    if (!GIT_STATUS.test(status)) {
      throw new ContractViolation(`line ${index + 1}: unreadable status ${repr(status)} (refusing to treat `
        + 'an unparsed diff as no changes)');
    }
    const need = paired(status) ? 3 : 2;
    if (columns.length !== need) {
      throw new ContractViolation(`line ${index + 1}: expected ${need} tab-separated columns for `
        + `status ${repr(status)}, got ${columns.length}`);
    }
    for (const path of columns.slice(1)) {
      if (path !== strip(path) || path.startsWith('"')) {
        throw new ContractViolation(`line ${index + 1}: this path cannot be read unambiguously in the textual `
          + 'form (padding or git quoting). Use `git diff --name-status -z` so path bytes are preserved');
      }
      out.push([status, path]);
    }
  });
  return out;
}

function surfaceViolations(allowed: readonly string[], policy: ResolvedPolicy): string[] {
  const v: string[] = [];
  const roots = get(policy, 'authorized_scope_roots');
  const mode = get(policy, 'execution_mode') as string;
  if (truthy(roots)) {
    // A root is a canonical path, so it has no final slash. The head of a pattern may have one:
    // `src/pay/` starts with `src/pay/`, so the head needs no trim either.
    const norm = roots as string[];
    for (const pattern of allowed) {
      const head = pattern.split('*')[0];
      if (!norm.some(r => head === r || head.startsWith(`${r}/`))) {
        v.push(`allowed_paths entry ${repr(pattern)} is outside every authorized scope root ${repr(norm)}`);
      }
    }
    const recursive = allowed.filter(isPattern).length;
    const exact = allowed.length - recursive;
    const capPatterns = get(policy, 'max_recursive_scope_patterns');
    const capExact = get(policy, 'max_exact_paths');
    if (isInt(capPatterns) && BigInt(recursive) > capPatterns) {
      v.push(`${recursive} recursive scope patterns exceed the authorized maximum of ${capPatterns.toString()} `
        + '(aggregate breadth is breadth)');
    }
    if (isInt(capExact) && BigInt(exact) > capExact) {
      v.push(`${exact} exact paths exceed the authorized maximum of ${capExact.toString()} (enumeration rebuilds breadth)`);
    }
  }
  const forbidden = stringsOf(get(policy, 'forbidden_path_patterns'));
  // Every profile carries its grammar, and no overlay can touch it.
  const grammar = get(policy, 'pattern_grammar') as JsonObject;
  for (const pattern of allowed) {
    if (forbidden.includes(pattern)) {
      v.push(`allowed_paths entry ${repr(pattern)} is broader than the authorized profile permits for ${mode} runs`);
    }
    const why = patternViolation(pattern, grammar);
    if (why !== null) {
      v.push(`allowed_paths entry ${repr(pattern)} is not admissible under the ${mode} pattern grammar: ${why}`);
    }
  }
  return v;
}

/** The order of the checks is the contract. */
function changeViolations(
  [status, path]: Change, manifest: JsonObject, policy: ResolvedPolicy, operations: readonly string[] | null,
): string[] {
  const bad = canonicalViolation(path, 'path');
  if (bad !== null) return [`${repr(path)}: ${bad}`];
  const mech = get(manifest, 'mechanical_scope') as JsonObject;
  const tc = get(manifest, 'truth_change') as JsonObject;
  const permissions = get(mech, 'permissions') as JsonObject;
  const matches = (patterns: Json) => stringsOf(patterns).some(p => match(path, p));

  if (GOVERNANCE_FLOOR.some(g => match(path, g))) {
    return [`${path}: governance floor (the run cannot rewrite the contracts, policies, or gates that judge it - `
      + 'use the harness-hardening flow)'];
  }
  if (matches(get(policy, 'denied_path_patterns'))) return [`${path}: denied by the authorized policy (denied_path_patterns)`];
  if (matches(get(mech, 'denied_paths'))) {
    return [`${path}: denied_paths is absolute (deny wins over every policy, truth type, and expansion)`];
  }
  const v: string[] = [];
  const triggers = new Map<string, readonly string[]>(PERMISSION_TRIGGERS);
  const extra = get(policy, 'protected_path_classes');
  if (isDict(extra)) {
    for (const [permission, patterns] of extra) {
      const builtIn = triggers.get(permission);
      triggers.set(permission, builtIn === undefined ? stringsOf(patterns) : [...builtIn, ...stringsOf(patterns)]);
    }
  }
  for (const [permission, patterns] of triggers) {
    if (patterns.some(p => match(path, p)) && !truthy(get(permissions, permission))) {
      v.push(`${path}: touches ${permission} which the manifest declares false`);
    }
  }
  if (operations !== null && !operations.includes(status) && !operations.includes(status[0])) {
    v.push(`${path}: operation ${repr(status)} is outside allowed_operations ${repr([...operations])}`);
  }
  const kinds = truthClasses(path);
  if (kinds.length > 0) {
    for (const kind of sortedStrings(kinds)) {
      const ceiling = get(policy, kind);
      // Only spec semantics can be `gated`: every profile holds the oracle and the baseline at
      // `human-only`, and an overlay only lowers a ceiling. So the grant below is the one of a spec.
      if (ceiling !== 'gated') {
        v.push(`${path}: the authorized profile allows ${kind} only as ${repr(ceiling)} - the manifest cannot raise `
          + 'its own ceiling');
      } else if (get(tc, 'policy') !== 'semantic-amendment') {
        v.push(`${path}: ${kind} write requires truth_change.policy == 'semantic-amendment' `
          + '(a spec amendment never authorizes the oracle)');
      } else if (!stringsOf(get(tc, 'allowed_spec_paths')).includes(path)) {
        v.push(`${path}: ${kind} write outside allowed_spec_paths (exact paths only)`);
      }
    }
    return v;
  }
  if (!matches(get(mech, 'allowed_paths'))) v.push(`${path}: outside allowed_paths`);
  return v;
}

/** `profile` is the policy floor, issued outside the run: a manifest is a proposal, not an authorization. */
export function validateScope(manifest: Json, changes: readonly Change[], profile?: Json | ResolvedPolicy): string[] {
  const malformed = validateManifest(manifest);
  if (malformed.length > 0) return ['manifest is not schema-valid; refusing to judge the diff', ...malformed];
  const m = manifest as JsonObject;
  let policy: ResolvedPolicy;
  try {
    policy = resolvePolicy(profile ?? null);
  } catch (e) {
    if (!(e instanceof ContractViolation)) throw e;
    return [`no usable policy: the scope manifest is the worker's proposal, never its authorization (${e.message})`];
  }
  const v: string[] = [];
  const mode = get(policy, 'execution_mode') as string;
  if (get(m, 'policy_profile') !== get(policy, 'profile_id')) {
    v.push(`the manifest names profile ${repr(get(m, 'policy_profile'))} but the run was authorized under `
      + repr(get(policy, 'profile_id')));
  }
  if (get(m, 'execution_mode') !== mode) {
    v.push(`execution_mode ${repr(get(m, 'execution_mode'))} contradicts the authorized profile ${repr(mode)}`);
  }
  if (!pyIn(get(m, 'adapter'), get(policy, 'adapters') as Json[])) {
    v.push(`adapter ${repr(get(m, 'adapter'))} is not allowed under the authorized profile`);
  }
  const mech = get(m, 'mechanical_scope') as JsonObject;
  if (truthy(get(policy, 'requires_scope_roots')) && !truthy(get(policy, 'authorized_scope_roots'))) {
    return [...v, `this profile is not executable on its own: ${mode} runs need a policy `
      + 'instance carrying authorized_scope_roots, issued by the launcher (a base profile constrains form, never surface)'];
  }
  v.push(...surfaceViolations(get(mech, 'allowed_paths') as string[], policy));
  const ceiling = get(policy, 'permission_ceiling');
  for (const [permission, granted] of get(mech, 'permissions') as JsonObject) {
    if (granted === true && isDict(ceiling) && get(ceiling, permission) === false) {
      v.push(`manifest grants ${permission} but the authorized profile's ceiling for ${mode} `
        + 'runs is false — a run does not widen its own permissions');
    }
  }
  const allowedByPolicy = get(policy, 'allowed_operations');
  let operations = mech.has('allowed_operations') ? (get(mech, 'allowed_operations') as string[]) : null;
  if (isList(allowedByPolicy)) {
    const policyOperations = allowedByPolicy as string[];
    if (operations === null) {
      operations = policyOperations;
    } else {
      const added = difference(operations, policyOperations);
      if (added.length > 0) {
        v.push(`manifest allows operations ${reprList(added)} the authorized profile does not`);
        operations = sortedStrings(operations.filter(o => policyOperations.includes(o)));
      }
    }
  }
  for (const change of changes) v.push(...changeViolations(change, m, policy, operations));
  return v;
}

const COMMON_FIELDS = ['schema_version', 'run_id', 'issue_ref', 'terminal', 'claim_state'];
const HARDENING = ['pr_url', 'head_sha', 'approval_fingerprint', 'general_hardening_report_sha256',
  'mutation_hardening_report_sha256', 'owner_disposition_sha256'];
const BLOCKER = ['blocker_kind', 'issue_comment_url'];
const NO_CHANGE = ['evidence_target_sha256', 'no_change_corroboration_sha256', 'classification', 'corroborated'];
interface TerminalSpec { readonly required: readonly string[]; readonly forbidden: readonly string[]; readonly claim: string }
const BY_TERMINAL: Record<string, TerminalSpec> = {
  PR_READY_AWAITING_HUMAN: { required: HARDENING, forbidden: [...BLOCKER, ...NO_CHANGE], claim: 'parked' },
  NAMED_BLOCKER: { required: BLOCKER, forbidden: [...HARDENING, ...NO_CHANGE], claim: 'released' },
  NO_CHANGE_REQUIRED: { required: NO_CHANGE, forbidden: [...HARDENING, ...BLOCKER], claim: 'released' },
};
const HASHED = ['approval_fingerprint', 'general_hardening_report_sha256', 'mutation_hardening_report_sha256',
  'owner_disposition_sha256', 'evidence_target_sha256', 'no_change_corroboration_sha256'];

function prReadyViolations(result: JsonObject): string[] {
  const v: string[] = [];
  if (!HEX40.test(str(get(result, 'head_sha')))) v.push('head_sha: expected a full 40-hex commit id');
  const url = str(get(result, 'pr_url'));
  const parts = url.split('/');
  if (!PR_URL.test(url)) v.push('pr_url: malformed');
  else if (!ALLOWED_FORGE_HOSTS.includes(parts[2])) {
    v.push(`pr_url: host ${repr(parts[2])} is not an allowed forge (${repr(ALLOWED_FORGE_HOSTS)})`);
  } else if (parts.slice(3, 5).join('/') !== str(get(result, 'issue_ref')).split('#')[0]) {
    v.push("pr_url does not belong to the issue's repository");
  }
  return v;
}

function blockerViolations(result: JsonObject): string[] {
  const v: string[] = [];
  const url = str(get(result, 'issue_comment_url'));
  if (!COMMENT_URL.test(url)) {
    v.push('issue_comment_url: expected .../issues/<n>#issuecomment-<id>');
  } else {
    const parts = url.split('/');
    const [host, repository, issue] = [parts[2], parts.slice(3, 5).join('/'), parts[6].split('#')[0]];
    const reference = str(get(result, 'issue_ref')).split('#');
    // Python unpacks the two halves here, so a reference with another shape is an error, not a violation.
    if (reference.length !== 2) throw new InputError('issue_ref does not split into a repository and a number');
    if (!ALLOWED_FORGE_HOSTS.includes(host)) v.push(`issue_comment_url: host ${repr(host)} is not an allowed forge`);
    if (repository !== reference[0] || issue !== reference[1]) {
      v.push(`issue_comment_url points at ${repository}#${issue} but the result is for ${str(get(result, 'issue_ref'))} `
        + '(a blocker must be reported on its own issue)');
    }
  }
  if (!pyIn(get(result, 'blocker_kind'), BLOCKER_KINDS)) {
    v.push(`blocker_kind: illegal value ${repr(get(result, 'blocker_kind'))} (legal: ${repr(BLOCKER_KINDS)})`);
  }
  return v;
}

function noChangeViolations(result: JsonObject): string[] {
  const v: string[] = [];
  const classification = get(result, 'classification');
  if (pyIn(classification, CLASSIFICATIONS_BLOCKING)) {
    v.push(`${str(classification)} never resolves the graph - route it to NAMED_BLOCKER`);
  } else if (!pyIn(classification, CLASSIFICATIONS_TERMINAL)) {
    v.push(`classification: illegal value ${repr(classification)} (legal terminal classifications: `
      + `${repr(CLASSIFICATIONS_TERMINAL)})`);
  }
  if (get(result, 'corroborated') !== true) {
    v.push('NO_CHANGE_REQUIRED requires corroborated: true (a candidate is not a terminal)');
  }
  return v;
}

export function validateResult(result: Json): string[] {
  if (!isDict(result)) return ['result is not an object'];
  const terminal = get(result, 'terminal');
  if (!isStr(terminal) || !TERMINALS.includes(terminal)) {
    return [`illegal terminal: ${repr(terminal)} (legal: ${repr(TERMINALS)})`];
  }
  const spec = BY_TERMINAL[terminal];
  const known = [...COMMON_FIELDS, ...spec.required, ...spec.forbidden];
  const shape = [
    ...unknownKeys(result, known).map(k => `unknown field for ${terminal}: ${k} (strict union: no free fields)`),
    ...sortedStrings(COMMON_FIELDS.filter(f => !result.has(f))).map(f => `missing required field: ${f}`),
    ...sortedStrings(spec.required.filter(f => !result.has(f))).map(f => `terminal ${terminal} requires field: ${f}`),
    ...sortedStrings(spec.forbidden.filter(f => result.has(f)))
      .map(f => `terminal ${terminal} must not carry ${f} (field belongs to another terminal)`),
  ];
  if (shape.length > 0) return shape;

  const v: string[] = [];
  if (get(result, 'schema_version') !== SCHEMA_VERSION) {
    v.push(`schema_version must be the plain int ${SCHEMA_VERSION.toString()}`);
  }
  if (!RUN_ID.test(str(get(result, 'run_id')))) v.push('run_id: malformed');
  if (!ISSUE_REF.test(str(get(result, 'issue_ref')))) v.push('issue_ref: malformed (expected owner/repo#N)');
  const claim = get(result, 'claim_state');
  if (!pyIn(claim, CLAIM_STATES)) v.push(`claim_state: illegal value ${repr(claim)}`);
  else if (claim !== spec.claim) {
    v.push(`terminal ${terminal} requires claim_state ${repr(spec.claim)} (got ${repr(claim)}) - a claim outlives no terminal`);
  }
  for (const f of HASHED) {
    if (result.has(f) && !HEX64.test(str(get(result, f)))) v.push(`${f}: not a sha256 hex digest`);
  }
  if (terminal === 'PR_READY_AWAITING_HUMAN') v.push(...prReadyViolations(result));
  if (terminal === 'NAMED_BLOCKER') v.push(...blockerViolations(result));
  if (terminal === 'NO_CHANGE_REQUIRED') v.push(...noChangeViolations(result));
  const blob = plainJson(result).toLowerCase();
  for (const claimed of MERGE_CLAIMS) {
    if (blob.includes(`"${claimed}"`)) v.push(`a run never claims ${repr(claimed)} - merging is the human's act`);
  }
  return v;
}
