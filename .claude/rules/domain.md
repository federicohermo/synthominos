---
paths:
  - "src/domain/**/*.ts"
---

# Capa de dominio

Puro: sin React, sin Web Audio, sin DOM. `transform.ts` (geometría), `board.ts` (las reglas del
tablero), `music.ts` (el modelo musical), `sequence.ts` (el circuito y los offsets del ciclo) e
`invariants.ts` (los chequeos). Los datos viven en `domain/constants/` y los tipos en `domain/types/`.

## El orden del array de celdas

`rotate90`, `normalize` y `reflect` son `map`: **la celda del índice `k` sigue siendo la misma celda
lógica después de transformar.**

De eso depende `ANCHOR_INDEX` —guarda la celda de agarre como índice, no como coordenada—, y de eso
depende el mapeo celda↔nota que `degreeByCellIndex` calcula sobre la forma canónica y arrastra por
índice (spec 007): las puertas de entrada y salida que usa `sequence.ts` para armar el circuito
—`cellsByPlayOrder(p)[0]` y `cellsByPlayOrder(p)[largo - 1]`, spec 010— también se leen por índice, así
que romper el orden del array rompe a las tres a la vez. Filtrar, ordenar o reagrupar celdas dentro de
esas funciones rompe la colocación de piezas
**sin ningún error visible**. `checkArrayOrder()` de `invariants.ts` es la red; si hace falta
transformar celdas de otra forma, va una función nueva en vez de modificar estas.

## `y` crece hacia abajo

Coordenadas de grilla, no cartesianas. Cualquier cálculo angular recorre el círculo en sentido horario
en pantalla. No está mal — es la clase de cosa que alguien "arregla" por error.

## Modelo musical

| Entrada | Determina |
|---|---|
| Qué pieza | La tónica (`BASE_MAP`: F→C, I→C#, … Z→B) |
| Rotación | **Una de dos, según el régimen** (spec 017): con `escala`, la fórmula (mayor → menor → blues → mayor +7); con `orden`, cuántas posiciones se corre el arpegio sobre una pentatónica mayor fija. A rotación 0 los dos dan lo mismo; en las otras 36 de 48 combinaciones, no |
| Reflexión | El orden de las notas (retrógrado) y, con él, el **paso** de cada celda y la puerta de entrada/salida del recorrido (`playOrderByCellIndex` → `gates`, spec 010) |
| La posición en el tablero | El orden de reproducción y el silencio entre piezas (`buildSequence`, spec 009) |
| **La forma** | **El camino que recorre el arpegio, y con él qué celda tiene qué nota** (`degreeByCellIndex`, specs 007 y 012) |

`degreeByCellIndex` se llama **sobre `SHAPES[pieza]` sin transformar** y el grado viaja por índice.
Correrla sobre una forma ya rotada compila igual y devuelve otro mapeo en **53 de las 96**
orientaciones, porque rotar corre el origen del ángulo y el ángulo es lo que desempata. La rotación
elige el arpegio —*qué* notas con `escala`, *por dónde arranca* con `orden`—; la forma, *dónde* está cada
una. El régimen no toca el mapeo: es el mismo en los dos.

**Desde el spec 012 el arpegio RECORRE la pieza**, sin pasar nunca por encima de una celda propia. El
orden lo da `pathThroughCells` (`domain/transform.ts`, Held-Karp de camino abierto) y el orden angular
del 007 —hoy `angularRank`— quedó como desempate: elige por qué punta se entra. El paso preferido es en
cruz; en las cuatro piezas que no admiten recorrido ortogonal (`F`, `T`, `Y`, `X`: su grafo de celdas es
un árbol con un nodo de 3 o 4 vecinos) se **tolera** uno en diagonal. La implementación usa **dos
métricas y eso no es redundancia**: decide con «se tocan» (lado o esquina) y mide con Manhattan (la
diagonal vale 2), que es lo que hace que la diagonal se tolere sin preferirse. **La diagonal vale solo
adentro de la pieza** — `routeBetween` sigue moviéndose en cruz.

Dos consecuencias que muerden a otras capas: el grado 0 dejó de ser el centro geométrico de `I` y `X`
—es una punta del camino—, y con eso la `X` dejó de tener una puerta rodeada por sus propios brazos, que
es la propiedad sobre la que el 011 apoyaba su caso estructural del cruce.

## Dos numeraciones por celda, y no se cruzan

`degreeByCellIndex(forma)` da el **grado**: qué nota tiene la celda, `notesForRotation(...)[grado]`. La
reflexión **no** lo mueve. `playOrderByCellIndex(forma, mirror)` da el **paso**: cuándo suena, o sea su
lugar en el orden de reproducción. La reflexión sí lo mueve — es `4 - grado`.

El paso es la única derivación del retrógrado sobre celdas: de él salen `cellsByPlayOrder`, las puertas
del circuito (`gates`) y el número que `Board.tsx` pinta en la esquina, así que **el `#0` es siempre la
puerta de entrada y el `#4` la de salida**, reflejada o no. Las dos parejas correctas son
`ascendente[grado]` y `arpeggioFor(...)[paso]`; `ascendente[paso]` compila y da la nota espejada en las
48 orientaciones reflejadas.

## Lo que decide la forma y lo que decide el tablero

**El circuito decide el orden entre piezas y el silencio; la forma decide todo lo que pasa adentro de
una.** Incluida la punta por la que el recorrido entra a la pieza.

Es la regla con la que hay que contrastar cualquier idea que empiece con «y si el tablero también
decidiera…», y no es gratis: se midió dejarle al tablero elegir la punta de entrada y acortaría el ciclo
en el **79 % de los tableros, un 10,4 % en promedio** (spec 012, D11). Se descarta igual, porque haría
que mover una pieza cambiara el arpegio de sus vecinas. **Una pieza tiene que sonar igual esté donde
esté**: el instrumento se toca de memoria o no se toca.

**El tablero se repliega sobre sí mismo**: `(0,0)` y la esquina opuesta son adyacentes (una costura extra sobre la
grilla, spec 009), y el orden de reproducción sale de un circuito exacto (Held-Karp) sobre esas
distancias. Desde el spec 011 la distancia entre dos celdas **ya no es función solo de esas dos
celdas**: `routeBetween(a, b, placed, dims)` (`domain/board.ts`) reemplaza a `cellDistance` y `pathBetween`
—los dos dejaron de existir, junto con `bestRoute` y el const-object `ROUTE`— y devuelve
`{ path, steps, cost, crossed }` en una sola llamada: el camino de costo mínimo sobre las celdas del tablero,
con las intermedias ocupadas pagando `CROSS_COST` (`domain/constants/board.constants.ts`) en vez de
las dos puntas.

**El tamaño del tablero es un parámetro, no una constante** (spec 031). `GRID_W`/`GRID_H` y `SEAM` se
fueron: el tablero mide lo que entra en la pantalla, así que `isValid`, `routeBetween` y
`buildSequence` reciben un `Dims` y la costura la deriva `costuraDe(dims)`. Lo que queda en
`constants/` son los tres bordes —`GRID_MIN` (5×5, la caja más chica donde entra cualquier pentominó),
`GRID_DEFAULT` (10×6, el tablero de referencia que usan el MCP server y los tests) y `MAX_PIEZAS`—.

**`MAX_PIEZAS` es 12 y no es una preferencia**: hasta el 031 ese tope lo garantizaba el área (60 ÷ 5) y
`shortestCircuit` se apoya en él, porque el circuito es Held-Karp **exacto**, `O(n²·2ⁿ)`. Medido sobre
364 celdas: 12 piezas 3,1 ms, 14 piezas 5,6 ms, 16 piezas 18,6 ms — duplica por pieza. Con 390 celdas
el área permitiría 78, y no hay optimización que compre 66 duplicaciones.

Y para que el tablero grande entrara en el presupuesto del 009, `buildSequence` pide las rutas por un
**rutador** (`rutador(placed, dims)`) en vez de llamar `n²` veces a `routeBetween`: los destinos son
`n` —las entradas de las piezas— así que las 144 corridas de Dijkstra son 12. Medido: 10,9 ms → 3,1 ms
en 364 celdas, y también baja en el de 60 (2,3 → 1,9). Verificado contra la versión sin caché sobre
tableros con semilla: cero rutas distintas.

**El costo ordena, los pasos miden el tiempo, y confundirlos es un bug con nombre.** Un cruce cuesta
`CROSS_COST` pero dura **un** intervalo, así que dos circuitos pueden costar lo mismo y durar distinto
— cosa que antes del 011 era imposible, porque el costo *era* la cantidad de pasos. Por eso el
comparador de Held-Karp tiene **tres** criterios y no uno: costo, después **pasos**, y recién después
el índice. Sin el segundo, el desempate cae en el índice —que **es** el orden de colocación— y el
mismo tablero suena con ciclos distintos según en qué orden se armó: medido, el 8,3 % de los tableros
de 5 piezas. El test `el ORDEN DE COLOCACION no cambia lo que suena` lo fija con 120 permutaciones. El orden de reproducción sigue sin depender de la columna ni del orden de
colocación, pero sí depende de qué otras piezas están en el tablero al trazar el camino entre dos
puertas. Es geometría y no reloj de pared: el mismo
tablero suena siempre igual, porque `buildSequence` es aritmética pura sobre enteros. Hoy se lee
también: el spec 010 agrega una cabeza lectora (`components/Playhead.tsx`) que recorre el tablero celda
por celda leyendo `playheadOffset()` del motor — detalle en
[docs/architecture/audio.md](../../docs/architecture/audio.md#la-cabeza-lectora).

Cuidado con la colisión de nombres: la **pieza `F`** suena con tónica **C**; la nota F le corresponde a
la pieza `T`. La letra describe la forma, no el sonido.

Detalle en [docs/architecture/modelo-musical.md](../../docs/architecture/modelo-musical.md).

## Después de tocar esta capa

`check_invariants` del MCP server ejecuta los chequeos sobre las 96 orientaciones y devuelve
contraejemplos — antes y después de tocar geometría, `SHAPES` o el modelo musical.
