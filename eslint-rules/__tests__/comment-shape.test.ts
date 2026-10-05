import { describe, it } from 'vitest'
import { RuleTester } from 'eslint'
import rule from '../comment-shape.mjs'

/*
 * `RuleTester` does not register its cases as tests by itself: it calls the GLOBAL
 * `describe` and `it`, and this repo does not run Vitest with `globals: true`. Without these
 * two lines the run fails with `No test suite found in file`.
 */
RuleTester.describe = describe
RuleTester.it = it

/*
 * JSX is on for every case and not only for the `label` cases, the only ones that need it:
 * espree parses the code that does not use it the same way, and two `RuleTester` for one rule
 * give two suites with one name.
 */
const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

/** A docblock of 48 lines whose first paragraph takes 2. */
const DOCBLOCK_48 = [
  '/**',
  ' * A summary that opens in two lines,',
  ' * and ends on the second.',
  ' *',
  ...Array.from({ length: 43 }, (_, i) => ` * Line ${i} of the body, which has no limit.`),
  ' */',
  'const a = 1;',
].join('\n')

/**
 * Forty comments in exactly one hundred lines: no check of density.
 *
 * It also covers the two ways a run is NOT grouped: line comments with code between them.
 */
const FORTY_IN_A_HUNDRED = [
  ...Array.from({ length: 40 }, (_, i) => `// note number ${i}\nconst a${i} = ${i};`),
  ...Array.from({ length: 20 }, (_, i) => `const b${i} = ${i};`),
].join('\n')

tester.run('comment-shape', rule, {
  valid: [
    // Nothing is reported for length, for density, or for being at the end of a line.
    { name: 'a comment at the end of a line of code', code: 'const a = 1; // note' },
    { name: 'a docblock of 48 lines', code: DOCBLOCK_48 },
    { name: 'forty comments in a hundred lines', code: FORTY_IN_A_HUNDRED },

    // The limit is on the first paragraph, and `@remarks` is not required.
    {
      name: 'with `@remarks`, which is accepted',
      code: '/**\n * A summary of one line.\n *\n * @remarks The detail, which has no limit.\n */\nconst a = 1;',
    },
    {
      name: 'without `@remarks`, which is not required',
      code: '/**\n * A summary of one line.\n *\n * The detail, which does not need the tag.\n */\nconst a = 1;',
    },

    {
      // A run of `//` is ONE comment. Only a docblock is asked for a summary, so three
      // lines of `//` in a row pass.
      name: 'a run of three consecutive `//`',
      code: '// First line of the run,\n// second,\n// and third.\nconst a = 1;',
    },
    {
      // A `//` right under a block does NOT continue the block: they are two comments.
      name: 'a block followed by a `//`',
      code: '/* a loose note */\n// another note\nconst a = 1;',
    },
    {
      name: 'tool directives',
      code: '/* global window */\n// @ts-expect-error the type is loosened on purpose\nconst a = 1;',
    },

    // What is NOT a label.
    {
      name: 'a JSX container that is not a comment',
      code: 'const value = 1;\nconst App = () => <div>{value}</div>;',
    },
    {
      name: 'a JSX comment of more than six words',
      code: 'const App = () => <div>{/* The tour fixes the order of these two nodes */}</div>;',
    },
    {
      name: 'a short JSX comment that gives a reason',
      code: 'const App = () => <div>{/* Here because the grid rules */}</div>;',
    },
    {
      name: 'a JSX comment that is a directive',
      code: 'const App = () => <div>{/* global window */}</div>;',
    },
  ],

  invalid: [
    // One case for each `messageId`, with the `messageId`: a count of errors lets a rule that
    // reports the wrong message pass.
    {
      name: 'a comment with no body',
      code: 'const a = 1;\n//',
      errors: [{ messageId: 'empty' }],
    },
    {
      name: 'a comment that holds only asterisks',
      code: 'const a = 1;\n/***/',
      errors: [{ messageId: 'empty' }],
    },
    {
      name: 'code archived in a comment',
      code: '// const old = compute(1);',
      errors: [{ messageId: 'code' }],
    },
    {
      name: 'a JSX comment that only names the markup again',
      code: 'const App = () => <div>{/* The board */}</div>;',
      errors: [{ messageId: 'label', data: { text: 'The board' } }],
    },
    {
      name: 'a docblock whose first paragraph takes three lines',
      code: '/**\n * First line of the summary,\n * second line of the summary,\n * and a third one that is too many.\n */\nconst a = 1;',
      errors: [{ messageId: 'summary', data: { n: '3', max: '2' } }],
    },
  ],
})
