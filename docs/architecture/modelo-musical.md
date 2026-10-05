# Modelo Musical

Cómo se traduce una pieza colocada en cinco notas y en qué momento suena el recorrido que las conecta.
Las cuatro primeras reglas viven en `src/` —`music.ts`, `transform.ts` y sus constantes— y no
dependen de React ni del motor de audio; la quinta también es dominio puro (`circuit/sequence.ts`), y es
la única que cruza al motor — proyectada a una `Sequence` sin celdas, porque el motor no ve
qué es un pentominó (ver [audio.md](./audio.md#el-recorrido-en-el-scheduler)).

## Las cinco reglas

| Entrada | Determina | Mecanismo |
|---|---|---|
| **Qué pieza** | La tónica | `BASE_MAP` |
| **Rotación** | Una de dos, según el **régimen**: la fórmula de escala (`escala`) o por dónde arranca el arpegio (`orden`) | `notesForRotation` |
| **Reflexión** | El orden de las notas, y con él la puerta de entrada y salida del recorrido | `ns.reverse()` — retrógrado; `gates` lee `cellsByPlayOrder` |
| **La forma** | Qué celda tiene qué nota, y en qué orden se recorren | `degreeByCellIndex` — el camino por la pieza |
| **La posición en el tablero** | El orden de reproducción y el silencio entre piezas | `buildSequence` — circuito + `routeBetween` |

La **forma** de la pieza decide **qué celda es dueña de cada grado** —el arpegio la recorre celda a
celda, ver [abajo](#forma--qué-celda-tiene-qué-nota)— pero no decide *cuándo* suena ninguna: el
mapeo dice dónde está cada nota, no en qué momento. La **fila** (`y`) tampoco: octava, duración y
velocity son los candidatos obvios, y van de a un eje por vez.

### Una pieza colocada puede no sonar

Desde el spec 014 una pieza puede estar **muteada**: sigue ocupando sus cinco celdas, sigue siendo un
nodo del circuito y sigue gastando su tiempo, pero **no suena sus notas**. Donde iba su arpegio van cinco
clicks, uno por celda, en los mismos offsets — y un tramo que la *cruza* tampoco suena la floritura del
spec 011, porque esa floritura es exactamente la nota que el muteo apagó.

Lo que **no** cambia es el circuito: `gates`, `routeBetween` y el Held-Karp no miran `muted`, así que el
orden de visita, los offsets del resto y el largo del ciclo son idénticos a los del mismo tablero sin
mutear. Es la propiedad entera del gesto: sirve para contestar «¿cómo suena esto sin la `N`?» sin que la
pregunta cambie la respuesta, que es justo lo que pasaba cuando la única forma de callar una pieza era
quitarla.

Por eso `Sequence` lleva **dos** listas y no una: `order` es el circuito —todas las piezas, con el
intervalo donde le toca a cada una— y `steps` son las que suenan. Antes del 014 eran la misma.

## El recorrido: orden y silencio entre piezas

Hasta el spec 008 el tablero era un compás: cada pieza sonaba una vez por compás, en la fracción que le
daba la columna de su celda de agarre. El spec 009 lo reemplaza — la columna dejó de decidir nada, y con
ella se fue `phaseFor`. Hoy el tablero es un **recorrido**: un circuito cerrado visita las piezas
colocadas una por una, y una celda recorrida es un intervalo (la unidad del spec 008).

**El orden lo da el circuito más corto, no el orden de colocación.** Colocar una pieza en el medio de
otras dos hace que suene entre las dos — es la propiedad que se quiere, y por eso manda la posición.
`circuit/sequence.ts` resuelve el circuito **exacto** (Held-Karp) sobre las piezas colocadas: un
vecino-más-cercano da recorridos 20,1 % más largos en promedio y hasta 79 % peor en el peor caso
(`research.md` del spec 009, §3), y el exacto cuesta 1,87 ms con las 12 piezas posibles — el tope
estructural, porque hay 12 pentominós libres y no se repiten.

**Que el recorrido "se saltee" una pieza cercana y vuelva después no es un error: es lo que hace que el
ciclo sea más corto.** Un circuito cerrado óptimo pasa al lado de una pieza sin visitarla cuando
visitarla ahí alargaría el total; "la más cercana primero" es exactamente el vecino-más-cercano que se
descartó, y medido sobre 120 tableros da un ciclo **más largo en el 54 % de los casos**, +5,8 % en
promedio y +49 % en el peor.

**A igual costo gana el circuito de menos PASOS, y solo después el índice** (spec 011). Es un criterio
que antes no hacía falta: hasta el 011 el costo de un tramo era su cantidad de pasos, así que empatar
en costo era empatar en duración. Con el peso un cruce cuesta `CROSS_COST` y dura un intervalo, y sin
este segundo criterio el desempate caía en el índice —o sea el orden de colocación—, haciendo que el
mismo tablero sonara con ciclos de distinto largo según cómo se hubiera armado. Medido: pasaba en el
8,3 % de los tableros de 5 piezas, y con el criterio de los pasos pasa en el 0 %.

**Cada pieza tiene una puerta de entrada y una de salida**: la celda donde suena la primera nota del
arpegio y la celda donde suena la última, según `cellsByPlayOrder` — no un grado fijo. Sin reflexión eso
coincide con la celda de grado 0 (la tónica) y la de grado 4, según el mapeo de
[arriba](#forma--qué-celda-tiene-qué-nota); con reflexión el retrógrado invierte el orden de reproducción
sin mover qué nota le toca a qué celda, así que las puertas se invierten también — entra por la celda de
grado 4 y sale por la de grado 0. En términos de **paso** —la otra numeración por celda, la que el
tablero pinta— la regla no tiene excepción: **la entrada es siempre el paso 0 y la salida el paso 4**.
Detalle y el bug que esto corrigió en [Reflexión → retrógrado](#reflexión--retrógrado). El silencio entre la pieza `i` y la `j`, en
intervalos, son los pasos que devuelve `routeBetween(salida(i), entrada(j), placed)` (spec 011,
reemplaza a `cellDistance`) — asimétrico, porque volver usa otro par de celdas: la puerta de salida y
la de entrada no son la misma.

**Con una sola pieza no hay recorrido, y por lo tanto no hay clicks.** El ciclo es su arpegio y vuelve
a empezar contiguo: mide 5 intervalos, uno más que los 4 que abarcan las cinco notas, porque con 4 la
última nota de una vuelta y la primera de la siguiente caerían en el mismo instante. El plan del spec
009 cerraba ese ciclo con el salto de la pieza a sí misma —de su salida a su entrada—; **se cambió
después de escucharlo**, porque ese camino atraviesa la propia pieza y lo que se oye no es un
recorrido sino golpes encima del arpegio que acaba de sonar. El recorrido existe *entre* piezas.

**La distancia es la de la grilla, más una arista.** El tablero se repliega sobre sí mismo: la celda
`(0,0)` y la esquina opuesta —`(9,5)` en el tablero de 10×6, y desde el spec 031 la que corresponda al
tablero que haya— son adyacentes, una sola costura extra y no un toroide. Con ella la distancia
máxima del tablero baja de 14 a **12**, y el 13,8 % de los 3.600 pares de celdas se acorta
(`research.md` del spec 009, §2); `(0,0)` a `(9,5)` pasa de 14 celdas a **1**.

**El silencio entre dos piezas es su distancia en intervalos, sin tope.** Con `d = 1` (piezas contiguas)
la nota siguiente cae exactamente un intervalo después de la última de la anterior, sin costura audible.
Separar dos piezas en el tablero es la forma de crear espacio entre ellas, y no hay tope porque uno
volvería la distancia ilegible pasado cierto punto.

**Las celdas que el recorrido cruza sin detenerse suenan.** Sobre celda vacía suena un click a volumen
bajo — si no, un salto de varias celdas es un silencio mudo. Ese click **no tiene altura del modelo**:
desde el spec 015 es una campana de altura fija que no sale de ninguna escala ni de ninguna pieza, y
que está fuera del registro del instrumento justamente para que no se lea como una nota. Antes del 015
era ruido blanco, o sea sin altura ninguna; lo que sigue siendo cierto es que **el click no dice nada
sobre la celda**, y ésa es la propiedad del modelo. Además arranca **apagado** (spec 015): el
recorrido sobre el vacío se enciende desde el panel. Sobre celda **ocupada** suena
la nota de esa celda —la misma altura que la celda muestra desde el spec 007— como una floritura más
corta y más suave que la nota de una pieza (spec 011). `routeBetween(a, b, placed, dims)`
(`circuit/routing.ts`)
materializa esas celdas intermedias: es el camino de **costo mínimo** sobre las celdas del tablero —peso 1 en
celda vacía, `CROSS_COST` en celda ocupada, con desempate lexicográfico explícito entre caminos de
igual costo— y no la regla "primero en X, después en Y" de `pathBetween`, que dejó de existir junto con
`cellDistance`, `bestRoute` y el const-object `ROUTE`. Cada click de la `Sequence` lleva `note?: number`
—MIDI, ausente si la celda está vacía— porque desde el spec 011 ya no alcanza con contar clicks para
saber qué suena. Detalle del click y de la floritura —volumen y cómo se agenda— en
[audio.md](./audio.md#el-click).

**El ciclo no tiene marca de inicio ni de fin.** Cuando el recorrido termina en la última pieza, sigue
hacia la primera con la misma regla de distancia: el circuito se cierra sin costura audible propia.

El disparo al colocar (`playNow`) **no** participa del recorrido: cuando suena, hacés click y suena en
el acto. Es retroalimentación del gesto, no parte del patrón. Con el transporte corriendo, `playNow` no
se llama: la retroalimentación del gesto y el patrón del transporte no compiten por el mismo instante —
ver [audio.md](./audio.md#reconciliación-de-loops).

**Retroalimentación visual del recorrido.** Esta sección anotaba como limitación conocida que no había
ninguna: hoy se oía el recorrido pero no se leía. El [spec
010](https://github.com/federicohermo/pentomino-games/issues/72) la cierra con una cabeza lectora
(`playback/Playhead.tsx`) que recorre el tablero celda por celda, leyendo `playheadOffset()` del motor
— sin pasar por estado de React, porque la frecuencia de actualización (4 a 10,6 veces por segundo) lo
haría re-renderizar el tablero entero para mover un resaltado. Detalle en
[audio.md](./audio.md#la-cabeza-lectora).

Detalle del scheduler que implementa el recorrido, y del precio de latencia que paga por no interrumpir
lo que está sonando, en [audio.md](./audio.md#el-recorrido-en-el-scheduler).

## Pieza → tónica

`BASE_MAP` asigna a cada pentominó una clase de altura, en orden alfabético sobre el cromatismo:

| Pieza | F | I | L | N | P | T | U | V | W | X | Y | Z |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Clase | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
| Nota | C | C# | D | D# | E | F | F# | G | G# | A | A# | B |

Las 12 piezas cubren exactamente las 12 clases de altura. Es una coincidencia aprovechada, no un
resultado teórico: hay 12 pentominós libres y 12 semitonos.

> Cuidado con la colisión de nombres: la **pieza `F`** tiene por tónica la **nota C**, y la **nota F**
> le corresponde a la **pieza `T`**. La letra del pentominó describe su forma, no su sonido.

La octava está fija en `4` en la llamada actual (`notesForRotation(basePc, 4, rotation, regimen)`).

## Rotación → escala **o** orden: los dos regímenes

Desde el [spec 017](https://github.com/federicohermo/pentomino-games/issues/79) la rotación hace **una de dos** cosas,
y cuál se elige con un interruptor global (`RegimenDeRotacion`, estado de `App.tsx` como el tempo). El
default es `escala`: sin tocar nada, el instrumento suena como siempre.

### `escala` — rotar cambia qué notas

```ts
rotación 0   → PENT_MAJOR  [0,2,4,7,9]     pentatónica mayor
rotación 90  → PENT_MINOR  [0,3,5,7,10]    pentatónica menor
rotación 180 → PENT_BLUES5 [0,3,5,6,7]     menor con blue note
rotación 270 → PENT_MAJOR  transpuesta +7  mayor a la quinta
```

Las cuatro son escalas de cinco grados, uno por celda del pentominó. Girar la pieza cambia **el color
armónico** manteniendo la tónica — salvo en 270°, donde la transposición de +7 semitonos la mueve a la
quinta.

### `orden` — rotar cambia por dónde arranca

Pentatónica mayor **siempre**, corrida `rotación` posiciones:

```text
F, pentatónica mayor sobre C

rotación 0   C4 D4 E4 G4 A4        ← idéntico en los dos regímenes
rotación 1   D4 E4 G4 A4 C4
rotación 2   E4 G4 A4 C4 D4
rotación 3   G4 A4 C4 D4 E4
```

Se corre el **arpegio** y no la entrada: al oído las dos lecturas son idénticas, pero forzar el arranque
del camino cambiaría las puertas del circuito, o sea que mover el orden *dentro* de una pieza terminaría
reordenando el tablero. Este régimen no toca `transform.ts` ni el circuito.

### Qué separa a los dos, medido

| | `escala` | `orden` |
|---|---|---|
| conjuntos de alturas distintos (sobre 48) | 43 | **12** |
| celdas que conservan su nota al rotar (sobre 180) | **36** (24/12/0 por rotación) | **0** |
| paso máximo dentro del arpegio | 3 semitonos | **9** (un descenso, siempre el mismo) |
| registro del instrumento | `C4`–`D#6` | `C4`–**`G#5`** |

Los dos coinciden **exactamente en las 12 combinaciones de rotación 0**, y eso es el diseño: la fórmula
fija de `orden` es la de la rotación 0 de `escala`, que es lo único que hace que los dos se puedan
comparar escuchando en vez de ser dos instrumentos. Difieren en las otras 36 de 48.

El cero de `orden` está **garantizado y no medido de casualidad**: un corrimiento cíclico de `k ≠ 0`
sobre `n` elementos tiene puntos fijos sólo si `gcd(k, n) > 1`, y `n = NOTES_PER_PIECE = 5` es primo.
Con una escala de seis notas dejaría de valer. La consecuencia musical es que `orden` le saca a la pieza
su ancla: la tónica sigue en el conjunto pero deja de ser la primera nota.

Las dos últimas filas de la tabla **no estaban previstas** y salieron midiendo: correr el arpegio mete
exactamente un descenso de 9 semitonos —el techo de `PENT_MAJOR` está a 9 de la tónica, así que es
siempre esa distancia—, y el registro se angosta 7 semitonos por arriba porque la fórmula fija no tiene
la transposición `+7` de la rotación 3. Están declaradas como consecuencia del pedido, no como efecto a
corregir: la variante que las evitaría —reajustar la octava de las notas que dan la vuelta— cambia los
MIDI, y el pedido era mover el orden *sin* cambiar las notas.

**Los dos regímenes existen para poder decidir escuchando cuál se queda.** Es explícitamente temporal:
el régimen viaja como parámetro por todo el modelo, así que retirar el que pierda es borrar una rama de
`notesForRotation`, no desenredarla.

### Corrimiento de octava

`notesForRotation` no confina las notas a una octava:

```ts
const total = basePc + iv + transpose;
const pc = ((total % 12) + 12) % 12;
const octShift = Math.floor((basePc + iv + transpose) / 12);
return midiFor(pc, octave + octShift);
```

Cuando la suma pasa de B, la nota sube de octava en vez de envolverse hacia abajo. Consecuencia
audible: **las piezas de tónica alta abren más registro**. Con `Z` (tónica B) en rotación 270°, los
cinco grados se reparten entre dos octavas; con `F` (tónica C) en rotación 0°, entran todos en una.

No es un bug: mantiene el contorno melódico ascendente en vez de quebrarlo con un salto hacia abajo.

## Reflexión → retrógrado

El mirror invierte el array de notas:

```ts
if (mirror) ns = [...ns].reverse();
```

Mismas cinco alturas, orden inverso. Es el **retrógrado** en el sentido clásico del término, y es lo que
promete el footer de la UI.

Se compone limpiamente con la rotación en los dos regímenes, pero la frase corta —«rotar elige *qué*
notas, reflejar elige *en qué orden*»— vale sólo con `escala`: bajo `orden` la rotación **también** mueve
el orden, y lo que las separa es que el retrógrado lo **invierte** mientras la rotación lo **corre**.
Ortogonales siguen siendo —las dos se componen sin pisarse—, y el
[spec 007](https://github.com/federicohermo/pentomino-games/issues/69) §D3 argumenta por qué mantenerlas
así al agregar el mapeo espacial.

**Desde el spec 010 esto también decide por dónde entra y sale el recorrido.** `gates(p)` lee de
`cellsByPlayOrder(p)` —las celdas de la pieza en orden de reproducción, con el retrógrado ya aplicado
adentro— y toma `{ entrada: orden[0], salida: orden[orden.length - 1] }`. Sin `mirror` eso coincide con
la celda de grado 0 y la de grado 4; con `mirror` el orden de reproducción se invierte sin mover qué nota
le toca a qué celda, así que la primera nota que suena es la del grado 4 y las puertas se invierten con
ella.

Hasta el spec 010 `gates` leía los grados 0 y 4 directamente y no por el orden de reproducción, así que
con reflexión entraba y salía exactamente al revés de la melodía — un bug del spec 009 (D9) que ningún
test de audio podía encontrar, porque el circuito era válido y los onsets los esperados; el error estaba
en la correspondencia entre el tiempo y el espacio, no en el tiempo. Medido con `L` rotación 0 reflejada
en `(1,1)`: celdas `[1,0] [1,1] [1,2] [1,3] [0,0]`, `degreeByCellIndex(SHAPES.L)` da `[3,2,1,0,4]`, el
arpegio ascendente es D4 E4 F#4 A4 B4 y con retrógrado suena B4 A4 F#4 E4 D4. El 009 entraba por `[1,3]`
—el grado 0, que es la **última** nota— y salía por `[0,0]`, la **primera**: entrada y salida quedaban
exactamente invertidas respecto de la melodía, en la mitad del espacio de colocación. El efecto es
audible y medido: con esa `L` reflejada más una `P` rotación 0 en `(7,1)`, el ciclo pasa de 23 a 21
intervalos; todo tablero **sin** reflexión suena exactamente igual que antes, y las 48 orientaciones al
derecho lo verifican con un test. Historia completa en la [nota de revisión del review del
010](https://github.com/federicohermo/pentomino-games/issues/72), que es donde se encontró.

### El paso: el número que se ve en la celda

Cada celda tiene **dos** numeraciones y no una, y confundirlas es el error que este modelo invita:

| | qué contesta | de dónde sale | ¿la mueve la reflexión? |
|---|---|---|---|
| **grado** | qué **nota** tiene la celda: `notesForRotation(...)[grado]` | `degreeByCellIndex(forma)` | **no** |
| **paso** | **cuándo** suena, o sea su lugar en el orden de reproducción | `playOrderByCellIndex(forma, mirror)` | **sí**: es `4 - grado` |

El **paso** es lo que `Board.tsx` pinta en la esquina de cada celda y lo que dibuja el `asciiPlayOrder`
de `describe_piece`, porque es el número que responde a la pregunta que la cabeza lectora hace en
pantalla: **el `#0` es siempre la celda por donde el recorrido entra, y de ahí sube hasta el `#4`, que es
siempre la salida** — en las 12 piezas y en las dos reflexiones. Hasta que se pintó el paso se pintaba
el grado, y esa promesa valía sólo en la mitad no reflejada del espacio de colocación: con `mirror` la
cabeza entraba por el `#4` y contaba hacia atrás.

Las dos parejas correctas son `ascendente[grado]` y `arpeggioFor(...)[paso]`, y dan la misma nota.
Cruzarlas compila: `ascendente[paso]` devuelve la nota **espejada** en toda pieza reflejada.

## Forma → qué celda tiene qué nota

Cada celda de una pieza es **dueña de un grado de la escala**, y quién es dueña de cuál lo decide la
forma. Desde el [spec 012](https://github.com/federicohermo/pentomino-games/issues/74) el arpegio **recorre** la
pieza: de una nota a la siguiente se llega a una celda que **se toca** con la anterior, preferentemente
por un lado y si la forma no da, por una esquina.
`degreeByCellIndex` (`musical-model/music.ts`) compone dos cosas —`pathThroughCells` de `pieces/transform.ts`,
que es geometría pura, y `angularRank`, que es el orden angular del 007 reducido a desempate— y devuelve
el grado **por índice de celda**:

```text
camino que encadena la mayor cantidad de pasos a una celda que se toca → grados 0..4 en orden de visita
```

Cuatro cosas que definen la regla, y por qué son así:

- **Las 12 se recorren enteras, y cuatro pagan una diagonal.** `F`, `T`, `Y` y `X` tienen una celda con
  3 o 4 vecinos, y su grafo de celdas es un árbol: un árbol solo admite recorrido **ortogonal** completo
  si es un camino. En ellas se tolera un paso en diagonal, que al menos llega a una celda que se toca.
  Medido sobre los 48 pasos: los que **pasaban por encima** de una celda que todavía no había sonado
  bajaron de **4 a 0**, y los diagonales de 9 a 5. La tolerancia vale **solo adentro de la pieza**: el
  recorrido entre piezas se sigue moviendo en cruz.
- **El orden angular alrededor del centroide sigue vivo, como desempate.** Un camino y su inverso son
  igual de buenos, así que hace falta algo que elija **por qué punta se entra**: eso hace `angularRank`,
  y se ejerce en las 12 piezas. Conserva sus tres reglas —la celda parada sobre el centroide sale del
  anillo, el sentido horario, y a igual ángulo gana el índice menor—; lo que perdió es decidir el orden.
- **El grado 0 es la punta del camino, no el centro de la figura.** El 007 le daba la tónica a la celda
  del centroide (`I` y `X`); el 012 lo revierte, porque en la `I` arrancar por el centro obliga a un
  salto de 4 celdas que la forma no necesita. El grado 0 es la punta por la que se empieza a **caminar**
  la forma — y, **sin reflexión**, por donde el recorrido entra a la pieza (`gates`). Con `mirror` no:
  ahí la puerta de entrada es el grado 4, y quien quiera el orden en que suenan las celdas tiene que
  pedir `playOrderByCellIndex`, no el grado (ver [El paso](#el-paso-el-número-que-se-ve-en-la-celda)).
  Y **cuál de las dos puntas es la entrada lo decide la forma, no el tablero**: se midió la alternativa
  —entrar por la punta más cercana a la pieza anterior, que acortaría el ciclo un 10,4 %— y se descartó,
  porque haría que mover una pieza cambiara el arpegio de sus vecinas. Una pieza suena igual esté donde
  esté.
- **Se calcula sobre la forma canónica y viaja por índice.** Rotar **no** reordena el mapeo: se corre una
  vez sobre `SHAPES[pieza]` sin transformar, apoyado en el invariante de orden del array. Rotar ya cambia
  el arpegio; si además reordenara el mapeo espacial, dos cosas ortogonales cambiarían a la vez. Queda:
  **la rotación cambia el arpegio —sus notas con `escala`, su arranque con `orden`—, y la forma cambia
  dónde.** El régimen no mueve el camino: es lo mismo en los dos. El camino en sí es invariante —rotar y
  reflejar preservan la adyacencia, verificado sobre las 96 orientaciones— pero el desempate angular no,
  y por eso la regla sigue siendo la forma canónica.
- **La reflexión no cambia qué nota muestra una celda.** El retrógrado es del *orden de reproducción*: la
  celda de grado `g` muestra siempre `notesForRotation(...)[g]`, o sea la nota `g` del arpegio
  **ascendente**. Ojo con la fuente de datos, porque la lectura contraria suena igual y pinta otro
  tablero: `arpeggioFor(pieza, rotación, reflexión, régimen)` —la que alimenta a `buildSequence`— y el campo
  `notes` de `describe_piece` vienen **ya invertidos**.

El mapeo completo de las 12 piezas —grado por índice y nota por celda— está medido en
[research.md §5 del spec 012](https://github.com/federicohermo/pentomino-games/issues/74) y congelado en un
test, con las notas escritas a mano. La lámina de referencia del 007 **ya no lo describe**: lo que sigue
fijando es qué cinco notas tiene cada pieza, no cuál de sus celdas muestra cuál. Los colores con que el tablero lo muestra están en
[DESIGN.md](../../DESIGN.md).

## Reproducción

`playNotes()` dispara las cinco notas como arpegio medido en unidades musicales, sobre el tempo actual:

```ts
const iv = intervalDuration(bpm);
notes.forEach((m, i) =>
  scheduleVoice(c, master, midiToHz(m), start + i * iv, NOTE_INTERVALS * iv, RELEASE_INTERVALS * iv));
```

- **Un intervalo entre notas** (`intervalDuration(bpm)`, la semicorchea del compás), así que el slider
  de BPM sí afecta al arpegio de colocación: a 100 bpm el intervalo da 0,15 s, y el arpegio completo
  (`4 × intervalo`) mide 0,375 s a 160 bpm contra 1,000 s a 60 bpm.
- **Duración de nota en intervalos** (`NOTE_INTERVALS = 1`, o sea exactamente un intervalo; 0,150 s a
  100 bpm), `0.8` de velocity, más el release. Un intervalo y no dos: la nota termina justo
  cuando entra la siguiente, así que lo único que se solapa es la cola del release y el arpegio se oye
  como cinco notas en vez de como un acorde desplegado. Medido a 110 bpm: con dos son 2,88 voces
  simultáneas, con una son 1,88, y antes del spec eran 3,13. **El release también está en intervalos**
  (`RELEASE_INTERVALS = 0,88`), así que las voces simultáneas son `1 + RELEASE_INTERVALS` a cualquier
  tempo: 1,88 a 60 y a 160 igual que a 110. Eran 0,12 s absolutos —0,48 intervalos a 60 bpm y 1,28 a
  160—, o sea que el instrumento se espesaba al acelerar; 0,88 es exactamente ese valor expresado en la
  unidad correcta, medido al tempo por defecto, así que a 110 bpm no cambió nada.
- **`i` es la posición en el array**, o sea el grado de la escala. Desde el spec 007 ese orden es una
  decisión explícita —y desde el 012, el recorrido que camina la pieza celda a celda— y no una
  coincidencia del orden en que alguien tipeó las coordenadas de `SHAPES`.

Mientras el transporte está corriendo, cada pieza colocada reagenda la misma secuencia con el mismo
espaciado, una vez por ciclo del recorrido, y el arpegio de colocación deja de sonar: son las dos caras
del mismo transporte, no dos fuentes de sonido independientes. Ese camino no pasa por `playNotes()`: el espaciado
lo aplica `collectHits()` en el motor — ver [audio.md](./audio.md#los-dos-caminos-de-reproducción).

## Utilidades MIDI

```ts
midiFor(pc, octave)  // → 12*(octave+1) + pc      C4 = 60
midiName(m)          // → "C4", "D#4", …           para la UI
```

Convención estándar: C4 = MIDI 60. `midiName` es solo presentación; el motor trabaja siempre con
números MIDI, convertidos a Hz por el motor con `midiToHz`.
