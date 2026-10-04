import { readFileSync } from 'node:fs';
import {
  CANON_ALGO, PROFILES, buildApproval, canonicalJsonBytes, canonicalTextBytes, hashJson, parseNameStatus, resolvePolicy,
  validateResult, validateScope, verifyApproval, type ResolvedPolicy,
} from './kernel.ts';
import { ContractViolation, InputError, json, prettyJson, sha256Hex, strictJsonLoads } from './pyjson.ts';

/**
 * The command line of the kernel: `node .spec-anchored/spec-anchored.ts <command>`.
 *
 *   canonicalize <file> [--kind json|text] [--emit hash|bytes] [--allow-hard-breaks]
 *   build-approval <file> --policy <profile|file>
 *   verify-approval <record> --bundle <file> --policy <profile|file>
 *   validate-scope --manifest <file> --changes <file> [--nul] --profile <profile|file>
 *   validate-result <file>
 *   resolve-policy <profile|file>
 *
 * `resolve-policy` is not in the Python original. It prints the effective policy and the
 * `policy_sha256` that an approval bundle must carry: a policy file with an overlay does not hash
 * to its own bytes.
 *
 * A file named `-` is the standard input. Exit 0 is acceptance, 1 is a refusal, 2 is a wrong call.
 */

/** The outside of the command: files, the standard input, and the two streams. */
export interface Io {
  /** The text of a file, or of the standard input for `-`. It throws `InputError` when it cannot. */
  read(path: string): string;
  out(data: string | Buffer): void;
  err(text: string): void;
}

/** Which options each command takes, and whether each one carries a value. */
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

interface Call { readonly command: string; readonly files: readonly string[]; readonly options: ReadonlyMap<string, string> }

function parse(argv: readonly string[]): Call {
  const [command, ...rest] = argv;
  const spec = command === undefined ? undefined : COMMANDS[command];
  if (command === undefined || spec === undefined) {
    throw new UsageError(`expected one of: ${Object.keys(COMMANDS).join(', ')}`);
  }
  const files: string[] = [];
  const options = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!(arg in spec.options)) {
      if (arg.startsWith('--')) throw new UsageError(`${command}: unknown option ${arg}`);
      files.push(arg);
    } else if (!spec.options[arg]) {
      options.set(arg, 'true');
    } else {
      i += 1;
      const value = rest[i];
      if (value === undefined) throw new UsageError(`${command}: ${arg} needs a value`);
      if (arg in CHOICES && !CHOICES[arg].includes(value)) {
        throw new UsageError(`${command}: ${arg} must be one of ${CHOICES[arg].join(', ')}`);
      }
      options.set(arg, value);
    }
  }
  if (files.length !== spec.positional) throw new UsageError(`${command}: expected ${spec.positional} file argument(s)`);
  for (const name of spec.required) if (!options.has(name)) throw new UsageError(`${command}: ${name} is required`);
  return { command, files, options };
}

/** Prints the violations, or the message of acceptance. */
function report(io: Io, violations: readonly string[], accepted: string): number {
  if (violations.length === 0) {
    io.out(`${accepted}\n`);
    return 0;
  }
  io.out(`FAIL - ${violations.length} violation(s):\n${violations.map(v => `  - ${v}\n`).join('')}`);
  return 1;
}

function run({ command, files, options }: Call, io: Io): number {
  const document = (path: string) => strictJsonLoads(io.read(path));
  const option = (name: string) => options.get(name) as string;
  // A policy is a profile id, or the artifact a launcher issued. It is resolved exactly once.
  const resolve = (reference: string): ResolvedPolicy =>
    resolvePolicy(PROFILES.has(reference) ? reference : document(reference));
  const policy = (name: string) => resolve(option(name));

  if (command === 'canonicalize') {
    const text = io.read(files[0]);
    const bytes = options.get('--kind') === 'json'
      ? canonicalJsonBytes(strictJsonLoads(text))
      : canonicalTextBytes(text, !options.has('--allow-hard-breaks'));
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
    const changes = parseNameStatus(io.read(option('--changes')), options.has('--nul'));
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

/** The command. It returns the exit code and never throws on a bad input. */
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

/** The real files and streams. */
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
