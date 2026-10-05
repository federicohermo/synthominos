import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { commentBlocks } from './comment-blocks.mjs';

/** `local/comment-anchor`: a comment cites no file that is gone, tells no history, names no numbered spec. */

// Every citation with the shape of a file.
const CITATION = /[\w@./-]*[\w-]\.(?:tsx?|css|mjs|cjs|json|md|yml|yaml)\b/g;

// The libraries of TypeScript have the shape of a file and are not in this tree.
const OUTSIDE = /^lib\.[\w.]+\.d\.ts$/;

// `worktrees`: `.claude/worktrees/` holds full checkouts of other branches.
const SKIPPED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.stryker-tmp', 'worktrees']);

// `used to` alone and `before` are out: most of their matches are not history.
const HISTORY = [
  /\b(previously|formerly|until\s+recently)\b/i,
  /\bno\s+longer\b/i,
  /\banymore\b/i,
  /(?<!\b(?:is|are|was|were|be|been|being)\s)\bused\s+to\s+be\b/i,
];

// A numbered spec of the old regime: `spec 031`, a bare `031`, `AC6`. The second pattern
// keeps out a decimal, a hex color, a part of a path and a measure (`050 ms`).
export const PROVENANCE = [
  /\bspecs?\s*\(?\d{3}\b/i,
  /(?<![\w.,#/-])0\d{2}(?![\w.,/-])(?!\s*(?:ms|s|px|Hz|dB|%)\b)/,
  /\bAC\d+\b/,
];

/**
 * The first provenance form in `text`, or `null`. The gate over the `.md` files uses it too.
 *
 * @param {string} text
 * @returns {string | null}
 */
export function provenanceIn(text) {
  for (const pattern of PROVENANCE) {
    const found = text.match(pattern);
    if (found) return found[0].trim();
  }
  return null;
}

/** One index for each root, built **once in a process**. */
const indexes = new Map();

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

// A citation matches by basename: the check catches a deleted or renamed file, not a wrong path.
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
