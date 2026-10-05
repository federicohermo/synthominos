/*
 * What counts as ONE comment.
 *
 * `local/comment-shape` and `local/comment-anchor` share it. Two copies would drift with no
 * signal: the day one rule groups comments another way, the two count different things and both
 * stay green.
 */

/**
 * A comment that speaks to a tool and not to a reader.
 *
 * Without this filter an `eslint-disable` would be a finding of `empty` or of `history`.
 */
const DIRECTIVES = /^\s*(eslint|ts-|@ts-|prettier-|global|exported|istanbul|c8|v8|webpack|turbo)/

/**
 * The comments of a file, grouped in blocks, without the directives.
 *
 * **A run of consecutive `//` lines is ONE block, not five.** A paragraph split over five
 * lines is not five findings of one problem.
 *
 * It returns arrays of comments and not their joined text: `comment-shape` needs the node of
 * the first one to report, and the type of each one to know whether it is a docblock.
 *
 * @param {import('eslint').SourceCode} source
 * @returns {import('estree').Comment[][]}
 */
export function commentBlocks(source) {
  const blocks = []
  for (const comment of source.getAllComments()) {
    if (DIRECTIVES.test(comment.value)) continue
    const previous = blocks.at(-1)
    const continues =
      previous !== undefined &&
      comment.type === 'Line' &&
      previous.at(-1).type === 'Line' &&
      comment.loc.start.line === previous.at(-1).loc.end.line + 1
    if (continues) previous.push(comment)
    else blocks.push([comment])
  }
  return blocks
}

/**
 * Whether a JSX comment is a directive.
 *
 * `comment-shape` reads the text inside a JSX container before that comment reaches
 * `getAllComments`, so it needs the filter outside the grouping too.
 *
 * @param {string} text
 */
export function isDirective(text) {
  return DIRECTIVES.test(text)
}
