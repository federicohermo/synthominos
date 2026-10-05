import { describe, it } from 'vitest'
import { RuleTester } from 'eslint'
import rule from '../comment-shape.mjs'

// `RuleTester` calls the global `describe` and `it`, and Vitest runs here without globals.
RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

const FORTY_IN_A_HUNDRED = [
  ...Array.from({ length: 40 }, (_, i) => `// note number ${i}\nconst a${i} = ${i};`),
  ...Array.from({ length: 20 }, (_, i) => `const b${i} = ${i};`),
].join('\n')

tester.run('comment-shape', rule, {
  valid: [
    { name: 'a comment at the end of a line of code', code: 'const a = 1; // note' },
    { name: 'forty comments in a hundred lines', code: FORTY_IN_A_HUNDRED },
    {
      name: 'a docblock of three lines',
      code: '/**\n * First line,\n * second line,\n * and the third.\n */\nconst a = 1;',
    },
    {
      name: 'a run of three consecutive `//`',
      code: '// First line of the run,\n// second,\n// and third.\nconst a = 1;',
    },
    {
      name: 'blank lines and JSDoc tags do not count',
      code: '/**\n * First line,\n * second,\n *\n * and third.\n *\n * @param {string} a\n * @returns {string}\n */\nconst f = a => a;',
    },
    {
      name: 'a block followed by a `//` is two comments',
      code: '/* one,\n two */\n// three,\n// four\nconst a = 1;',
    },
    {
      name: 'two runs with code between them are two comments',
      code: '// one,\n// two\nconst a = 1;\n// three,\n// four\nconst b = 2;',
    },
    {
      name: 'four lines of code with a comment at the end are four comments',
      code: 'const a = 1; // one\nconst b = 2; // two\nconst c = 3; // three\nconst d = 4; // four',
    },
    {
      name: 'a comment at the end of a line is not part of the run below it',
      code: 'const a = 1; // one\n// two,\n// three,\n// four.\nconst b = 2;',
    },
    {
      name: 'tool directives',
      code: '/* global window */\n// @ts-expect-error the type is loosened on purpose\nconst a = 1;',
    },
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
      name: 'a docblock of four lines',
      code: '/**\n * First line,\n * second line,\n *\n * third line,\n * and a fourth one that is too many.\n */\nconst a = 1;',
      errors: [{ messageId: 'long', data: { n: '4', max: '3' } }],
    },
    {
      name: 'a run of four consecutive `//`',
      code: '// One,\n// two,\n// three,\n// four.\nconst a = 1;',
      errors: [{ messageId: 'long', data: { n: '4', max: '3' } }],
    },
    {
      name: 'a comment at the end of a line, continued on its column below it',
      code: 'const a = 1; // One,\n             // two,\n             // three,\n             // four.',
      errors: [{ messageId: 'long', data: { n: '4', max: '3' } }],
    },
  ],
})
