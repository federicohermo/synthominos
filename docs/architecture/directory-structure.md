# Estructura de Directorios

## Organización General

```text
pentomino-games/           # raíz del repo: la app vive acá, sin subdirectorio
├── CLAUDE.md              # Guía para Claude Code
├── docs/                  # Esta documentación, y en docs/__tests__/ los gates que la verifican
├── specs/                 # Trabajo planificado (ver specs/README.md)
├── public/                # Assets servidos tal cual, copiados a dist/
├── src/                   # Todo el código de la app
├── mcp-server/            # MCP server de dominio: tooling, NO entra al bundle
├── __tests__/             # Gates de lo que no vive en src/: los archivos de la raíz y el modelo de ramas
├── .mcp.json              # Registra el server; commiteado, sin nada que configurar
├── index.html             # Entry point de Vite (en la raíz, no en public/)
├── vite.config.ts         # Plugins: react() + tailwindcss()
├── eslint.config.js       # Flat config v9: zonas de dirección + las reglas de CLAUDE.md
├── eslint-rules/          # Las dos reglas locales `local/comment-*` y su `__tests__/` (spec 051)
├── vercel.json            # Config de deploy (ver infra/deploy.md)
├── pnpm-workspace.yaml    # Workspace de dos paquetes: `.` y `mcp-server`
├── pnpm-lock.yaml         # Lockfile único, cubre los dos paquetes
├── LICENSE
└── tsconfig{,.app,.node}.json
```

## `mcp-server/`

Paquete aparte, con sus propias dependencias y su propio `tsconfig.json`. **La dirección de dependencia
es una sola: `mcp-server/` importa de `src/`, nunca al revés.**

```text
mcp-server/
└── src/
    ├── index.ts                  entrypoint: serveStdio + registro de tools y resources
    ├── pieces.ts                 las 12 letras, derivadas de SHAPES
    ├── render.ts                 ASCII de una pieza (puro)
    ├── specs.ts                  parseo de mapa.json y de los tasks.md, y la escritura del 033
    ├── symbols.ts                índice de símbolos de src/, construido en la consulta
    ├── resources/                un resource por archivo + el array de index.ts
    ├── tools/                    una tool por archivo + el array de index.ts
    └── __tests__/                node --test, uno por tool + los de parseo y render
```

Que sea un paquete y no una carpeta más no es prolijidad: `zod` y `@modelcontextprotocol/server` quedan
en `mcp-server/node_modules` y **no** aparecen en el de la raíz, así que el tooling no puede colarse al
bundle. Lo garantiza pnpm, no la disciplina.

No tiene `dist/`: node corre los `.ts` quitando los tipos. Por eso el server pide **Node ≥ 22.18**, por
encima del piso de la app — y por eso no puede quedar sirviendo código viejo. Detalle en
[mcp-domain.md](../guides/mcp-domain.md).

## `src/`

```text
src/
├── main.tsx                      # createRoot + StrictMode + import de styles/index.css
├── App.tsx                       # el shell: estado, derivados, handlers y composición. Cero efectos
├── vite-env.d.ts                 # Tipos de Vite
├── styles/
│   └── index.css                 # @import "tailwindcss" + estilos globales de body/code
├── domain/                       # puro: sin React, sin Web Audio, sin DOM
│   ├── transform.ts              # rotate90 · normalize · rotateN · reflect · centroid ·
│   │                             #   angleFromCentroid · pathThroughCells
│   ├── board.ts                  # cellsAt · isValid · routeBetween · occupantAt ·
│   │                             #   occupantCellIndex
│   ├── music.ts                  # midiFor · midiName · notesForRotation · arpeggioFor ·
│   │                             #   degreeByCellIndex · angularRank
│   ├── sequence.ts               # buildSequence — el circuito (Held-Karp) y los offsets del ciclo —,
│   │                             #   cellsByPlayOrder, gates —las dos puertas, las usa simulate_board—
│   │                             #   y noteAtCell, qué nota hay en una celda
│   ├── invariants.ts             # los siete chequeos del modelo + checkAll
│   ├── types/                    # el contrato de la capa. Cero imports de afuera
│   │   ├── transform.types.ts    #   Cell
│   │   ├── pieces.types.ts       #   PieceKey
│   │   ├── board.types.ts        #   PlacedPiece · Dims · Ruta
│   │   ├── music.types.ts        #   RegimenDeRotacion, derivado de REGIMEN (spec 017)
│   │   └── sequence.types.ts     #   Step · Click · Sequence
│   ├── constants/                # los datos del modelo. Solo importan tipos
│   │   ├── pieces.constants.ts   #   SHAPES · ANCHOR_INDEX
│   │   ├── board.constants.ts    #   GRID_MIN · GRID_DEFAULT · MAX_PIEZAS · CROSS_COST
│   │   │                         #   (el tamaño del tablero es un parámetro desde el 031)
│   │   ├── music.constants.ts    #   CHROMATIC · PENT_* · BASE_MAP · DEFAULT_OCTAVE
│   │   ├── sequence.constants.ts #   PASOS_MAX
│   │   └── invariants.constants.ts #   ROTATIONS
│   └── __tests__/                # uno por módulo
│       └── transform · board · music · sequence · invariants
├── audio/                        # Web Audio; habla MIDI, no conoce el dominio ni la UI
│   ├── voice.ts                  # midiToHz · scheduleVoice · scheduleClick
│   ├── scheduler.ts              # collectHits · collectWindow (el swap al cierre de ciclo) ·
│   │                             #   barDuration · intervalDuration
│   ├── engine.ts                 # singletons y la API que consume la UI
│   ├── spectrum.ts               # mapeo puro de bins de la FFT a alturas de barra
│   ├── playhead.ts               # offsetAt — aritmética del offset de la cabeza lectora (spec 010)
│   ├── types/                    #   voice.types.ts · scheduler.types.ts
│   ├── constants/
│   │   ├── voice.constants.ts    #   la envolvente y los tres velocities; el click del 015
│   │   ├── scheduler.constants.ts #  LOOKAHEAD · TICK_MS · la subdivisión (008) · HIT
│   │   └── engine.constants.ts   #   MASTER_GAIN · DEFAULT_BPM · los dos delays · la FFT
│   └── __tests__/
│       ├── voice.test.ts         #   síntesis, con OfflineAudioContext
│       ├── scheduler.test.ts     #   lookahead, reloj por origen, offsets del ciclo y el swap (D5)
│       ├── integration.test.ts   #   el analyser es transparente, muestra por muestra
│       ├── spectrum.test.ts      #   binsToBars, sin AudioContext (ver audio.md)
│       ├── playhead.test.ts      #   offsetAt: borde de ciclo, t < origin y los degradados (AC2)
│       └── test-context.ts       #   helpers de render y medición (no es un test)
└── components/                   # un componente por archivo, presentacionales
    ├── FloatingPanel.tsx         # el chasis de LOS DOS flotantes (spec 052): el asa que se
    │                             #   arrastra, el disclosure que pliega y lo que contiene. Sin
    │                             #   estado: la posición y el plegado viven en el shell
    ├── PiecePalette.tsx          # el dock: compone los dos paneles adentro del chasis, más las
    │                             #   dos filas que quedan entre ellos (specs 022 y 019). Dejó de
    │                             #   ser una tarjeta en columna con el spec 021
    ├── OrientationPanel.tsx      # las doce miniaturas, cada una en SU orientación recordada
    │                             #   (spec 016 la forma, spec 020 la orientación por pieza)
    ├── TransportPanel.tsx        # tempo, play/pausa, el recorrido en el vacío y el reset
    ├── Board.tsx                 # la grilla que le digan `dims`: color por pieza, nota por celda, y el fantasma
    │                             #   diciendo lo mismo antes de colocar
    ├── Spectrum.tsx              # canvas del espectro: rAF + HiDPI, sin props
    ├── Playhead.tsx              # cabeza lectora: rAF + estilo imperativo, sin props (spec 010)
    ├── playhead-loop.ts          # el bucle de la cabeza y del velo, fuera del .tsx para poder
    │                             #   exportarlo y testearlo (spec 029). Sin cambio de conducta
    ├── spectrum-loop.ts          # ídem el del espectro: drawBars, drawIdle e iniciarEspectro
    ├── route-source.ts           # singleton fuera de React (no un componente): espeja active/
    │                             #   pending del motor con la Sequence del dominio, con celdas
    ├── cell-text.ts              # qué dice cada celda: su nota (por grado) y su #N (por paso).
    │                             #   Fuera del .tsx para poder testearla (spec 012, fix del #N)
    ├── cell-name.ts              # qué ANUNCIA cada celda: su nombre accesible y el texto de la
    │                             #   región aria-live de las tres ediciones (spec 026). Fuera
    │                             #   del .tsx por lo mismo que cell-text.ts
    ├── piece-mini.ts             # la forma de una pieza centrada en la caja de 5×5 de la paleta,
    │                             #   ya rotada y reflejada (spec 016). Fuera del .tsx por lo mismo
    ├── orientation-text.ts       # la orientación en palabras, en dos fragmentos: la línea visible
    │                             #   del panel y el aria-label de las miniaturas la componen cada
    │                             #   uno a su formato (spec 019). Fuera del .tsx por lo mismo
    ├── rejilla.ts                # columnasRectangulares: la mayor divisora PROPIA que entre en el
    │                             #   techo, para que la última fila de las doce esté llena — la
    │                             #   cuenta que repeat(auto-fill, …) no puede hacer (spec 052) ·
    │                             #   COLUMNAS_DEL_DOCK y anchoDeRejilla, que leen el panel y la
    │                             #   posición inicial del dock
    ├── tempo.ts                  # la conversión gesto → bpm del reloj: rueda, flechas y arrastre
    │                             #   vertical, y todo lo que sale ya acotado a TEMPO_MIN/MAX
    ├── input.ts                  # la decisión de cada gesto de entrada: rueda, tecla, menú
    │                             #   contextual y click sobre una celda (specs 013 y 014)
    ├── engine-bridge.ts          # las dos puras del puente con el motor: proyectarAlMotor
    │                             #   —la única del repo que ve los dos tipos Sequence— y
    │                             #   alternarTransporte, que devuelve lo que el motor dice
    ├── use-engine.ts             # los cuatro efectos de reconciliación del spec 022: tempo,
    │                             #   clicks, la secuencia contra el tablero y el desmontaje
    ├── use-input.ts              # los dos efectos de entrada del 013: teclado y rueda. Reciben
    │                             #   callbacks, no setters, y el tapLimpio del shell
    ├── grid-fit.ts               # cuántas celdas entran en el viewport y cuánto mide cada una
    │                             #   (spec 031, reemplaza a cell-px.ts del 021). Pura, fuera del
    │                             #   hook para poder testearla sin navegador
    ├── use-grid.ts               # el tercer hook de entrada: mide el contenedor raíz, escribe la
    │                             #   celda en --cell y devuelve las dimensiones como estado
    ├── drag.ts                   # las puras del arrastre: moverPanel —acotado al viewport, y
    │                             #   asimétrico en los dos ejes—, pasoDeTecla y dónde arranca cada
    │                             #   flotante. Fuera del hook por lo mismo que grid-fit.ts: así se
    │                             #   agotan sus ramas sin navegador
    ├── use-drag.ts               # el cuarto hook de entrada: pointerdown sobre el asa,
    │                             #   pointermove/pointerup/pointercancel sobre window, y la
    │                             #   posición escrita en --panel-x / --panel-y (spec 052)
    ├── constants/
    │   ├── layout.constants.ts   # CELL_PX_OBJETIVO —el tamaño al que se apunta, 73— y las
    │   │                         #   razones que vuelven proporcional la baldosa · MINI_BOX ·
    │   │                         #   MINI_CELL_PX · CASILLA_PX y CASILLA_AIRE_PX ·
    │   │                         #   REJILLA_GAP_PX · REJILLA_ANCHO_TECHO_PX · TEMPO_MIN ·
    │   │                         #   TEMPO_MAX · ARRASTRE_PX_POR_BPM · PASO_TECLADO_PX ·
    │   │                         #   MARGEN_VISIBLE_PX · PANEL_PADDING_PX ·
    │   │                         #   MARGEN_INICIAL_PX ·
    │   │                         #   SENAL_ANCHO_CELDAS y SENAL_ALTO_CELDAS · las dos
    │   │                         #   razones del anillo de foco de la celda (spec 026)
    │   ├── palette.constants.ts  # los 12 colores y su color de texto (ver DESIGN.md)
    │   ├── route.constants.ts    # MARCA: los estados de una celda bajo la cabeza lectora
    │   ├── input.constants.ts    # ACCION y EDICION: lo que puede pedir un gesto
    │   ├── orientation.constants.ts # ROTACION, la orientación inicial y las doce ranuras
    │   │                         #   derivadas de SHAPES (spec 020)
    │   ├── playhead.constants.ts # los tres grosores de borde, su tabla por MarcaKind y las
    │   │                         #   clases del velo (spec 029, al salir del .tsx)
    │   └── spectrum.constants.ts # BAR_COUNT · GAP · MIN_BAR · IDLE_TEXT
    ├── types/
    │   ├── cell-text.types.ts    # CellText: lo que una celda muestra
    │   ├── route.types.ts        # Marca · CeldaPorEstrenar
    │   ├── engine.types.ts       # MotorDeTransporte · SequenceDelMotor
    │   ├── orientation.types.ts  # Rotacion · Orientacion · MemoriaDeOrientacion (spec 020)
    │   ├── panel.types.ts        # PropsDeOrientacion · PropsDeTransporte · Posicion · Delta ·
    │   │                         #   Caja: los tres del arrastre, y Delta es un tipo APARTE de
    │   │                         #   Posicion para que sumarle una a otra no compile (spec 052)
    │   └── input.types.ts        # Accion · Edicion · los campos de evento que las puras miran
    └── __tests__/
        ├── palette.test.ts       # contraste WCAG recalculado desde el fondo; puro, sin jsdom
        ├── route-source.test.ts  # el par activa/pendiente y el velo, con el motor mockeado
        ├── cell-text.test.ts     # el #N es el paso y la nota es el grado, en las 96
        ├── cell-name.test.ts     # el nombre accesible de la celda y el texto de las tres
        │                         #   ediciones que anuncia la región aria-live (spec 026)
        ├── input.test.ts         # la decisión de cada gesto: rueda, teclas y click (013 y 014)
        ├── engine-bridge.test.ts # los tres estados de Click.note al proyectar, y las dos ramas
        │                         #   de alternarTransporte — AC10 del 008, sin jsdom
        ├── piece-mini.test.ts    # la forma entra y queda centrada en la caja, en las 96
        ├── orientation-text.test.ts # las ocho combinaciones, y que las 29 orientaciones que la
        │                         #   miniatura no distingue den textos distintos (AC5 del 019)
        ├── orientation-constants.test.ts # las doce ranuras salen de SHAPES y arrancan en 0°
        │                         #   sin reflejar (spec 020)
        ├── grid-fit.test.ts      # la tabla de nueve viewports, que lo que sobra es menos de una
        │                         #   celda en los dos ejes, y los dos casos desproporcionados
        │                         #   (spec 031)
        ├── drag.test.ts          # moverPanel contra los cuatro bordes —y contra el viewport que
        │                         #   no da ni para el margen—, las cinco ramas de pasoDeTecla y la
        │                         #   esquina de arranque de los dos flotantes
        ├── rejilla.test.ts       # las columnas de doce iconos contra cada techo, el piso cuando
        │                         #   no entra ninguna, y el primo que devuelve 1
        └── tempo.test.ts         # las cuatro puras del reloj, y que todo lo que sale está
                                  #   acotado (AC7 del spec 052)
```

## La dirección de dependencia

Es la regla que ordena todo lo demás, y **la verifica el linter**, no la revisión:

```text
types/ ← constants/ ← módulos              types/ no importa nada de afuera de types/
transform.ts ← board.ts                    domain/ no importa nada de fuera de domain/
             ← music.ts ← invariants.ts    audio/  no importa nada de fuera de audio/
                                           components/ y App.tsx importan de las dos
```

`domain/` y `audio/` son **hermanos sin aristas entre ellos**: el motor habla números MIDI y no sabe
qué es un pentominó. Agregar a mano un import prohibido falla `pnpm lint` con el mensaje de la zona de
`eslint.config.js` — desde el spec 030 se verifica por ruta y no por el string del import, así que una
carpeta nueva queda cubierta sola. El porqué de cada regla está en
[conventions.md](../guides/conventions.md).

Todos los archivos de `src/` están vivos. Los residuos de las plantillas de Create React App y de Vite
(`App.css`, `logo.svg`, `assets/react.svg`, `setupTests.ts`) se eliminaron.

Si al agregar un archivo se quiere confirmar que efectivamente se usa:

```bash
grep -rq "App.css" src --include="*.tsx" --include="*.ts" --include="*.css"
```

### Tests

`pnpm test` corre Vitest en **dos proyectos y un solo comando** (spec 029). El corte no es por capa sino
por lo que el test necesita:

- **`node`** — `environment: 'node'` contra `node-web-audio-api`, sobre **seis** raíces. Son 38
  archivos: 23 en `src/`, 4 en la raíz, 3 en `docs/`, 2 en `specs/`, 4 en `.claude/scripts/` y 2 en
  `eslint-rules/`. El
  dominio es puro y el audio tiene una implementación nativa de Web Audio, así que corren ahí sin
  adaptación. Los que **no** son el test de un módulo leen un archivo **del disco**, porque el proyecto
  de navegador sirve su propio documento y nunca carga esos archivos, y **cada uno vive al lado del
  sujeto que verifica** — no de lo que el sujeto toca:
  - `__tests__/` en la **raíz del repo** — los cuatro que cruzan una afirmación contra los archivos
    de fuera de `src/` que la sostienen: `documento.test.ts` (spec 025) verifica el `lang` de
    `index.html`, y `fondo-sincronizado.test.ts` y `nombre-sincronizado.test.ts` (spec 028) verifican
    que el color de fondo y el nombre de la app digan lo mismo en los tres lugares donde están
    escritos —`index.html`, `public/manifest.json`, `README.md`—. Eran lo único del repo que ningún
    test podía falsear. Vivieron en `src/__tests__/` hasta que se notó lo obvio: lo que miran está en
    la raíz, no en `src/`. El cuarto es `ramas-sincronizadas.test.ts` (spec 047), que cruza el modelo
    de dos ramas entre los dos workflows, el `RAMAS_COMPARTIDAS` de `gate-de-spec.mjs` y
    `docs/infra/ramas.md`.
  - `src/__tests__/` — lo que queda ahí es de la **app**: `App.browser.test.tsx` y —desde el spec
    050— `arbol-accesible.browser.test.tsx`, el gate que recorre el árbol de accesibilidad de la app
    entera. Los dos corren en el otro proyecto.
  - `docs/__tests__/` — los tres gates de la **documentación**, mudados ahí por el issue #100 porque no
    importan una sola línea de `src/`: `enlaces-resueltos.test.ts` (enlaces y anclas de todo `.md` del
    repo), `mapa-de-directorios.test.ts` (que este archivo nombre cada archivo de producción) y
    `claude-md-acotado.test.ts` (el techo de 200 líneas de `CLAUDE.md`).
  - `specs/__tests__/` — los dos del **registro** (spec 035): `mapa-de-specs.test.ts` verifica
    `mapa.json` contra sí mismo, —cuando hay `gh`— contra los issues y contra **el PR** de cada spec,
    y —cuando hay carpetas hidratadas— contra los `pendientes` que calcula `readSpecStatus`, para que
    un spec cerrado con trabajo abierto dé rojo (spec 038); y `specs-convencion.test.ts` que las
    carpetas y el registro digan lo mismo.
  - `.claude/scripts/__tests__/` — los cuatro de los **scripts**: `scripts-de-specs.test.ts` sobre lo
    puro de `publicar-spec.mjs` e `hidratar-specs.mjs`, `gh.test.ts` sobre los tres caminos del
    lanzador de `gh` del issue #125 —con el entorno inyectado, porque «no hay `gh` en esta máquina» no
    se puede fabricar en la máquina que corre los tests—, `gate-de-spec.test.ts` sobre el gate de rama
    del spec 037 y `lint-al-cerrar.test.ts` sobre el hook que lintea lo cambiado al cerrar el turno
    (spec 048). Están acá y no en `specs/` porque **el test es del script**, y `specs/` es lo que el
    script manipula.
- **`browser`** — Chromium de verdad, por Playwright, sobre `src/**/__tests__/*.browser.test.tsx`. Son
  13: los siete componentes —el séptimo es `FloatingPanel.tsx`, el chasis del spec 052—, `App.tsx`,
  el gate del árbol de accesibilidad (spec 050), los tres hooks
  —el tercero es `use-grid.ts`, de los specs 021 y 031— y `audio/engine.ts`. `use-drag.ts` no suma un
  cuarto: lo que decide vive en `drag.ts` y se cubre en `node`, y lo que cablea se ejercita
  arrastrando el chasis en `FloatingPanel.browser.test.tsx`. Renderizan con
  `vitest-browser-react`, y el `setupFiles` (`browser-setup.ts`) importa la hoja de estilos **una** vez:
  sin ella `z-10` está en el `className` y `getComputedStyle` devuelve `auto`, o sea que un test de
  layout pasa o falla por el motivo equivocado y en silencio.

El discriminante es el **sufijo** y no la carpeta: un test de `Board.tsx` que necesita navegador sigue
siendo un test de `Board.tsx` y vive al lado. Los `include` terminan en `__tests__/` y con un solo
`*`, así que no matchean ni los helpers que no son tests —`test-context.ts` y `browser-setup.ts`, a los
que les falta el `.test.` antes de la extensión— ni el `__screenshots__/` de los artefactos.

**Chromium no está en el lockfile:** un clone nuevo necesita `pnpm exec playwright install chromium`
antes del primer `pnpm verify`.

Los **tests del MCP server corren aparte**, con `pnpm mcp:test`: viven en `mcp-server/src/__tests__/`
y los corre `node --test` —con sus propios umbrales de coverage al 100, que son flags de node y no de
Vitest—. Los `include` no se pisan: el de Vitest empieza en `src/`.

**Renderizar un componente se resolvió sin `jsdom`, y descartarlo fue la decisión.** El `App.test.tsx`
heredado de CRA se eliminó al montar el runner —buscaba el texto "learn react" de la plantilla, que la
app nunca renderizó— y «no hay tests de UI» quedó abierto en `deuda.md` durante veintidós specs, con
`jsdom` anotado como la salida prevista. El spec 024 la descartó midiendo y el 029 la implementó: jsdom
no da canvas 2D, `createLinearGradient`, `ResizeObserver`, `matchMedia` ni un `getBoundingClientRect`
con números, así que cubrir `Spectrum.tsx` con él exigiría mockear exactamente el código que se quiere
cubrir, que es cobertura sin verificación. Las `@testing-library/*` **siguen sin estar en el árbol**: el
spec 022 las borró junto con `@types/jest`, `postcss` y `autoprefixer`, porque ninguna tenía un
consumidor y el caso que las esperaba —AC10 del spec 008, que el botón de transporte diga lo que el
reloj hace y no lo que se le pidió— se cerró por la otra vía que el propio registro de deuda nombraba:
extraer el handler a una pura (`engine-bridge.ts`) y pasarle el motor por parámetro.

`components/__tests__/palette.test.ts` es de constantes, corre en el proyecto `node` y no monta nada —y
es la mitad de la respuesta a por qué la carpeta aguantó tanto sin montar nada—. La otra mitad es que la
lógica no vive en los componentes: la derivación de `(x, y)` al nombre de nota que muestra `Board` está
en `domain/` (`occupantCellIndex` · `degreeByCellIndex` · `playOrderByCellIndex` · `notesForRotation` ·
`midiName`), y el `.tsx` solo indexa el resultado.

**Encadenarlas tampoco es gratis, y por eso el encadenado salió del `.tsx`.** Vive en `cell-text.ts`
desde el fix del `#N`: elegir *cuál* de las dos numeraciones por celda alimenta el número y cuál la nota
es una decisión, y adentro de un componente no se podía testear —`react-refresh/only-export-components`
le prohíbe al archivo exportar algo que no sea el componente—, así que el bug convivió con 238 tests en
verde. Las puras del dominio estaban bien; lo que no había era un test entre la pura y el píxel.

`route-source.test.ts` (spec 010) es el segundo, y es el que muestra dónde queda la costura: **no** es un
componente, es el singleton de módulo que espeja el par activa/pendiente del motor, así que tiene lógica
propia y se testea sin montar nada. Mockea `audio/engine.ts` con `vi.mock` porque lo único que le usa es
`cycleGeneration()`, un número — importar el motor real arrastraría el singleton del `AudioContext` para
leer un contador. El estado es de módulo, así que cada caso lo reimporta con `vi.resetModules()`: sin
eso, el orden de los tests sería parte del oráculo.

## `public/`

Se copia tal cual a `dist/`. Las rutas se referencian desde la raíz del sitio (`/favicon.ico`).

**Acá no va ninguna regla de ruteo.** Hasta el spec 045 hubo un `_redirects` con el fallback de SPA
`/* /index.html 200`, y estaba documentado como «vivo y necesario» siendo las dos mitades falsas: la
app no tiene routing —ni `react-router`, ni `pushState`, ni lectura de `window.location`—, así que no
había ninguna ruta de cliente a la que hacer fallback. El día que la haya, la regla va como `rewrites`
en `vercel.json` y no como un archivo suelto acá.

| Archivo | Estado |
|---|---|
| `favicon.ico`, `icon-192.png`, `icon-512.png` | Vivos, referenciados desde `index.html` y `manifest.json`. Reemplazan a los tres íconos de la plantilla de CRA —el logo de React— desde el spec 028: la pieza `X` en `#00A99D`, dibujada con el lenguaje de `DESIGN.md`. Los `.png` se renombran a propósito —`logoNNN.png` era el nombre de CRA—; `favicon.ico` conserva el nombre |
| `manifest.json` | Vivo, con `name`/`short_name` propios y `theme_color`/`background_color` = `#f8fafc` (spec 028; antes tenía los valores por defecto de CRA, `"name": "Create React App Sample"`) |
| `robots.txt` | Vivo |

## Dónde crear cada cosa

La regla de fondo: **los módulos contienen comportamiento; los datos, los tipos y los valores fijos
viven en la carpeta de su rol.** Un `.ts` de capa tiene funciones y nada más.

| Rol | Carpeta | Archivo |
|---|---|---|
| lógica de un concern | la capa (`domain/`, `audio/`) | `<módulo>.ts` |
| tipo que cruza un límite | `<capa>/types/` | `<módulo>.types.ts` |
| dato o valor fijo | `<capa>/constants/` | `<módulo>.constants.ts` |
| test de un módulo | `<capa>/__tests__/` | `<módulo>.test.ts` |
| helper de test | `<capa>/__tests__/` | nombre descriptivo (`test-context.ts`) |
| componente | `components/` | `PascalCase.tsx`, **único export** |
| estado nuevo de UI | `useState` dentro de `App()` | no hay ni hace falta estado global |
| efecto de audio | `components/use-engine.ts`, junto a los otros cuatro | ver [audio.md](./audio.md) |
| hook que cablea un módulo | al lado del módulo | `use-<módulo>.ts`, en kebab-case como el resto |
| asset referenciado por URL | `public/` | se copia sin procesar |
| documentación de arquitectura | `docs/architecture/` | |
| gate que verifica la documentación | `docs/__tests__/` | `<qué-verifica>.test.ts`, sin importar `src/` |
| gate que verifica un archivo de la raíz | `__tests__/` en la raíz | `<qué-verifica>.test.ts`, sin importar `src/` |
| trabajo planificado | `specs/<NNN>-<desc>/` | cuatro archivos, ver [specs/README.md](../../specs/README.md) |
| tool nueva del MCP server | `mcp-server/src/tools/` | `<tool>.ts` + una línea en `tools/index.ts` |
| resource nuevo del MCP server | `mcp-server/src/resources/` | `<resource>.ts` + una línea en `resources/index.ts` |
| regla que el server necesita ejecutar | `src/domain/` | **no** en `mcp-server/`: es un cambio de `src/`, en su propio commit |

**Las carpetas de rol se crean cuando tienen su primer archivo.** No hay `schemas/`, `utils/`, `hooks/`
ni `lib/`: estarían vacías, y una carpeta vacía es ceremonia. La tabla de crecimiento —qué carpeta
aparece con qué disparador— está en [conventions.md](../guides/conventions.md).

## Convención de nombres

- **Componentes**: `PascalCase.tsx`, un componente por archivo y ningún otro export.
- **Funciones puras y utilidades**: `camelCase`.
- **Constantes de dominio**: `SCREAMING_SNAKE_CASE` (`SHAPES`, `BASE_MAP`, `ANCHOR_INDEX`, `MAX_PIEZAS`).
- **Tipos e interfaces**: `PascalCase` (`Cell`, `PieceKey`, `PlacedPiece`).
- **Archivos de rol**: repiten el nombre de su módulo con el sufijo del rol
  (`transform.ts` → `types/transform.types.ts`, `constants/…`, `__tests__/transform.test.ts`).
