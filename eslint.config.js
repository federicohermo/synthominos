import js from '@eslint/js'
import markdown from '@eslint/markdown'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import vitest from '@vitest/eslint-plugin'
import importX from 'eslint-plugin-import-x'
import { globalIgnores } from 'eslint/config'
import commentShape from './eslint-rules/comment-shape.mjs'
import commentAnchor from './eslint-rules/comment-anchor.mjs'

/**
 * Los paquetes de estado global que `CLAUDE.md` prohibe. Estaba escrito y no lo verificaba
 * nadie, y es de las reglas mas faciles de romper sin querer: la tentacion no aparece al
 * escribir el import sino tres niveles de props mas abajo.
 */
const ESTADO_GLOBAL = ['zustand', 'redux', '@reduxjs/toolkit', 'jotai', 'valtio', 'recoil', 'mobx', 'mobx-react-lite']

const GRUPO_ESTADO = {
  group: ESTADO_GLOBAL,
  message: 'Sin estado global: el estado vive en App.tsx y baja por props.',
}

/**
 * The forbidden zones, by path. `mcp-server/` is tooling, and the direction is one: it imports
 * from `src/`, NEVER the reverse.
 */
const ZONAS = [
  {
    target: './src',
    from: './mcp-server',
    message: 'mcp-server/ is tooling: it imports from src/, never the reverse.',
  },
]

/**
 * The rules the documentation states, as esquery selectors with no plugin. The ones for all of
 * the repo live in this array; `REGLA_EFECTOS`, for `.tsx` files only, lives below in its block.
 *
 * They share one array because `no-restricted-syntax` is REPLACED between overrides: a block
 * below that adds its own rule repeats these, or turns them off for the files it matches.
 */
/**
 * Los cuatro nodos que nombran un modulo por su ruta. Se listan los cuatro y no solo
 * `ImportDeclaration` porque las otras formas pueden aparecer —hoy hay ocho `import()`
 * en los tests que reimportan con `vi.resetModules()`— y una regla que cubre una sola de ellas es
 * exactamente la red que este spec vino a borrar: pasa en verde y se lee como completa.
 *
 * La medida que fijo la lista: `import-x/no-restricted-paths`, que resuelve rutas en vez de
 * mirar strings, dispara sobre las tres formas sin que haya que enumerarlas. Este selector
 * escrito a mano tiene que enumerarlas para empatarle.
 *
 * Un `export { x }` sin `from` tiene `source: null`, asi que el atributo no matchea y no
 * dispara. Un `import(variable)` tampoco: sin `source.value` no hay string que juzgar.
 */
const NODOS_CON_RUTA = ['ImportDeclaration', 'ImportExpression', 'ExportNamedDeclaration', 'ExportAllDeclaration']

/**
 * El specifier local al que le falta la extension.
 *
 * `.mjs` entro con el spec 051: los tests de las dos reglas locales importan la regla, que
 * es un `.mjs`, y hasta ese spec ningun `.ts` de este repo podia importar uno —`allowJs`
 * estaba apagado en los dos tsconfig, que es por lo que los scripts de `.claude/scripts/`
 * se ejercen por subproceso—. Sin esta alternativa la regla lee `../comment-shape.mjs`
 * como un import SIN extension, que es justo lo contrario de lo que pasa.
 */
const SIN_EXTENSION = '[source.value=/^[.].*(?<![.]ts|[.]tsx|[.]mjs|[.]css|[.]json)$/]'

const REGLAS_DEL_REPO = [
  {
    // "Sin barrels, con extension explicita, sin alias." Omitir la extension no rompe la
    // app —Vite y el `moduleResolution: bundler` del tsconfig resuelven igual— asi que el
    // error seria invisible del lado del navegador y solo aparece al cargar `src/` con
    // node crudo, que es justo lo que hace el MCP server del 006.
    selector: NODOS_CON_RUTA.map((nodo) => nodo + SIN_EXTENSION).join(', '),
    message: 'Todo import local lleva extension explicita: ./music.ts, no ./music.',
  },
  {
    // La otra mitad de "sin barrels", que hasta el spec 049 no la miraba nadie. El nodo YA
    // esta en `NODOS_CON_RUTA`, pero ahi entra combinado con `SIN_EXTENSION`, o sea que el
    // selector de arriba verifica la extension y no el barrel: un `export * from './x.ts'`
    // lo CUMPLE. Lo que se prohibe aca es el mismo nodo sin ese filtro.
    //
    // El motivo esta en `docs/guides/conventions.md`: re-exportar hace cargar archivos de
    // mas y vuelve al modulo responsable de propagar esas re-exportaciones por HMR.
    //
    // **El nombre `index.ts` NO se prohibe, y no es un olvido.** Los tres que hay
    // —`mcp-server/src/index.ts`, `resources/index.ts` y `tools/index.ts`— son un
    // entrypoint y dos registros que arman un `readonly [...]`, no barrels; la convencion
    // escrita dice «ningun `index.ts` **de re-exportacion**» y ese calificativo un selector
    // no lo evalua. Un bloque `files: ['**/index.ts']` daria tres falsos positivos y ademas
    // les apagaria `REGLAS_DEL_REPO`, que es el trap de flat config que este archivo
    // persigue. Queda afuera el barrel que re-exporta a mano (`export { a } from './a.ts'`),
    // y se declara: media red escrita como media red es honesta.
    selector: 'ExportAllDeclaration',
    message: 'Sin barrels: nada de export *. Importar del archivo que define el simbolo.',
  },
  {
    // Hoy lo caza `erasableSyntaxOnly` en el typecheck, pero con el mensaje de TypeScript.
    // Aca falla con el motivo del repo y en el editor, mientras se escribe.
    selector: 'TSEnumDeclaration',
    message: 'Cero enum: conjunto cerrado = const-object + union type derivado.',
  },
  {
    // La otra mitad de "sin estado global": el import de `react` es legitimo en
    // un componente, asi que lo que hay que prohibir es la llamada, no el paquete.
    selector: "CallExpression[callee.name='createContext'], CallExpression[callee.property.name='createContext']",
    message: 'Sin estado global: ni Context, ni Redux, ni Zustand. El estado vive en App.tsx.',
  },
]

/**
 * "Un `.tsx` no declara la logica de un efecto." Hasta el spec 049 esta regla vivio solo en
 * `docs/guides/conventions.md` y estaba escrita mal en las dos mitades: decia que
 * los efectos eran seis —son nueve, contando el `useLayoutEffect` de `use-grid.ts` que
 * aparecio al implementar esta regla— y que ninguno vivia en un `.tsx` —viven dos—.
 *
 * El motivo no es estetico: `react-refresh/only-export-components` prohibe que un `.tsx`
 * exporte algo ademas del componente, asi que la logica de un efecto declarada ahi adentro
 * **no se puede exportar y por lo tanto no se puede testear**. Es el mismo argumento con el
 * que el spec 005 saco el dominio de `App.tsx`.
 *
 * Se ancla en el nombre y no en el import porque el import de `react` es legitimo en
 * un componente: lo que hay que prohibir es la llamada, igual que con `createContext`.
 *
 * **Y nombra los DOS hooks, no solo `useEffect`.** El spec 049 lo escribio con uno; al
 * implementarlo aparecio que `use-grid.ts` monta su efecto con `useLayoutEffect` —el 021 lo
 * eligio a proposito, para que medir el viewport no se vea durante un cuadro—, asi que un
 * selector anclado solo en `useEffect` dejaba abierta la mitad de la puerta: la misma logica,
 * en el mismo `.tsx`, con el otro nombre. Es exactamente la red con un agujero que se lee
 * como completa, que es lo que el spec 030 vino a borrar. Cero hallazgos con las dos: hoy
 * ningun `.tsx` declara un `useLayoutEffect`.
 */
const REGLA_EFECTOS = {
  selector: "CallExpression[callee.name=/^use(Layout)?Effect$/]",
  message: 'Un .tsx no declara la logica de un efecto: va a un modulo .ts y el .tsx lo monta.',
}

export default tseslint.config([
  /**
   * `.claude/worktrees/` esta ignorado por el mismo motivo por el que lo esta en
   * `.gitignore`: adentro vive un checkout completo del repo mientras corre una tarea
   * en paralelo.
   *
   * Y sin esta linea `pnpm lint` **falla** durante esas tareas, por un motivo que
   * parece un detalle y no lo es: los overrides de este archivo emparejan por RUTA, y
   * `.claude/worktrees/agent-x/src/main.tsx` no matchea `src/main.tsx`. O sea que las
   * tres aserciones no nulas que el repo declara deliberadas se leen como prohibidas
   * en la copia, y el rojo aparece en `main` por trabajo que ni siquiera es de `main`.
   */
  // The generated copies of the harness: `node .agents/scripts/sync.ts --check` verifies they
  // match their canonical source, which is linted. A nested `AGENTS.md` joins several rules.
  globalIgnores([
    'dist', '.claude/worktrees', '.claude/skills', '.claude/rules', '.claude/agents', '.codex',
    '.agents/skills/*/scripts', '*/**/AGENTS.md',
    // What a mutation run writes: the sandbox, which is a copy of the repo, and the report.
    '.stryker-tmp', 'reports',
  ]),

  {
    // Sin `files`, o sea que valen para todo el repo.
    //
    // `reportUnusedDisableDirectives` viene en `warn` por default en ESLint 9, y un warn no
    // rompe nada: el script pasa a correr con `--max-warnings 0` justamente para que si.
    //
    // `noInlineConfig` es la contraparte lint del "cero `any`, cero `@ts-ignore`" que el
    // repo ya cumple de hecho: medido antes de ponerlo, habia CERO `eslint-disable` en
    // `src/` y en `mcp-server/src/`. Se pone ahora porque ponerlo ahora es gratis. Si
    // manana hace falta una excepcion legitima, va como override por archivo en este
    // archivo —que se ve en el diff y se explica— y no como un comentario suelto que no.
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      noInlineConfig: true,
    },
  },

  {
    // Los `.js` del repo —hoy solo este archivo— no los lintaba NADIE: el unico bloque que
    // extendia `js.configs.recommended` estaba atado a `**/*.{ts,tsx}`, asi que el archivo
    // que decide que se verifica era el unico que no se verificaba. Medido con
    // `--print-config eslint.config.js`: 0 reglas.
    //
    // No necesita `disableTypeChecked` —que es lo que documenta typescript-eslint para este
    // caso— porque el bloque con tipos de abajo matchea `**/*.{ts,tsx}` y no lo alcanza.
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },

  {
    // TypeScript en todo el repo, CON informacion de tipos. `projectService: true` es la
    // forma que documenta typescript-eslint: cada archivo se typechequea con el tsconfig
    // que le corresponde —`tsconfig.app.json` para `src/`, `tsconfig.node.json` para
    // `vite.config.ts`, `mcp-server/tsconfig.json` para el server— sin listarlos aca.
    //
    // El costo esta medido y es lo que hace que entre: `recommendedTypeChecked` sobre el
    // repo entero da 100 hallazgos, y 97 son un solo patron de `node:test` que se apaga con
    // una opcion (ver `no-floating-promises` abajo). Lo que compra es prospectivo y es el
    // punto: `no-floating-promises` sobre `playback/` —donde `resume()` y `close()` devuelven
    // promesas— es el error que ningun test de este repo puede ver, porque el audio no se
    // testea por su sonido.
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
      // El resolver por defecto de import-x no conoce `.ts`. Se usa `createNodeResolver` y
      // no el resolver de TypeScript porque este repo no tiene alias ni `paths`: lo unico
      // que hay que resolver son rutas relativas con extension explicita, y para eso el
      // resolver de node alcanza y no arrastra el binario nativo (`unrs-resolver`), cuyo
      // script de instalacion queda bloqueado por el `allowBuilds` de `pnpm-workspace.yaml`.
      'import-x/resolver-next': [importX.createNodeResolver({ extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'] })],
    },
    rules: {
      // La direccion de dependencia, por ruta. Reemplaza a los cuatro overrides de
      // `no-restricted-imports` que verificaban lo mismo contando `../`.
      //
      // `basePath` no es opcional aunque tenga default: el default es `process.cwd()`, o sea
      // que las zonas se resuelven contra **desde donde se corrio eslint** y no contra la
      // raiz del repo. Medido: el mismo archivo con la misma violacion da 1 error desde la
      // raiz y **0 corriendo `eslint` desde `src/`**, sin avisar de nada. Es el modo de falla
      // que este archivo persigue —fallar en verde—, y anclarlo cuesta una linea.
      'import-x/no-restricted-paths': ['error', { basePath: import.meta.dirname, zones: ZONAS }],

      // `import-x/no-cycle` NO esta, y la ausencia es la decision. Se probó y se midió:
      // encuentra CERO ciclos y cuesta ~15 s sobre un `pnpm lint` que hoy tarda **21,78 s**
      // —o sea que lo pasaria de 21,78 a ~37, mas de vez y media— porque recorre el grafo
      // entero por archivo, y `mcp-server/` importa 31 simbolos de `src/`. El comentario
      // decia «25 segundos» y ese era el lint de otro momento del repo: el numero viejo es
      // lo que hacia que la decision se leyera como opinable.
      //
      // What it would buy: no zone orders the modules of `src/` any more, so a cycle between
      // two of them passes lint. Run once by hand when the layer zones left
      // (`eslint --rule '{"import-x/no-cycle":"error"}' src mcp-server/src`), it found ZERO
      // cycles. What is checked each time it comes up is the price, against the cycles found.
      //
      // **Y hay una arista nueva que el spec 048 agrega, en contra:** su hook corre el lint
      // UNA VEZ POR TURNO sobre la lista de lo que cambio —4,42 s medidos para un archivo,
      // con presupuesto de menos de 6 s—, y ahi `no-cycle` construye el grafo entero en ese
      // arranque sin una corrida completa sobre la que amortizarlo. O sea que el sobrecosto
      // se paga por turno, no una vez por PR.
      //
      // Si algun dia se enciende igual, el cambio NO es una linea:
      // `docs/guides/verification.md` da 23,7 s en paralelo contra 41,2 s en serie, y
      // `lint` es el nodo largo de ese paralelo, asi que esa medicion deja de ser cierta.

      // Los tres tsconfig tienen `verbatimModuleSyntax: true`, o sea que importar un tipo
      // sin `type` ROMPE EL BUILD en vez de avisar. La regla es autofixable: el error deja
      // de poder llegar al build.
      //
      // `disallowTypeAnnotations: false` deja pasar `typeof import('./x.ts')`, que es otra
      // cosa y no la que la regla existe para atrapar. Son dos usos y los dos estan en
      // tests que reimportan el modulo con `vi.resetModules()` / `vi.doMock`
      // (`playback/__tests__/route-source.test.ts:28` y
      // `pieces/__tests__/invariants.test.ts:114`): ahi `typeof import(...)` es la forma
      // idiomatica de nombrar el tipo de un modulo que el archivo justamente NO quiere
      // tener importado. Con `verbatimModuleSyntax` las dos formas se borran igual, asi que
      // reescribirlas cambiaria la intencion sin cambiar el runtime.
      '@typescript-eslint/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],
      '@typescript-eslint/no-import-type-side-effects': 'error',

      // `Cell` es `[number, number]` y el repo lo interpola a proposito en mensajes de
      // falla (`${TODAS[i]} / ${TODAS[j]}`). `allowArray` permite exactamente eso —arrays
      // cuyos elementos ya son interpolables— y deja parada la parte de la regla que
      // importa: objetos, `any` y nullish siguen prohibidos. Sin la opcion son 35
      // hallazgos, 25 de ellos en un solo archivo de tests.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowArray: true }],

      // `node:test` devuelve una promesa que NO hay que esperar: es la forma documentada de
      // escribir un test con `node --test`, que es lo que corre `mcp-server`. Son los 97
      // hallazgos de los 100 que da el preset. `allowForKnownSafeCalls` existe para esto y
      // apunta al paquete, no al nombre: un `test()` de otra procedencia sigue prohibido.
      '@typescript-eslint/no-floating-promises': ['error', {
        allowForKnownSafeCalls: [
          { from: 'package', name: 'test', package: 'node:test' },
          { from: 'package', name: 'describe', package: 'node:test' },
          { from: 'package', name: 'it', package: 'node:test' },
        ],
      }],

      'no-restricted-syntax': ['error', ...REGLAS_DEL_REPO],

      // La asercion no nula es un `any` chiquito: le dice al compilador que se calle sin
      // darle un motivo. `CLAUDE.md` la prohibe desde el spec 027 y hasta hoy no la
      // verificaba nadie, con el resultado esperable — el archivo decia que quedaban DOS
      // en produccion y son TRES.
      //
      // La regla se apaga en dos lugares y en ninguno mas, los dos abajo con su motivo.
      // Ese par de overrides pasa a ser la UNICA fuente del numero: mientras el conteo
      // vivio en la prosa de `CLAUDE.md` se desincronizo, que es exactamente el modo de
      // falla que el 030 vino a cerrar para las otras seis reglas.
      '@typescript-eslint/no-non-null-assertion': 'error',

      // El corolario del umbral 100, que hasta el 032 era prosa. Si una rama parece
      // inalcanzable la salida es borrarla o volverla alcanzable, nunca pedirle al
      // proveedor de coverage que la saltee: un umbral con escapes es un umbral mas bajo
      // sin dueno, que es el argumento con el que el 029 rechazo el 95.
      //
      // `location: 'anywhere'` y no el default `start`: los tres terminos aparecen en
      // medio de una frase, no encabezando el comentario.
      //
      // La regla mira TEXTO y no sintaxis, asi que **deletrear un termino para explicar
      // por que no usarlo lo viola igual**: es el precio de una regla textual y lo pagan
      // los tres docblocks que lo hacian —`vite.config.ts:155`, `specStatus.ts` y
      // `specWrite.ts`—, que hoy nombran el mecanismo en vez del termino.
      //
      // Los tres terminos viven aca y en ningun comentario del repo, pero ojo con el
      // motivo: **este archivo no esta bajo la regla**. La regla se declara en el bloque
      // `**/*.{ts,tsx}` y este es un `.js`, verificado con `--print-config eslint.config.js`
      // —no aparece—; y aunque lo estuviera, `terms` es un array de strings y no un
      // comentario. La perifrasis de arriba es por consistencia con los otros tres, no
      // porque el linter la exija aca.
      'no-warning-comments': ['error', {
        terms: ['v8 ignore', 'c8 ignore', 'istanbul ignore'],
        location: 'anywhere',
      }],
    },
  },

  {
    // Las TRES aserciones no nulas de produccion, cada una con el motivo por el que el
    // compilador no puede verlo. Van como override por archivo y no como comentario
    // suelto porque `noInlineConfig` no admite `eslint-disable`, y porque la regla escrita
    // ya predice este mecanismo palabra por palabra: «va como override por archivo en
    // `eslint.config.js` —que se ve en el diff y se explica— y no como un comentario
    // suelto» (`docs/guides/conventions.md`, y `CLAUDE.md` la primera mitad).
    //
    // Antes de agregar una cuarta, probar el `const`: la que habia en `engine.ts` existia
    // solo porque TypeScript pierde el estrechamiento al entrar al closure de un
    // `forEach` cuando la variable es un `let` de modulo, y salio gratis con una `const`
    // local (spec 027).
    //
    // - `main.tsx`         el idiom de Vite sobre un `#root` que el propio `index.html`
    //                      garantiza.
    // - `invariants.ts`    el `queue.shift()!` de un BFS, dentro de un `while` que ya
    //                      garantiza la cola no vacia.
    // - `Board.tsx`        el ancestro `[role="grid"]` existe por construccion: el
    //                      handler esta en un descendiente de esa grilla. El `if`
    //                      alternativo seria una rama inalcanzable, y el umbral 100 no
    //                      deja cubrirla.
    files: ['src/main.tsx', 'src/pieces/invariants.ts', 'src/board-editing/Board.tsx'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },

  {
    // En un test el `!` sobre un `find` o un `querySelector` que el propio test acaba de
    // fijar es la forma de que el test **falle** si el nodo no esta, que es justo lo que
    // se quiere. `CLAUDE.md` ya las declara deliberadas.
    files: [
      'src/**/__tests__/**/*.{ts,tsx}', '__tests__/*.ts', 'docs/__tests__/*.ts',
      'specs/__tests__/*.ts', '.claude/scripts/__tests__/*.ts', '.agents/scripts/__tests__/*.ts',
      '.spec-anchored/__tests__/*.ts', 'mcp-server/**/__tests__/**/*.ts',
    ],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },

  {
    // Los globals por entorno. Antes `globals.browser` se aplicaba a `**/*.{ts,tsx}`, o sea
    // tambien a `mcp-server/` y a `vite.config.ts`: verificado con `--print-config`,
    // `mcp-server/src/index.ts` recibia `window`, `document` y `AudioContext` definidos y
    // `process` NO. No rompia porque `no-undef` esta apagado para TypeScript —lo apaga el
    // preset de tseslint, y con razon: eso lo verifica el compilador—, pero era sorpresa
    // guardada y contradecia la regla que este mismo archivo escribe tres veces.
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Los gates que no son de la app van aca y no arriba, y es el arreglo del mismo
    // error con otra cara: leen el disco con `node:fs` y `node:url`, lanzan `gh`, y
    // ninguno toca un DOM. Mientras vivieron en `src/` caian en `globals.browser`, o
    // sea que recibian `window` y `document` definidos y `process` NO.
    files: [
      'mcp-server/**/*.ts', '__tests__/*.ts', 'docs/__tests__/*.ts',
      'specs/__tests__/*.ts', '.claude/scripts/**/*.ts', '.agents/scripts/**/*.ts', '.spec-anchored/**/*.ts', '*.config.ts',
    ],
    languageOptions: { globals: globals.node },
  },

  {
    // React only where React is: the hook rules read the `.tsx` files and the `use-*.ts`
    // hooks, which are the only files with hooks.
    //
    // La clave es `configs.flat[...]` y no `configs[...]`: en el plugin 7.x el export de
    // arriba volvio a ser el de eslintrc —`plugins` como array de strings— y flat config lo
    // rechaza con un error de arranque. El preset pasa de 2 reglas a 17: ademas de
    // `rules-of-hooks` y `exhaustive-deps` entran las del React Compiler, que segun react.dev
    // salen por este plugin y no por uno separado, y sirven aunque el compilador no se
    // adopte. `set-state-in-effect` es literalmente el patron que el spec 022 concentro en
    // `use-engine.ts`; `immutability` y `purity` son la version React de una funcion pura.
    files: ['src/**/*.tsx', 'src/**/use-*.ts'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },
  {
    // `only-export-components` solo tiene sentido donde puede haber un componente. Y lo
    // mismo `jsx-a11y`, que lee JSX: solo un `.tsx` tiene JSX.
    //
    // **`strict` y no `recommended`**, con los dos numeros medidos a la vista: sobre este
    // codigo `recommended` da UN hallazgo y `strict` da DOS, y el segundo es en el mismo
    // archivo y sobre una construccion que ya queda exenta abajo. O sea que `strict` no
    // cuesta nada mas hoy y cubre mas de aca en adelante. La diferencia real entre las dos
    // configs no es una lista de reglas distinta —son practicamente las mismas— sino que
    // `recommended` viene con excepciones cableadas: le acota los handlers a
    // `no-static-element-interactions` (por eso `onContextMenu` se le escapa), le pasa un
    // mapa de `tag: [roles]` tolerado a las dos de `element-to-role`, y deja
    // `no-noninteractive-tabindex` con `allowExpressionValues`.
    //
    // Este plugin **no necesita informacion de tipos**: lee el JSX y nada mas, asi que no
    // arrastra el costo del type-aware linting.
    //
    // Lo que NO cubre, y por eso este spec trae ademas un gate de navegador: ninguna de sus
    // configs exige `aria-label` en un control solo-icono ni `aria-pressed` en uno que
    // alterna. No puede distinguir un glifo de un texto ni saber cual boton es un toggle —
    // eso solo lo contesta el arbol de accesibilidad renderizado
    // (`src/__tests__/arbol-accesible.browser.test.tsx`).
    files: ['src/**/*.tsx'],
    extends: [reactRefresh.configs.vite, jsxA11y.flatConfigs.strict],
  },
  {
    // Los DOS hallazgos de `jsx-a11y` sobre el repo, con **un motivo por regla** porque son
    // dos construcciones distintas del mismo archivo y no una. Van como override por archivo
    // y con las reglas nombradas —no por glob ni apagando la categoria— por el mismo
    // mecanismo con el que se declaran las tres aserciones no nulas de arriba: `noInlineConfig`
    // no admite `eslint-disable`, asi que la excepcion se ve en el diff y se explica.
    //
    // Bloque propio y no una linea mas en el de `src/main.tsx` / `invariants.ts` /
    // `Board.tsx`: aquel nombra el mismo archivo pero explica otra cosa, y juntarlos haria
    // que un `Board.tsx` que dejara de necesitar una de las dos exenciones se lleve puesta
    // la otra.
    //
    // **(a) `interactive-supports-focus`** — `Board.tsx:331`, el `<div role="grid">`. La
    // regla pide que un elemento con rol interactivo sea focusable, y esta grilla **no lo es
    // a proposito**: implementa *roving tabindex*, o sea que la celda del cursor lleva
    // `tabIndex={0}` y las otras `-1` (`Board.tsx:184`), y el foco se mueve con las flechas.
    // Un contenedor focusable MAS celdas focusables daria 61 paradas de tabulacion donde el
    // patron correcto pide una, y es literalmente lo que `.agents/rules/ui.md` documenta:
    // «una region compuesta es UNA parada de tabulacion, y adentro se mueve con las flechas».
    //
    // **(b) `no-static-element-interactions`** — `Board.tsx:311`, el envoltorio posicionado
    // (`<div ref={boardRef} className="relative" onContextMenu={...}>`), que NO es la
    // grilla. La regla pide un handler de teclado hermano en el mismo nodo; aca la
    // contraparte de teclado existe pero vive en el listener global de `use-input.ts`, y esa
    // asimetria esta medida y escrita en `Board.tsx:300`–`:310`: react-dom registra
    // `touchstart`, `touchmove` y `wheel` como PASIVOS, asi que la rueda tiene que ir por
    // `addEventListener(..., { passive: false })` desde el hook. `contextmenu` no esta entre
    // esos tres y por eso si puede ir por prop — pero su hermano de teclado quedo del otro
    // lado igual.
    //
    // Las dos son la regla generica chocando contra una decision que el repo tomo, midio y
    // escribio. Si alguna de las dos construcciones cambia, la exencion deja de aplicar por
    // su propio argumento.
    files: ['src/board-editing/Board.tsx'],
    rules: {
      'jsx-a11y/interactive-supports-focus': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
    },
  },

  {
    // Los paquetes prohibidos. Es lo unico que quedo en `no-restricted-imports`: un paquete
    // de npm no tiene ruta en el repo, asi que las zonas de `import-x` no lo pueden ver.
    //
    // Se usa la variante de typescript-eslint y no la core porque tambien ve los
    // `import type`, que son justo los que un refactor descuidado usaria para colarse.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [GRUPO_ESTADO] }],
    },
  },
  {
    // La regla de los efectos, solo para la capa que puede tener un componente. Repite
    // `REGLAS_DEL_REPO` porque el override REEMPLAZA `no-restricted-syntax`: sin eso, este
    // bloque le apagaria a todo `.tsx` las otras cuatro.
    //
    // **`__tests__/` queda afuera por decision escrita, no por omision** (issue #147). El
    // glob `src/**/*.tsx` tambien matchea los **once** `.tsx` de test que hay hoy —doce
    // cuando aterrice el spec 050, que agrega `src/__tests__/arbol-accesible.browser.test.tsx`—
    // y ahi entrarian en verde: ninguno declara un efecto, sus tres apariciones de los dos
    // nombres (`Playhead.browser.test.tsx:17`, `use-grid.browser.test.tsx:18`,
    // `App.browser.test.tsx:19`) son comentarios. O sea que
    // el rojo no llegaria nunca y la decision se tomaria sola: un harness futuro que monte un
    // componente con efecto quedaria bloqueado por una regla que nunca decidio aplicarle. La
    // prohibicion es sobre la capa de componentes, no sobre lo que la monta, asi que los
    // directorios de test se nombran — igual que hacen los dos bloques vecinos que ya los
    // distinguen. Los tests siguen bajo `REGLAS_DEL_REPO` por el bloque general.
    files: ['src/**/*.tsx'],
    ignores: ['src/**/__tests__/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...REGLAS_DEL_REPO, REGLA_EFECTOS],
    },
  },
  {
    // Los DOS `.tsx` que montan un efecto, nombrados uno por uno y no por glob. El
    // precedente es el de las tres aserciones no nulas de arriba, y el motivo de que sea por
    // archivo es que un glob crece solo: `src/**/*.tsx` eximiria a todo componente
    // futuro sin que nadie lo decida.
    //
    // Los dos cumplen el motivo de la regla y violan su letra, que es lo que los hace
    // excepcion y no tolerancia. Son de UNA LINEA y no declaran logica propia:
    //
    //     useEffect(() => iniciarCabeza(capaRef.current, ref.current, resalteRef.current), [])
    //     useEffect(() => iniciarEspectro(ref.current), [])
    //
    // `iniciarCabeza` e `iniciarEspectro` viven en `playhead-loop.ts` y `spectrum-loop.ts`,
    // fuera del `.tsx`, y si estan testeados —`Playhead.browser.test.tsx` lo dice en su
    // docblock: «mientras estuvo adentro del `useEffect` de un `.tsx` no se podia exportar»—.
    // **Si manana uno de ellos crece, la exencion deja de aplicar por su propio argumento**, y
    // el linter no mide lineas: por eso el motivo esta escrito aca y no solo en el spec.
    //
    // Repite `REGLAS_DEL_REPO` por el mismo trap de flat config, y omite `REGLA_EFECTOS`:
    // eso es exactamente lo que exime.
    files: ['src/playback/Playhead.tsx', 'src/spectrum/Spectrum.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...REGLAS_DEL_REPO],
    },
  },

  {
    // Fallar en verde es el bug que este repo ya se comio dos veces —el `--filter "{.}"` que
    // reportaba exito sin correr nada, y el `$` del regex que arrancaba un segundo vitest— y
    // un `.only` olvidado es el mismo bug con otra cara: deja pasar la suite entera sin que
    // nada avise. Medido antes de ponerlo: cero `.only` y cero `.skip` en los 16 archivos.
    //
    // `fixable: false` es deliberado: no se quiere que `--fix` borre el `.only` en silencio,
    // se quiere que falle.
    files: [
      'src/**/__tests__/**/*.{ts,tsx}', '__tests__/*.ts', 'docs/__tests__/*.ts',
      'specs/__tests__/*.ts', '.claude/scripts/__tests__/*.ts',
      'eslint-rules/__tests__/*.ts', '.agents/scripts/__tests__/*.ts', '.spec-anchored/__tests__/*.ts',
    ],
    plugins: { vitest },
    rules: {
      'vitest/no-focused-tests': ['error', { fixable: false }],
      'vitest/no-disabled-tests': 'error',
      'vitest/expect-expect': 'error',
      // `maxArgs: 2` porque Vitest —a diferencia de Jest— acepta un mensaje como segundo
      // argumento (`expect(x, 'por que')`), y este repo lo usa en 24 aserciones. Con el
      // default de la regla las 24 fallaban por una diferencia de API, no por un problema.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      'vitest/no-identical-title': 'error',
    },
  },

  {
    // El mismo "fallar en verde", para el otro runner. `mcp-server/` corre con `node --test`
    // y `@vitest/eslint-plugin` no lo mira, asi que sus 85 tests quedaban afuera de la regla
    // que `CLAUDE.md` escribe para todo el repo.
    //
    // Sin esto un `.skip` ahi fallaba igual, pero **por accidente**: lo cazaba
    // `no-floating-promises`, porque `allowForKnownSafeCalls` nombra `test`/`describe`/`it`
    // y no sus miembros. O sea que el mensaje hablaba de promesas sin esperar y no del
    // motivo, y bastaba con un `void` para silenciarlo sin que nada dijera nada.
    //
    // Repite `REGLAS_DEL_REPO` porque `no-restricted-syntax` se REEMPLAZA entre overrides:
    // es el mismo trap de flat config que el resto del archivo.
    //
    // El test sin una sola asercion no tiene equivalente barato con `node:test` —no hay un
    // `expect` que contar— y queda afuera a proposito; `docs/guides/conventions.md` lo dice
    // asi, en `## Tests`. Vivia en `CLAUDE.md` hasta que el 032 lo recorto y lo mudo ahi.
    files: ['mcp-server/**/__tests__/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...REGLAS_DEL_REPO, {
        selector: 'CallExpression[callee.object.name=/^(test|it|describe|suite)$/][callee.property.name=/^(only|skip)$/]',
        message: 'Nada de .only ni .skip: dejan pasar la suite en verde. Arreglar el test o borrarlo.',
      }],
    },
  },

  {
    // ## Las dos reglas locales del spec 051
    //
    // Son la unica convencion de `conventions.md` que seguia siendo prosa despues del 030
    // y del 049, y la que quedaba tenia el motivo medido de siempre: una regla escrita y
    // no verificada esta desincronizada la mitad de las veces. Viven en `eslint-rules/`
    // —portadas de otro repo del mismo dueno, pero NO copiadas: verbatim daban 1007
    // hallazgos en 92 de 93 archivos— y el porque de cada chequeo que entro y de cada uno
    // que se rechazo esta escrito arriba de su codigo.
    //
    // El criterio que ordena las dos: **exactitud, no longitud**. Ninguna mide cuanto dice
    // un comentario; las dos miden si lo que dice sigue siendo cierto.
    //
    // Se declaran como plugin inline y no como paquete: son dos archivos de este repo y
    // empaquetarlos pediria un `package.json` y una version para algo que nunca sale de
    // aca. El prefijo `local/` es lo que las distingue en la salida del linter.
    //
    // Los dos arboles y no `**/*.{ts,tsx}`: `eslint-rules/` se lintea a si misma —seria un
    // ciclo con el arranque de ESLint— y de `specs/[0-9]*/` no sale codigo.
    files: ['src/**/*.{ts,tsx}', 'mcp-server/src/**/*.ts'],
    plugins: { local: { rules: { 'comment-shape': commentShape, 'comment-anchor': commentAnchor } } },
    rules: {
      'local/comment-shape': 'error',
      'local/comment-anchor': 'error',
    },
  },

  {
    // Todo `.md` del repo: la documentacion, las reglas, los skills y los specs por
    // capacidad. Preset completo: cada uno se mantiene al dia, asi que puede cumplirlo.
    //
    // **El `extends` va con el OBJETO y no con el string `'markdown/recommended'`**, y no
    // es preferencia: este archivo se arma con `tseslint.config()`, que tira ante un string
    // ahi —«This is a feature of eslint's defineConfig() helper and is not supported by
    // typescript-eslint»—. O sea que la forma que documenta `@eslint/markdown`, que asume
    // `defineConfig`, no falla al lintear un `.md`: falla al CARGAR la config, y se cae
    // `pnpm lint` entero.
    files: ['**/*.md'],
    plugins: { markdown },
    language: 'markdown/gfm',
    languageOptions: {
      // Sin esto el `---` del frontmatter se lee como contenido y los `name:` y
      // `description:` de adentro salen como encabezados. Medido: 22 falsos positivos, y
      // los 22 son comentarios YAML de los archivos de `.claude/`.
      frontmatter: 'yaml',
    },
    extends: [markdown.configs.recommended],
    rules: {
      // Apagada porque **arreglar lo que marca lo rompe de verdad**. Su slugger no coincide con el de GitHub sobre un encabezado
      // con backticks y guion bajo: un enlace a `#find_symbol`, que en GitHub resuelve, sale
      // roto.
      // Lo que si se verifica —enlaces y anclas, con el slugger correcto— es
      // `docs/__tests__/enlaces-resueltos.test.ts`, que ademas cubre los enlaces a OTRO
      // archivo, que esta regla no mira.
      'markdown/no-missing-link-fragments': 'off',
    },
  },

  {
    // A constant or a type lives in the module that defines or produces it, so each value
    // exists once. A file named for its role (`*.constants.ts`, `*.types.ts`) or a role
    // folder is red from its first line: without this, the folder comes back in the next PR.
    files: ['src/**/*.constants.ts', 'src/**/*.types.ts', 'src/**/constants/**', 'src/**/types/**'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'Program',
        message: 'A value or a type lives in the module that owns it: no *.constants.ts, *.types.ts, constants/ or types/ under src/.',
      }],
    },
  },

  {
    // The cyclomatic complexity of each function of the product, at most 10. It is the
    // complexity gate of the implementation protocol: the two hardening agents work under it.
    //
    // It covers the product and not the harness. The kernel in `.spec-anchored/` keeps the
    // shape of the Python functions it ports, and one function per contract there is the
    // property that lets a reader compare the two.
    files: ['src/**/*.{ts,tsx}', 'mcp-server/src/**/*.ts'],
    rules: { complexity: ['error', 10] },
  },
  // The files that were over 10 on 2026-10-04, each with the value measured that day as its
  // ceiling. A ceiling goes down when the function gets simpler. It never goes up, and no file
  // joins this list: a new function over 10 is split.
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
