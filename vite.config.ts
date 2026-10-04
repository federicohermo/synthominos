/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'

/**
 * Si esta corrida esta instrumentada.
 *
 * Se lee de `process.argv` porque es el unico lugar donde el dato existe cuando se arma
 * la config: los workers no ven los flags con los que arranco vitest, y un
 * `COVERAGE=1 vitest` adelante del comando no funciona en Windows —`cross-env` seria una
 * dependencia nueva para dos lineas—. Gobierna dos cosas, las dos con el mismo motivo:
 * bajo instrumentacion se mide el instrumento y no el producto.
 */
const BAJO_COVERAGE = process.argv.some(a => a.startsWith('--coverage'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    /**
     * Dos proyectos y UN comando: `pnpm test` sigue corriendo todo, asi que el nodo
     * de convergencia sigue convergiendo. Partirlo en `test` y `test:browser` haria
     * que `verify` reporte verde habiendo corrido la mitad.
     *
     * El corte no es por capa sino por lo que el test NECESITA:
     *
     * - `node` — el dominio es puro y el audio corre contra `node-web-audio-api`,
     *   que es una implementacion nativa de Web Audio. Ahi viven los tests de
     *   siempre, sin un solo cambio.
     * - `browser` — Chromium de verdad, por Playwright. Entra porque jsdom no
     *   puede: `Spectrum.tsx` necesita canvas 2D, `createLinearGradient`,
     *   `ResizeObserver`, `matchMedia` y un `getBoundingClientRect` con numeros, y
     *   `engine.ts` necesita `new AudioContext()` y `window.setInterval`. Con jsdom,
     *   cubrirlos exigiria mockear exactamente el codigo que se quiere cubrir, que
     *   es cobertura sin verificacion.
     *
     * El discriminante es el SUFIJO y no una carpeta: un test de `Board.tsx` que
     * necesita navegador sigue siendo un test de `Board.tsx` y vive al lado. La
     * extension ademas separa sola —`node` toma `.ts` y el navegador `.tsx`—, asi
     * que un test con JSX no puede caer en node por accidente.
     *
     * `extends: true` en los dos, y es lo que evita duplicar config: medido, con el
     * los proyectos heredan `plugins` (sin eso el JSX del proyecto de navegador no
     * compila) y tambien el bloque `coverage`. Que `coverage` sea UNO SOLO y viva
     * arriba es lo que hace que los dos proyectos reporten en una tabla y contra un
     * unico umbral.
     *
     * El navegador no es libre mientras el coverage sea v8: vitest valida el nombre
     * y falla explicito con firefox o webkit, ofreciendo istanbul como alternativa.
     */
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          /**
           * Seis raices, y cinco no son `src/`: **cada gate vive al lado de lo que
           * verifica**, y eso quiere decir al lado del SUJETO, no de lo que el sujeto
           * toca. `__tests__/` en la raiz mira los archivos de la raiz —`index.html`,
           * `public/manifest.json`, `README.md`—; `docs/__tests__/` la DOCUMENTACION
           * (issue #100); `specs/__tests__/` el REGISTRO —la convencion y `mapa.json`,
           * spec 035—; y `.claude/scripts/__tests__/` los SCRIPTS que lo publican e
           * hidratan, que son del script y no de `specs/`, que es lo que el script
           * manipula.
           *
           * Estaban todos en `src/__tests__/` por una sola razon, y no era de diseno:
           * era el unico lugar donde vitest miraba. Ninguno importa una linea de `src/`
           * —usan `node:fs` y `node:url`, y uno lanza `gh`—, asi que lo que hacian ahi
           * era obligar a la app a saber que el repo tiene specs, documentacion y un
           * `index.html`. En `src/__tests__/` queda lo que es de la app.
           *
           * Y en `__tests__/` y no sueltos, como en el resto del repo: `specs/` es
           * ademas la cache hidratada de los issues, y un `.test.ts` entre 35 carpetas
           * `NNN-…` se lee como si fuera parte de un spec.
           *
           * `eslint-rules/__tests__/` es la sexta y la unica que verifica algo que este
           * repo EJECUTA de afuera: las dos reglas locales del spec 051 las corre ESLint,
           * no la app, asi que sin esta entrada su `RuleTester` no corre y las reglas
           * quedan sin verificar. Es ademas la unica que SI entra al coverage —ver
           * `coverage.include` abajo—, porque a diferencia de las otras cuatro lo que
           * verifica es codigo de este repo y no un archivo de texto.
           *
           * Sin cualquiera de estas seis entradas, esos gates dejan de correr EN
           * SILENCIO — la forma de fallar en verde que este repo ya se comio dos veces.
           * Ninguno entra al coverage: su `include` es `src/**` y punto.
           */
          include: [
            'src/**/__tests__/*.test.ts',
            '__tests__/*.test.ts',
            'docs/__tests__/*.test.ts',
            'specs/__tests__/*.test.ts',
            '.claude/scripts/__tests__/*.test.ts',
            'eslint-rules/__tests__/*.test.ts',
            '.agents/scripts/__tests__/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/__tests__/*.browser.test.tsx'],
          // La hoja de estilos se importa UNA vez y desde el setup, no desde cada
          // test. Medido: sin ella `z-10` esta en el `className` pero
          // `getComputedStyle(...).zIndex` devuelve `auto`, o sea que un test de
          // layout pasa o falla por el motivo equivocado y en silencio.
          setupFiles: ['./src/components/__tests__/browser-setup.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                // Sin esto, la politica de autoplay de Chromium crea todo
                // `AudioContext` en `suspended` y `resume()` se queda esperando un
                // gesto que en un test no llega. `engine.ts` y `Spectrum.tsx`
                // dependen de `ctx.state === 'running'` para hacer algo, asi que sin
                // el flag no se puede cubrir ni una de sus ramas activas.
                args: ['--autoplay-policy=no-user-gesture-required'],
              },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],

    // Los workers no ven los flags con los que arranco vitest, y hay dos tests
    // —los presupuestos de performance del 009— que necesitan saber si estan
    // corriendo instrumentados: bajo v8 miden 11,3 ms contra un techo de 5, o
    // sea que medirian el instrumento y no el producto. Se pasa por `env` y no
    // por el script de npm porque un `COVERAGE=1 vitest` adelante del comando no
    // funciona en Windows, y `cross-env` seria una dependencia nueva para dos
    // lineas.
    env: { COVERAGE: BAJO_COVERAGE ? '1' : '' },

    // ## El timeout se afloja bajo coverage, y no es pereza
    //
    // v8 instrumenta insertando contadores en cada rama, y los tests combinatorios del
    // dominio —los que recorren las 96 orientaciones o resuelven tableros de 12 piezas—
    // son justo los que mas ramas ejecutan. Medido sobre los presupuestos del 009: 11,3
    // ms contra 1,8 sin instrumentar, o sea entre 2x y 4x. Con los cuatro nodos de
    // `verify` compitiendo por CPU al mismo tiempo, eso lleva a alguno de esos tests por
    // encima de los 5 s del default y lo pone en rojo **sin que nada este mal**.
    //
    // Un rojo espurio en el nodo de convergencia es peor que no tener el nodo: entrena a
    // leer el rojo como ruido. El presupuesto de TIEMPO sigue verificandose donde
    // corresponde —`pnpm test`, sin instrumentar, con sus techos de 5 y 4 ms—; aca lo
    // unico que se mide es cobertura.
    testTimeout: BAJO_COVERAGE ? 30_000 : 5_000,

    coverage: {
      provider: 'v8',

      // El denominador se declara ENTERO y se descuenta por nombre, y esa es la
      // decision: por defecto vitest mide solo los archivos que algun test
      // importo, con lo que los diez que estan en cero absoluto —los que mas
      // importan— no aparecerian en la tabla y el numero saldria mas lindo sin
      // significar nada. En vitest 4 alcanza con declarar `include`; el flag
      // `all` que hacia esto en la 3 ya no existe y el typecheck lo rechaza.
      // Y `eslint-rules/**/*.mjs`, que es la excepcion a la linea de arriba: v8 reporta
      // todo archivo que se EJECUTO, asi que el `.mjs` que importa el `RuleTester` entra
      // a la tabla lo declaremos o no —es el mismo mecanismo que obliga a excluir
      // `mcp-server/**` mas abajo—. La salida elegida es la contraria a la de alla:
      // incluir y cubrir. `mcp-server/**` se excluye porque tiene su propio gate al 100
      // con otro runner; estas dos reglas no tienen otro runner, las cubre vitest.
      //
      // Y `.agents/scripts/*.ts`, por el mismo motivo que `eslint-rules/`: es codigo de este
      // repo que corre de afuera —los hooks de Claude y de Codex, el limpiador de worktrees y
      // el generador de copias— y sus tests lo importan en el mismo proceso. Las copias que
      // viajan dentro de los skills no entran: nadie las ejecuta desde un test, y son byte a
      // byte las de aca.
      include: ['src/**/*.{ts,tsx}', 'eslint-rules/**/*.mjs', '.agents/scripts/*.ts'],

      exclude: [
        // Son los tests.
        'src/**/__tests__/**',
        'eslint-rules/**/__tests__/**',
        '.agents/scripts/__tests__/**',
        // Declaraciones de tipo: no llegan al runtime.
        'src/vite-env.d.ts',
        // Bootstrap: `createRoot(...).render(<App />)`. Cubrirlo verifica que
        // React monta, no que este repo funcione.
        'src/main.tsx',
        // ## El otro paquete, que tiene su propio gate al 100
        //
        // `include` es `src/**` y aun asi esto hace falta: v8 reporta todo archivo que
        // se EJECUTO, y `include` solo decide cuales de los que nadie toco se suman al
        // denominador. Desde el 038 `specs/__tests__/mapa-de-specs.test.ts` importa
        // `readSpecStatus` de `mcp-server/src/specs.ts` —a proposito: `pendientes` no
        // se reimplementa, que es el bug de ese spec un nivel mas abajo—, asi que el
        // archivo entero entra a la tabla por una sola funcion. Medido: 64 % de
        // statements y 55 % de ramas, y el umbral 100 en rojo.
        //
        // El numero no significa nada: ese paquete corre sus tests con `node --test` y
        // `pnpm mcp:test` ya lo tiene en **100 en las cuatro metricas**. Contarlo aca
        // pediria escribir tests de vitest para codigo que ya esta cubierto por su
        // propio runner, o —peor— bajar el umbral. Se excluye del denominador de
        // vitest, no de la verificacion: el gate del paquete sigue siendo `mcp:test`,
        // que es un nodo de `verify`.
        'mcp-server/**',
      ],

      // `text` y nada mas: el gate es binario, y para leerlo alcanza la tabla en
      // consola. `reportOnFailure` NO es opcional — sin el, un test en rojo hace
      // que vitest no imprima la tabla, y entonces la corrida que mas necesita
      // el reporte es justo la que no lo da.
      reporter: ['text'],
      reportOnFailure: true,

      // ## Cien, y no noventa y cinco
      //
      // Un umbral por debajo del 100 es un presupuesto de deuda SIN DUENO: nadie sabe
      // cuales son las lineas que el margen permite dejar sin cubrir, asi que nadie las
      // revisa y el margen se llena solo. El 100 no admite esa ambiguedad — cada linea
      // que entra al repo o esta cubierta, o esta excluida por nombre y con un motivo
      // escrito arriba— y muda la discusion del promedio al archivo, que es donde se
      // puede resolver.
      //
      // Es la misma forma que el repo ya eligio dos veces: «cero `any` y cero
      // `@ts-ignore`», no "pocos". Y el corolario vale igual: si una rama parece
      // inalcanzable, la salida es borrarla o volverla alcanzable, nunca el comentario
      // magico que le pide al proveedor de coverage que la saltee. Las cuatro que
      // aparecieron en este spec se resolvieron asi, y estan anotadas en el
      // `research.md` del 029.
      //
      // Esa perifrasis no es pudor: desde el 032 `no-warning-comments` prohibe los tres
      // terminos, y la regla mira texto y no sintaxis, asi que **deletrear el termino
      // para explicar por que no usarlo lo viola igual**. La lista literal vive en
      // `eslint.config.js`, que es el unico lugar del repo donde tiene que estar.
      thresholds: { lines: 100, statements: 100, functions: 100, branches: 100 },
    },
  },
})
