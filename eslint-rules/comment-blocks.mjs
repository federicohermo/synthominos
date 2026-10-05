// A comment that speaks to a tool, not to a reader.
const DIRECTIVES = /^\s*(eslint|ts-|@ts-|prettier-|global|exported|istanbul|c8|v8|webpack|turbo)/

/**
 * The comments of a file without the directives. A run of consecutive `//` lines is one block.
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
 * @param {string} text
 */
export function isDirective(text) {
  return DIRECTIVES.test(text)
}
