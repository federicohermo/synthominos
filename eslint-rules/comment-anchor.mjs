import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { commentBlocks } from './comment-blocks.mjs';

/*
 * A comment cannot point at something that is not there.
 *
 * Ported from `bait-landing-frontend`, and turned around. There the check FORBIDS a file name
 * in a comment, because its citations point outside the repo and nothing can verify them. On
 * this tree that rule gave 184 findings, and 309 of those citations resolved. So here the
 * citation is allowed and the rule checks that it RESOLVES.
 *
 * Three anchors rot the same way, and the rule checks the three: a file that is gone, a story
 * of how the code got here, and the number of a spec of the old regime.
 */

/**
 * Every citation with the shape of a file. It runs on the whole block with `g`: the finding is
 * the citation, not the block, because one block can hold two dead ones.
 */
const CITATION = /[\w@./-]*[\w-]\.(?:tsx?|css|mjs|cjs|json|md|yml|yaml)\b/g;

/**
 * What has the shape of a file and is not a file of this tree: the libraries of TypeScript.
 *
 * The builtins of node need no entry: `CITATION` takes no `:`, so `node:fs` is no candidate.
 */
const OUTSIDE = /^lib\.[\w.]+\.d\.ts$/;

/** What the index does not walk: nothing inside is code of this repo. */
const SKIPPED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.stryker-tmp']);

/**
 * History, in four patterns. A comment says why the code is so today, not how it got here.
 *
 * `used to` alone is not here: "the index is used to resolve" and "the key used to sign" are
 * not history, and they are most of its matches. `before` is not here either: it is a word of
 * position far more often than of time.
 */
const HISTORY = [
  /\b(previously|formerly|until\s+recently)\b/i,
  /\bno\s+longer\b/i,
  /\banymore\b/i,
  /(?<!\b(?:is|are|was|were|be|been|being)\s)\bused\s+to\s+be\b/i,
];

/**
 * A reference to a spec of the old regime, where a spec was a numbered issue. The number
 * resolves to nothing in the tree. The one table that maps a number to its issue is in
 * `docs/architecture/decisions/2026-10-04-contract-per-capability.md`.
 *
 * Three forms: `spec 031`, a bare `031` used as a name, and a criterion without its
 * capability, `AC6`. A criterion of a contract carries its code: `AC-CIR-006`.
 *
 * The second form is the wide one. Its guards keep out a decimal (`0.050`), a hex color, a
 * part of an identifier or of a path, and a measure (`050 ms`).
 */
export const PROVENANCE = [
  /\bspecs?\s*\(?\d{3}\b/i,
  /(?<![\w.,#/-])0\d{2}(?![\w.,/-])(?!\s*(?:ms|s|px|Hz|dB|%)\b)/,
  /\bAC\d+\b/,
];

/** The first provenance form in `text`, or `null`. The gate over the `.md` files uses it too. */
export function provenanceIn(text) {
  for (const pattern of PROVENANCE) {
    const found = text.match(pattern);
    if (found) return found[0].trim();
  }
  return null;
}

/** One index for each root, built **once in a process**: see `resolves`. */
const indexes = new Map();

/**
 * Every basename of the tree, without what is not code of this repo.
 *
 * It loops with an explicit stack, so a deep tree cannot reach the recursion limit. It returns
 * basenames and not paths: see `resolves`.
 */
function buildIndex(root) {
  const names = new Set();
  const pending = [''];
  while (pending.length > 0) {
    const rel = pending.pop();
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        names.add(entry.name);
        continue;
      }
      if (SKIPPED_DIRS.has(entry.name)) continue;
      pending.push(rel === '' ? entry.name : `${rel}/${entry.name}`);
    }
  }
  return names;
}

/** The index of `root`, built the first time it is asked for. */
function basenames(root) {
  const cached = indexes.get(root);
  if (cached !== undefined) return cached;
  const built = buildIndex(root);
  indexes.set(root, built);
  return built;
}

/**
 * Whether the citation points at something that exists.
 *
 * **The index first and `existsSync` after, and that order is measured**: a call to
 * `existsSync` for each citation spent about 315 syscalls that the index answers from memory.
 *
 * **It matches by basename and not by path, on purpose.** `// see circuit/sequence.ts` passes
 * when some `sequence.ts` exists, also if the path is wrong. An exact path from the root would
 * turn the 309 live citations into a problem of format. What this check catches is the file
 * that was deleted or renamed, which is the failure measured over more than 3000 projects in
 * arXiv:2212.01479.
 */
function resolves(root, citation, base) {
  return basenames(root).has(base) || existsSync(join(root, citation));
}

/** @type {import('eslint').Rule.RuleModule} */
const commentAnchor = {
  meta: {
    type: 'problem',
    docs: { description: 'A comment cites no file that is gone, tells no history, and names no numbered spec' },
    schema: [],
    messages: {
      dead:
        'The comment cites `{{citation}}`, which does not resolve against the tree. A deleted or renamed file leaves the comment false: update the citation, or describe the role and not the place.',
      history:
        'The comment tells history ("{{form}}"). If it is a constraint that makes the code be so today, write it without the historical form. If it tells how the code got here, delete it: git and the PR keep the history.',
      provenance:
        'The comment names a spec of the old regime ("{{form}}"). The number resolves to nothing in the tree: name the rule itself, or the criterion with its capability code, `AC-<COD>-###`.',
    },
  },
  create(context) {
    const source = context.sourceCode;
    const root = context.cwd;
    return {
      Program() {
        for (const block of commentBlocks(source)) {
          const text = block.map((c) => c.value).join('\n');

          for (const citation of text.match(CITATION) ?? []) {
            const base = citation.slice(citation.lastIndexOf('/') + 1);
            if (OUTSIDE.test(citation) || resolves(root, citation, base)) continue;
            context.report({ node: block[0], messageId: 'dead', data: { citation } });
          }

          for (const pattern of HISTORY) {
            const found = text.match(pattern);
            if (found) {
              context.report({ node: block[0], messageId: 'history', data: { form: found[0].trim() } });
              break;
            }
          }

          const form = provenanceIn(text);
          if (form !== null) context.report({ node: block[0], messageId: 'provenance', data: { form } });
        }
      },
    };
  },
};

export default commentAnchor;
