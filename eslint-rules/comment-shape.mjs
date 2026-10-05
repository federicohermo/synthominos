import { commentBlocks, isDirective } from './comment-blocks.mjs'

/**
 * `local/comment-shape`: the shape of a comment, only where the shape shows a problem of
 * ACCURACY.
 *
 * Ported from `bait-landing-frontend`, and not copied: that rule as it is gives 1007 findings
 * in 92 of the 93 files of this tree, and a gate that turns the whole tree red is not fixed.
 * It is switched off. Four of its eight checks stay.
 *
 * One criterion decides the cut: **the main reader of the comments of this repo is a model
 * that reads the code to change it.** For that reader, what matters is not how much a comment
 * says. It is that what it says is still true. A long and true comment is cheap, and a short
 * and rotten one is expensive. So the checks that stay are about accuracy, not length.
 */

// ## No check of length, of density, or of a comment at the end of a line
//
// A reader will want to add these first. The four were measured on this tree and rejected:
//
// - Length (302 findings) and density (49) are budgets of PROSE. Switching off the comment
//   concepts of a model degrades code refinement by up to 90 % (arXiv:2512.16790), and
//   refining code is what happens here. This repo does not shorten a comment for its length.
// - A trailing comment (49) is allowed, by a decision of the owner of the repo. It anchors
//   the explanation to the exact token and costs no line.
// - Anchoring (25) gave 25 false positives, all on JSX of `Board.tsx` that is right.
//
// `no-inline-comments`, of the core of ESLint, does what the trailing check did. It is
// rejected for the same reason, and it is frozen
// (https://github.com/eslint/eslint/issues/19350).

// Code archived in a comment: it opens as a statement and closes as one. What was commented
// out "just in case" is in git, which also says when and why it left.
const CODE_LIKE = /^\s*(const|let|var|return|if|for|while|import|export|function|await)\b[\s\S]*[;{)]\s*$/

// A short JSX comment that holds one of these gives a reason, and a reason is not a label
// however short it is.
const CAUSAL = /\b(because|so that|otherwise|or else|avoids?|prevents?|breaks?|needs?|must|cannot|keeps?)\b/i

const MAX_LABEL_WORDS = 6

/**
 * The limit of the summary, in lines. A constant of the module, not an option.
 *
 * `schema` is empty on purpose: the five numbers the original took as options were the prose
 * budgets this port rejects, and none is left to configure.
 */
const MAX_SUMMARY_LINES = 2

/** @type {import('eslint').Rule.RuleModule} */
const commentShape = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Empty comments, archived code, JSX labels and the summary of a docblock',
    },
    schema: [],
    messages: {
      empty: 'Empty comment: delete it.',
      code: 'Commented-out code: git keeps it, a comment does not.',
      label:
        'This JSX comment only names the markup again ({{text}}): the JSX says it, and the comment lies when the markup changes.',
      summary:
        'The first paragraph of the docblock takes {{n}} lines (maximum {{max}}): keep {{max}} and move the rest to the body, which has no limit.',
    },
  },

  create(context) {
    const source = context.sourceCode

    return {
      JSXExpressionContainer(node) {
        const m = source.getText(node).match(/^\{\s*\/\*([\s\S]*?)\*\/\s*\}$/)
        if (!m) return

        const text = m[1].trim()
        if (isDirective(text)) return

        if (text.split(/\s+/).length <= MAX_LABEL_WORDS && !CAUSAL.test(text)) {
          context.report({ node, messageId: 'label', data: { text: text.slice(0, 40) } })
        }
      },

      'Program:exit'() {
        for (const group of commentBlocks(source)) {
          const first = group[0]
          const body = first.value.trim()

          if (!body || /^\*+$/.test(body)) {
            context.report({ node: first, messageId: 'empty' })
            continue
          }

          // Take the margin `*` off, so that the text judged is the text a person reads.
          const clean = group
            .map((x) =>
              x.value
                .replace(/^\*+/, '')
                .split('\n')
                .map((l) => l.replace(/^\s*\*\s?/, ''))
                .join('\n'),
            )
            .join('\n')
            .trim()

          if (CODE_LIKE.test(clean)) {
            context.report({ node: first, messageId: 'code' })
            continue
          }

          /*
           * `summary` looks ONLY at docblocks. A run of `//` is not asked for a summary: that
           * would be 516 edits to invent a convention the repo never had.
           */
          const isDocblock = first.type === 'Block' && first.value.startsWith('*')
          if (!isDocblock) continue

          /*
           * The summary is the FIRST PARAGRAPH, up to the first blank line. It is not what
           * comes before the first `@tag`, which is how the original cut: of the 617
           * docblocks of the repo only 2 have a tag, so that cut makes the whole docblock
           * "the summary". `@remarks` is accepted and not required.
           *
           * The body after the first paragraph has no limit, and that is the point: what does
           * not fit goes down, it is not deleted.
           */
          const summary = clean.split(/\n\s*\n/)[0]
          const lines = summary.split('\n').length
          if (lines > MAX_SUMMARY_LINES) {
            context.report({
              node: first,
              messageId: 'summary',
              data: { n: lines, max: MAX_SUMMARY_LINES },
            })
          }
        }
      },
    }
  },
}

export default commentShape
