import js from '@eslint/js'
import markdown from '@eslint/markdown'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import vitest from '@vitest/eslint-plugin'
import importX from 'eslint-plugin-import-x'
import tailwind from 'eslint-plugin-better-tailwindcss'
import { getDefaultSelectors } from 'eslint-plugin-better-tailwindcss/defaults'
import { globalIgnores } from 'eslint/config'
import commentShape from './eslint-rules/comment-shape.mjs'
import commentAnchor from './eslint-rules/comment-anchor.mjs'

const ESTADO_GLOBAL = ['zustand', 'redux', '@reduxjs/toolkit', 'jotai', 'valtio', 'recoil', 'mobx', 'mobx-react-lite']

const GRUPO_ESTADO = {
  group: ESTADO_GLOBAL,
  message: 'No global state: the state lives in App.tsx and goes down through props.',
}

const ZONAS = [
  {
    target: './src',
    from: './mcp-server',
    message: 'mcp-server/ is tooling: it imports from src/, never the reverse.',
  },
]

// All four forms occur: the tests that call `vi.resetModules()` import again with `import()`.
const NODOS_CON_RUTA = ['ImportDeclaration', 'ImportExpression', 'ExportNamedDeclaration', 'ExportAllDeclaration']

const SIN_EXTENSION = '[source.value=/^[.].*(?<![.]ts|[.]tsx|[.]mjs|[.]css|[.]json)$/]'

// An override replaces `no-restricted-syntax`: a block that adds its own selector repeats these.
const REGLAS_DEL_REPO = [
  {
    // Vite resolves a missing extension. Raw node, which runs the MCP server, does not.
    selector: NODOS_CON_RUTA.map((nodo) => nodo + SIN_EXTENSION).join(', '),
    message: 'Every local import has an explicit extension: ./music.ts, not ./music.',
  },
  {
    selector: 'ExportAllDeclaration',
    message: 'No barrels: no export *. Import from the file that defines the symbol.',
  },
  {
    selector: 'TSEnumDeclaration',
    message: 'Zero enum: a closed set is a const object plus a derived union type.',
  },
  {
    selector: "CallExpression[callee.name='createContext'], CallExpression[callee.property.name='createContext']",
    message: 'No global state: no Context, Redux or Zustand. The state lives in App.tsx.',
  },
]

// `react-refresh/only-export-components` lets a `.tsx` export only its component: effect logic
// declared there cannot be tested.
const REGLA_EFECTOS = {
  selector: "CallExpression[callee.name=/^use(Layout)?Effect$/]",
  message: 'A .tsx does not declare the logic of an effect: it goes in a .ts module, and the .tsx mounts it.',
}

export default tseslint.config([
  // `.claude/worktrees` holds full checkouts, and the per-path overrides below do not match
  // them. The other harness folders are generated copies of a linted source.
  globalIgnores([
    'dist', '.claude/worktrees', '.claude/skills', '.claude/rules', '.claude/agents', '.codex',
    '.agents/skills/*/scripts', '*/**/AGENTS.md',
    // The output of a mutation run.
    '.stryker-tmp', 'reports',
  ]),

  {
    // No inline directive: a real exception is a per-file override in this file, with its reason.
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      noInlineConfig: true,
    },
  },

  {
    // Without this block, this file gets 0 rules.
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 'latest',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'import-x': importX },
    settings: {
      // The node resolver, not the TypeScript one: the repo has no alias, and the native binary
      // of `unrs-resolver` needs an install script that `pnpm-workspace.yaml` blocks.
      'import-x/resolver-next': [importX.createNodeResolver({ extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'] })],
    },
    rules: {
      // The default `basePath` is `process.cwd()`: run from `src/`, the zones match nothing and
      // the rule passes.
      'import-x/no-restricted-paths': ['error', { basePath: import.meta.dirname, zones: ZONAS }],

      // `import-x/no-cycle` is absent: it finds zero cycles and adds ~15 s to a lint of ~22 s.

      // With `verbatimModuleSyntax`, a type imported without `type` breaks the build.
      // `disallowTypeAnnotations: false` allows `typeof import('./x.ts')`, which the tests use
      // to name the type of a module they must not import.
      '@typescript-eslint/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],
      '@typescript-eslint/no-import-type-side-effects': 'error',

      // `allowArray`: failure messages interpolate a `Cell`, which is `[number, number]`.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowArray: true }],

      // `node:test` returns a promise that must not be awaited.
      '@typescript-eslint/no-floating-promises': ['error', {
        allowForKnownSafeCalls: [
          { from: 'package', name: 'test', package: 'node:test' },
          { from: 'package', name: 'describe', package: 'node:test' },
          { from: 'package', name: 'it', package: 'node:test' },
        ],
      }],

      'no-restricted-syntax': ['error', ...REGLAS_DEL_REPO],

      '@typescript-eslint/no-non-null-assertion': 'error',

      // The coverage threshold of 100 has no escape. The rule reads text: a comment that only
      // names a term fails too.
      'no-warning-comments': ['error', {
        terms: ['v8 ignore', 'c8 ignore', 'istanbul ignore'],
        location: 'anywhere',
      }],
    },
  },

  {
    // `main.tsx`: `index.html` guarantees `#root`. `invariants.ts`: the `while` guarantees a
    // non-empty queue. `Board.tsx`: the handler lives in a descendant of the `[role="grid"]`,
    // and an `if` would be a branch that no test can cover.
    files: ['src/main.tsx', 'src/pieces/invariants.ts', 'src/board-editing/Board.tsx'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },

  {
    // A `!` on a node that the test set up makes the test fail if the node is missing.
    files: [
      'src/**/__tests__/**/*.{ts,tsx}', '__tests__/*.ts', 'docs/__tests__/*.ts',
      'specs/__tests__/*.ts', '.claude/scripts/__tests__/*.ts', '.agents/scripts/__tests__/*.ts',
      '.spec-anchored/__tests__/*.ts', 'mcp-server/**/__tests__/**/*.ts',
    ],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      'mcp-server/**/*.ts', '__tests__/*.ts', 'docs/__tests__/*.ts',
      'specs/__tests__/*.ts', '.claude/scripts/**/*.ts', '.agents/scripts/**/*.ts', '.spec-anchored/**/*.ts', '*.config.ts',
    ],
    languageOptions: { globals: globals.node },
  },

  {
    // `configs.flat`: the top export of the 7.x plugin is the eslintrc one, and flat config
    // rejects it at startup.
    files: ['src/**/*.tsx', 'src/**/use-*.ts'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },
  {
    files: ['src/**/*.tsx'],
    extends: [reactRefresh.configs.vite, jsxA11y.flatConfigs.strict],
  },
  {
    // `interactive-supports-focus`: the grid uses roving tabindex, so the cells take the focus
    // and the container does not. `no-static-element-interactions`: the keyboard sibling of
    // `onContextMenu` is the global listener of `use-input.ts`.
    files: ['src/board-editing/Board.tsx'],
    rules: {
      'jsx-a11y/interactive-supports-focus': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
    },
  },

  {
    // The editor suggests these, and no gate read them. Order and wrapping are not checked.
    // In a `.ts` module the plugin finds a class string only by the name of its constant.
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'better-tailwindcss': tailwind },
    settings: {
      'better-tailwindcss': {
        entryPoint: 'src/styles/index.css',
        selectors: [...getDefaultSelectors(), { kind: 'variable', name: '^VELO_[A-Z_]+$', match: [{ type: 'strings' }] }],
      },
    },
    rules: {
      ...tailwind.configs.correctness.rules,
      'better-tailwindcss/enforce-canonical-classes': 'error',
      'better-tailwindcss/no-deprecated-classes': 'error',
      'better-tailwindcss/no-duplicate-classes': 'error',
      'better-tailwindcss/no-unnecessary-whitespace': 'error',
    },
  },

  {
    // The typescript-eslint variant also sees an `import type`.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [GRUPO_ESTADO] }],
    },
  },
  {
    // The tests are ignored: the ban is on a component, not on the harness that mounts it (#147).
    files: ['src/**/*.tsx'],
    ignores: ['src/**/__tests__/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...REGLAS_DEL_REPO, REGLA_EFECTOS],
    },
  },
  {
    // Each mounts its effect in one line that calls a tested function of a `.ts` module.
    files: ['src/playback/Playhead.tsx', 'src/spectrum/Spectrum.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...REGLAS_DEL_REPO],
    },
  },

  {
    files: [
      'src/**/__tests__/**/*.{ts,tsx}', '__tests__/*.ts', 'docs/__tests__/*.ts',
      'specs/__tests__/*.ts', '.claude/scripts/__tests__/*.ts',
      'eslint-rules/__tests__/*.ts', '.agents/scripts/__tests__/*.ts', '.spec-anchored/__tests__/*.ts',
    ],
    plugins: { vitest },
    rules: {
      // `fixable: false`: `--fix` must fail on a `.only`, not delete it in silence.
      'vitest/no-focused-tests': ['error', { fixable: false }],
      'vitest/no-disabled-tests': 'error',
      'vitest/expect-expect': 'error',
      // Vitest takes a message as the second argument of `expect`.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      'vitest/no-identical-title': 'error',
    },
  },

  {
    // `@vitest/eslint-plugin` does not read the tests of `node --test`.
    files: ['mcp-server/**/__tests__/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...REGLAS_DEL_REPO, {
        selector: 'CallExpression[callee.object.name=/^(test|it|describe|suite)$/][callee.property.name=/^(only|skip)$/]',
        message: 'No .only and no .skip: they let the suite pass green. Fix the test or delete it.',
      }],
    },
  },

  {
    // The two trees, not `**/*.{ts,tsx}`: `eslint-rules/` must not lint itself.
    files: ['src/**/*.{ts,tsx}', 'mcp-server/src/**/*.ts'],
    plugins: { local: { rules: { 'comment-shape': commentShape, 'comment-anchor': commentAnchor } } },
    rules: {
      'local/comment-shape': 'error',
      'local/comment-anchor': 'error',
    },
  },

  {
    files: ['**/*.md'],
    plugins: { markdown },
    language: 'markdown/gfm',
    languageOptions: {
      // Without this, the keys of the frontmatter read as headings.
      frontmatter: 'yaml',
    },
    // The object, not the string `'markdown/recommended'`: `tseslint.config()` throws on a
    // string when the config loads.
    extends: [markdown.configs.recommended],
    rules: {
      // Its slugger differs from the one of GitHub on a heading with backticks or an underscore.
      // `docs/__tests__/enlaces-resueltos.test.ts` checks the anchors.
      'markdown/no-missing-link-fragments': 'off',
    },
  },

  {
    files: ['src/**/*.constants.ts', 'src/**/*.types.ts', 'src/**/constants/**', 'src/**/types/**'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'Program',
        message: 'A value or a type lives in the module that owns it: no *.constants.ts, *.types.ts, constants/ or types/ under src/.',
      }],
    },
  },

  {
    // The harness is out: the kernel in `.spec-anchored/` keeps the shape of the Python
    // functions it ports.
    files: ['src/**/*.{ts,tsx}', 'mcp-server/src/**/*.ts'],
    rules: { complexity: ['error', 10] },
  },
  // The ceilings measured on 2026-10-04. A ceiling only goes down, and no file joins the list.
  ...[
    ['src/board-editing/Board.tsx', 22],
    ['src/board-editing/input.ts', 17],
    ['src/pieces/invariants.ts', 16],
    ['src/pieces/transform.ts', 15],
    ['src/circuit/sequence.ts', 13],
    ['src/playback/playhead-loop.ts', 12],
    ['src/playback/__tests__/test-context.ts', 12],
    ['src/circuit/routing.ts', 11],
    ['mcp-server/src/symbols.ts', 25],
  ].map(([file, ceiling]) => ({ files: [file], rules: { complexity: ['error', ceiling] } })),
])
