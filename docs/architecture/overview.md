# Visión General de la Arquitectura

## Descripción del Sistema

Pentomino Games es un prototipo de instrumento musical. El usuario elige uno de los 12 pentominós, lo
rota o refleja, y lo coloca en un tablero que mide **lo que entra en la pantalla** —26×15 en un
escritorio, 5×9 en un teléfono, con la celda siempre en unos 73 px (spec 031)—. Cada colocación dispara un arpegio de cinco notas
cuya identidad depende de la pieza y cuya escala depende de la orientación — a menos que la pieza esté
**muteada** (spec 014), que la deja ocupando su lugar y su tiempo en el circuito sin sonar.

No hay objetivo, puntaje ni condición de victoria: es un instrumento, no un juego con reglas de
resolución. Esa distinción importa al decidir features — lo que se evalúa es si algo se vuelve más
expresivo, no más difícil.

## Arquitectura de Alto Nivel

```text
src/main.tsx → src/App.tsx    the shell: state, derived values, handlers and composition.
                   │           Zero effects. It calls playNow; the rest goes through use-engine.ts
                   │ imports
                   ▼
src/<capability>/             one flat folder per contract in specs/:
                              pieces · board-editing · board-fit · musical-model · circuit ·
                              playback · spectrum · panels · accessibility

in a capability:  *.tsx       a component: presentational, props, no state
                  use-*.ts    a hook: use-engine · use-input · use-grid
                  *.ts        a module: pure functions, or the Web Audio engine of playback/
```

Each folder under `src/` is the code of the contract with its name in `specs/`. `voice.ts` and
`scheduler.ts` receive the `AudioContext` as a parameter and do not import `engine.ts`, so they
render offline. See
[directory-structure.md](./directory-structure.md) and [conventions.md](../guides/conventions.md).

## Qué vive dónde

**El audio salió de `App.tsx`** cuando se reemplazó Tone por un motor propio, y el motivo fue la
testabilidad: las funciones de síntesis y scheduling reciben el `AudioContext` por parámetro, así que
se pueden renderizar con `OfflineAudioContext` sin montar nada de React.

**El dominio salió después, y por un motivo parecido**: `react-refresh/only-export-components` prohíbe
que un `.tsx` exporte algo además del componente, así que mientras la geometría y la música vivieran en
`App.tsx` **no podían exportarse, y por lo tanto no podían testearse**. La organización no era neutral:
condenaba al dominio a no ser verificable. Hoy `src/` tiene tests donde antes había cero.

**El shell perdió sus seis `useEffect` con el spec 022**, y por el mismo motivo por tercera vez: en un `.tsx` no se
podían exportar, así que las 166 líneas del puente con el motor —el 75 % de ellas comentario— no se
podían montar ni testear. Lo que queda en `App.tsx` es el shell: estado, derivados, handlers y la
composición de los componentes, con **cero `useEffect`**. Ninguna función pura y ningún literal de
dominio.

Los que había son ahora **dos hooks**, y el corte es el que la lista ya dibujaba
(el spec 021 suma un tercero —hoy `use-grid.ts`— por la misma regla y sin tocar el shell: sigue en cero):

- `use-engine.ts` — los **cuatro de reconciliación**: tempo, clicks, la secuencia contra el tablero, y la
  limpieza al desmontar. `useMotorSincronizado` los declara en ese orden y recibe la `secuencia` ya
  derivada, para que el dibujo y el sonido no puedan mirar circuitos distintos (D5 del spec 009).
- `use-input.ts` — los **dos de entrada** que agregó el spec 013: `useAtajosDeTeclado` sobre `window` y
  `useRuedaRota` sobre el nodo del tablero. Van separados porque no comparten ni el target ni las
  dependencias, y reciben **callbacks y no setters**: así la forma del estado de la orientación es del
  shell y no del hook. El `tapLimpio` que comparten se queda en `App.tsx` y entra por parámetro a los
  dos — lo lee el teclado y lo escriben los dos, así que la arista va escrita en las dos firmas en vez
  de sostenerse por adyacencia.

La **proyección** del `Sequence` del dominio al del motor es una pura, `proyectarAlMotor` en
`playback/engine-bridge.ts`: es el único módulo del repo que puede importar los dos tipos `Sequence`, y estaba
escrita dos veces adentro del shell.

## Lo que hace cada parte

### 1. Dominio — funciones puras

Sin React, sin audio, sin DOM. Determinísticas y testeables en aislamiento.

| Módulo | Símbolos | Responsabilidad |
|---|---|---|
| `transform.ts` | `rotate90`, `normalize`, `rotateN`, `reflect`, `centroid`, `angleFromCentroid`, `pathThroughCells` | Transformaciones de un `Cell[]`, el centroide con el ángulo de cada celda a su alrededor, y el camino que recorre una forma celda vecina a celda vecina |
| `placement.ts` (board-editing) | `cellsAt`, `isValid`, `cabeEn`, `occupantAt`, `occupantCellIndex` | The rules of placement: where a piece lands, whether a move is legal, whether a piece fits whole in the board of now, and which cell of a piece falls on `(x, y)`. The board size arrives as a parameter |
| `routing.ts` (circuit) | `costuraDe`, `routeBetween`, `rutador` | The graph the circuit walks: the seam that joins `(0,0)` with the opposite corner, and the cheapest route between two cells, where an occupied cell costs `CROSS_COST`. `rutador` is the cached entry that `buildSequence` uses |
| `music.ts` | `midiFor`, `midiName`, `notesForRotation`, `arpeggioFor`, `degreeByCellIndex`, `angularRank` | De pieza + rotación a cinco notas MIDI, y de la forma a qué celda lleva cuál. `arpeggioFor` es la derivación completa —tónica, escala y retrógrado—, y la única fuente del arpegio de una pieza colocada. `angularRank` es el orden angular del spec 007, que desde el 012 solo desempata la dirección del camino |
| `sequence.ts` | `buildSequence`, `cellsByPlayOrder`, `gates`, `noteAtCell` | El circuito que visita las piezas colocadas (Held-Karp sobre `routeBetween`) y los offsets del ciclo — orden, silencios y clicks. Las otras tres son las derivaciones celda↔nota que el circuito necesita y que no pueden vivir escondidas en su único consumidor: el orden de reproducción, las dos puertas de una pieza y qué nota suena en una celda (la que da su altura al cruce del spec 011) |
| `invariants.ts` | `checkArrayOrder`, `checkAnchors`, `checkShapes`, `checkBaseMap`, `checkNotes`, `checkDistinct`, `checkLetters`, `checkAll` | Los siete chequeos del modelo. Cuatro recorren las 96 orientaciones —los dos geométricos, `checkDistinct`, que compara las 12 formas entre sí, y `checkLetters`: los dos últimos porque reducir una forma a su clave canónica exige generar sus 8—; los otros tres, lo que les corresponde. `checkLetters` es del spec 039 y es el único que compara contra una tabla EXTERNA: que cada forma sea el pentominó de su letra, que es lo que `checkDistinct` no puede ver |

Los datos (`SHAPES`, `ANCHOR_INDEX`, `BASE_MAP`, `PENT_*`, `GRID_MIN`/`GRID_DEFAULT`) viven en el módulo que los define, igual que
los tipos (`Cell` en `transform.ts`, `PieceKey` en `pieces.ts`, `PlacedPiece` en `placement.ts`). Detalle en
[modelo-musical.md](./modelo-musical.md).

Los chequeos **devuelven** un `CheckResult` en vez de lanzar o asertar, para que los use igual su test y
la tool `check_invariants` del spec 006.

### 2. Componente — estado y render

Todo el estado es local (`useState`). **No hay estado global**: ni Context, ni Redux, ni Zustand. A
esta escala no hace falta, y agregarlo sería la clase de complejidad que un prototipo no puede pagar.

| Estado | Tipo | Qué representa |
|---|---|---|
| `selected` | `PieceKey` | Pieza activa en la paleta |
| `orientaciones` | `Record<PieceKey, Orientacion>` | La orientación de **cada una** de las doce, desde el spec 020. Hasta ahí eran dos escalares sueltos —un `rotation` y un `mirror` para las doce— y rotar la pieza en la mano reorientaba las otras once. `Orientacion.rotation` es el union `Rotacion`, no un `number` |
| `tempo` | `number` | BPM del reloj del motor |
| `playing` | `boolean` | Si el transporte está corriendo. Lo escribe `togglePlay` con lo que devuelve `clockRunning()`, no con la negación del valor anterior: `startClock()` es un no-op silencioso sin Web Audio |
| `placed` | `PlacedPiece[]` | Piezas en el tablero |
| `hover` | `Cell \| null` | Celda bajo el cursor, para el fantasma |
| `piezasAbierto` | `boolean` | Si el dock de piezas está desplegado, desde el spec 021. Arranca en `true` —un instrumento que arranca con los controles escondidos no se descubre— y **no persiste**: recargar lo abre, como recargar vacía el tablero |
| `senalAbierta` | `boolean` | Ídem para la franja de Señal. Son dos y no uno: se pliegan por separado, que es lo que deja destapar sólo las celdas que hagan falta |

Derivados con `useMemo`: `transformedShape`, `secuencia`, `noteSet` y —desde el spec 027— el objeto
`orientacion`. Ese cuarto no es una derivación cara sino **la otra mitad del `memo()` de
`OrientationPanel`**: sin él la prop tiene identidad nueva por render y la barrera no cierra nunca. El
número que lo justifica —4,9 ms por celda cruzada contra 1,9 ms— está en `App.tsx`, al lado del
`<PiecePalette>`. La llamada a
`useMotorSincronizado` va **después** del `useMemo` de `secuencia` y no arriba con el resto del cableado:
`secuencia` es un `const`, así que leerla antes sería leerla en su zona muerta temporal. Derivados
sin memo (baratos, se recalculan por
render): `previewCells` y `previewValid`. `previewCells` viaja al `Board` como **array y no como `Set`
de claves `"x,y"`**: el índice de cada celda es lo que la conecta con su grado, y el `Set` lo perdía.

### 3. Audio — el motor y sus singletons

`voice.ts` (síntesis), `scheduler.ts` (lookahead), `engine.ts` (singletons y la API que consume la UI)
y `spectrum-bars.ts` (el mapeo puro de bins a barras, separado del `AnalyserNode` para poder testearlo).
El `AudioContext` es un singleton de módulo —uno por pestaña, no uno por componente— y vive **solo** en
`engine.ts`: los otros dos lo reciben por parámetro y no importan `engine.ts`, así que el invariante que
los hace testeables lo sostiene el grafo de imports. Detalle en [audio.md](./audio.md).

### 4. Componentes — presentacionales

Uno por archivo, sin estado ni efectos propios: reciben datos y callbacks por props. `Spectrum.tsx` es
la excepción deliberada — no recibe props y lee del motor por su cuenta, para que dibujar a 60 fps no
re-renderice nada del tablero.

## Patrones clave

### Las transformaciones preservan el orden del array

`rotate90`, `normalize` y `reflect` son todos `map` sobre las celdas. Eso significa que **la celda en el
índice `k` sigue siendo la misma celda lógica después de cualquier transformación**.

De esa propiedad depende `ANCHOR_INDEX`, que guarda la celda de agarre de cada pieza como índice en vez
de coordenada: rotar la pieza mueve la celda, pero no cambia su índice. Es lo que hace que el punto de
agarre acompañe a la figura sin recalcular nada.

El [spec 001](https://github.com/federicohermo/pentomino-games/issues/63) reusa el mismo mecanismo para el
mapeo celda↔nota. **Es un invariante del que ya depende código en producción**: romperlo (por ejemplo,
haciendo que `normalize` filtre u ordene celdas) rompe la colocación de piezas de forma silenciosa.

Desde el spec 005 hay una red: `checkArrayOrder()` de `pieces/invariants.ts` lo verifica sobre las 96
combinaciones, y su test comprueba que el chequeo efectivamente **da rojo** si una transformación
reordena.

### El estado es la fuente de verdad; los efectos reconcilian

Los loops de audio no se agendan ni cancelan desde los handlers. Un único `useEffect` observa
`[secuencia, placed]` y le entrega al motor la secuencia del recorrido con `setSequence`. `playing` no
está en las dependencias: la secuencia es función del tablero y no del transporte.

Ese efecto **no vive en el shell**: desde el spec 022 está en `playback/use-engine.ts` con los otros
tres de reconciliación, y `App.tsx` sigue sin declarar un solo `useEffect` —el 021 le agregó un hook más,
`use-grid.ts`, y lo puso donde van todos: en un hook `use-*.ts`— (ver [Qué vive dónde](#qué-vive-dónde)). Lo
que se queda en el shell es la **derivación** —`secuencia` es un `useMemo` sobre
`[visibles, regimen, dims]`, que desde el spec 031 son las tres cosas de las que depende: las piezas
que entran en la grilla de ahora, el régimen y cuánto mide el tablero— y el hook recibe el resultado,
para que el dibujo y el sonido no puedan mirar circuitos distintos.

El patrón imperativo anterior —cada handler acordándose de limpiar lo suyo— es exactamente el que
produjo el bug de loops huérfanos que sobrevivían a "Quitar" y "Reset". Ver
[audio.md](./audio.md#reconciliación-de-loops).

### El render no muta

Los cálculos derivados del hover (`previewCells`, `previewValid`, `previewSet`) se recomputan en cada
render y no se guardan. Son baratos —cinco celdas— y guardarlos introduciría una segunda fuente de
verdad que hay que invalidar.
