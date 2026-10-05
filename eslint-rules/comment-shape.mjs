import { commentBlocks, isDirective } from './comment-blocks.mjs'

/** `local/comment-shape`: a comment is short, has a body, and is not archived code. */

// A comment that opens as a statement and closes as one. Git keeps removed code.
const CODE_LIKE = /^\s*(const|let|var|return|if|for|while|import|export|function|await)\b[\s\S]*[;{)]\s*$/

// A short JSX comment with one of these words gives a reason, so it is not a label.
const CAUSAL = /\b(because|so that|otherwise|or else|avoids?|prevents?|breaks?|needs?|must|cannot|keeps?)\b/i

const MAX_LABEL_WORDS = 6

// A comment says one fact that the code cannot say. A fact fits in three lines.
const MAX_LINES = 3

// A JSDoc tag line is a type for the checker, not prose.
const TAG = /^\s*@/

/** @type {import('eslint').Rule.RuleModule} */
const commentShape = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Empty comments, archived code, JSX labels and comments of more than three lines',
    },
    schema: [],
    messages: {
      empty: 'Empty comment: delete it.',
      code: 'Commented-out code: git keeps it, a comment does not.',
      label:
        'This JSX comment only names the markup again ({{text}}): the JSX says it, and the comment lies when the markup changes.',
      long:
        'This comment takes {{n}} lines (maximum {{max}}): keep the one fact the code cannot say, and delete the rest.',
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

          const lines = group
            .flatMap((x) => x.value.replace(/^\*+/, '').split('\n'))
            .map((l) => l.replace(/^\s*\*\s?/, ''))
          const clean = lines.join('\n').trim()

          if (CODE_LIKE.test(clean)) {
            context.report({ node: first, messageId: 'code' })
            continue
          }

          const prose = lines.filter((l) => l.trim() !== '' && !TAG.test(l)).length
          if (prose > MAX_LINES) {
            context.report({ node: first, messageId: 'long', data: { n: prose, max: MAX_LINES } })
          }
        }
      },
    }
  },
}

export default commentShape
