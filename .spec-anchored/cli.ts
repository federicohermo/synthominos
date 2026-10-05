import { readFileSync } from 'node:fs';
import {
  CANON_ALGO, PROFILES, buildApproval, canonicalJsonBytes, canonicalTextBytes, hashJson, parseNameStatus, resolvePolicy,
  validateResult, validateScope, verifyApproval, type ResolvedPolicy,
} from './kernel.ts';
import { ContractViolation, InputError, json, prettyJson, sha256Hex, strictJsonLoads } from './pyjson.ts';

// `resolve-policy` is not in the Python original: a policy file with an overlay does not hash to its own bytes.
// Exit 0 is acceptance, 1 is a refusal, 2 is a wrong call.

export interface Io {
  /** The text of a file, or of the standard input for `-`. It throws `InputError` when it cannot. */
  read(path: string): string;
  out(data: string | Buffer): void;
  err(text: string): void;
}

const COMMANDS: Record<string, { readonly positional: number; readonly options: Record<string, boolean>; readonly required: readonly string[] }> = {
  'canonicalize': { positional: 1, options: { '--kind': true, '--emit': true, '--allow-hard-breaks': false }, required: [] },
  'build-approval': { positional: 1, options: { '--policy': true }, required: ['--policy'] },
  'verify-approval': { positional: 1, options: { '--bundle': true, '--policy': true }, required: ['--bundle', '--policy'] },
  'validate-scope': {
    positional: 0, options: { '--manifest': true, '--changes': true, '--nul': false, '--profile': true },
    required: ['--manifest', '--changes', '--profile'],
  },
  'validate-result': { positional: 1, options: {}, required: [] },
  'resolve-policy': { positional: 1, options: {}, required: [] },
};
const CHOICES: Record<string, readonly string[]> = { '--kind': ['json', 'text'], '--emit': ['hash', 'bytes'] };

class UsageError extends Error {}

interface Call {
  readonly command: string;
  readonly files: readonly string[];
  readonly options: ReadonlyMap<string, string>;
  readonly flags: ReadonlySet<string>;
}

function parse(argv: readonly string[]): Call {
  // `Object.hasOwn`, not `in`: `toString` is a key of every object.
  const [command, ...rest] = argv;
  if (!Object.hasOwn(COMMANDS, command)) throw new UsageError(`expected one of: ${Object.keys(COMMANDS).join(', ')}`);
  const spec = COMMANDS[command];
  const files: string[] = [];
  const options = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!Object.hasOwn(spec.options, arg)) {
      if (arg.startsWith('--')) throw new UsageError(`${command}: unknown option ${arg}`);
      files.push(arg);
    } else if (!spec.options[arg]) {
      flags.add(arg);
    } else {
      i += 1;
      const value = rest[i];
      if (value === undefined) throw new UsageError(`${command}: ${arg} needs a value`);
      if (Object.hasOwn(CHOICES, arg) && !CHOICES[arg].includes(value)) {
        throw new UsageError(`${command}: ${arg} must be one of ${CHOICES[arg].join(', ')}`);
      }
      options.set(arg, value);
    }
  }
  if (files.length !== spec.positional) throw new UsageError(`${command}: expected ${spec.positional} file argument(s)`);
  for (const name of spec.required) if (!options.has(name)) throw new UsageError(`${command}: ${name} is required`);
  return { command, files, options, flags };
}

function report(io: Io, violations: readonly string[], accepted: string): number {
  if (violations.length === 0) {
    io.out(`${accepted}\n`);
    return 0;
  }
  io.out(`FAIL - ${violations.length} violation(s):\n${violations.map(v => `  - ${v}\n`).join('')}`);
  return 1;
}

function run({ command, files, options, flags }: Call, io: Io): number {
  const document = (path: string) => strictJsonLoads(io.read(path));
  const option = (name: string) => options.get(name) as string;
  const resolve = (reference: string): ResolvedPolicy =>
    resolvePolicy(PROFILES.has(reference) ? reference : document(reference));
  const policy = (name: string) => resolve(option(name));

  if (command === 'canonicalize') {
    const text = io.read(files[0]);
    const bytes = options.get('--kind') === 'json'
      ? canonicalJsonBytes(strictJsonLoads(text))
      : canonicalTextBytes(text, !flags.has('--allow-hard-breaks'));
    io.out(options.get('--emit') === 'bytes' ? bytes : `${sha256Hex(bytes)}\n`);
    return 0;
  }
  if (command === 'build-approval') {
    const [bundle, fingerprint] = buildApproval(document(files[0]), { policy: policy('--policy') });
    io.out(`${prettyJson(json({ 'canonicalization': CANON_ALGO, 'approval_bundle': bundle, 'APPROVAL-FINGERPRINT': fingerprint }))}\n`);
    return 0;
  }
  if (command === 'verify-approval') {
    const resolved = policy('--policy');
    const bundle = document(option('--bundle'));
    const [, fingerprint] = buildApproval(bundle, { policy: resolved });
    return report(io, verifyApproval(document(files[0]), bundle, resolved),
      `OK - approval record binds to ${fingerprint.slice(0, 12)}...`);
  }
  if (command === 'validate-scope') {
    const manifest = document(option('--manifest'));
    const changes = parseNameStatus(io.read(option('--changes')), flags.has('--nul'));
    return report(io, validateScope(manifest, changes, policy('--profile')),
      `OK - ${changes.length} changed path(s) within the approved scope`);
  }
  if (command === 'resolve-policy') {
    const resolved = resolve(files[0]);
    io.out(`${prettyJson(json({ policy: resolved, policy_sha256: hashJson(resolved) }))}
`);
    return 0;
  }
  return report(io, validateResult(document(files[0])), 'OK - result satisfies the terminal contract');
}

export function main(argv: readonly string[], io: Io): number {
  try {
    return run(parse(argv), io);
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`usage: spec-anchored <command> ...\n${e.message}\n`);
      return 2;
    }
    if (e instanceof ContractViolation || e instanceof InputError) {
      io.err(`FAIL - ${e.message}\n`);
      return 1;
    }
    throw e;
  }
}

/** Python reads a text file with universal newlines: `\r\n` and `\r` arrive as `\n`. */
function decode(bytes: Buffer, path: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  } catch {
    throw new InputError(`${path} is not valid UTF-8`);
  }
}

export function realIo(): Io {
  return {
    read(path) {
      try {
        return decode(readFileSync(path === '-' ? 0 : path), path);
      } catch (e) {
        if (e instanceof InputError) throw e;
        throw new InputError(`cannot read ${path}`);
      }
    },
    out: data => void process.stdout.write(data),
    err: text => void process.stderr.write(text),
  };
}
