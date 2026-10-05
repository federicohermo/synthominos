# Capa de Audio

El motor vive en `src/` y está construido directamente sobre Web Audio, sin librerías. Es la
parte del código con más decisiones no obvias.

## El grafo

```text
scheduleVoice()  ──┐
   osc → env       │
                   ├──→  master (gain 0.3)  ──→  analyser  ──→  ctx.destination
scheduleVoice()  ──┘                                 ↓
   osc → env                                  readSpectrum() → canvas (rAF)
```

Una voz por nota, creada y descartada. El `master` existe para tener un punto único de volumen y de
inserción: el `AnalyserNode` del
[spec 003](https://github.com/federicohermo/pentomino-games/issues/65) entra ahí.

## Los archivos del motor

| Archivo | Qué hace | Cómo obtiene el contexto |
|---|---|---|
| **`voice.ts`** | `midiToHz`, `scheduleVoice`, `scheduleClick` | por parámetro |
| **`scheduler.ts`** | `collectHits` — qué suena y cuándo — y `collectWindow` — la vuelta entera, con el swap al cierre de ciclo | por parámetro |
| **`engine.ts`** | singletons, `playNow`, `startClock`, `setSequence`, `playheadOffset`, `cycleGeneration` | **es** el dueño del singleton |
| **`spectrum-bars.ts`** | `binsToBars` — de bins de la FFT a alturas de barra | no lo toca: es puro |
| **`playhead-offset.ts`** | `offsetAt` — la aritmética del offset de la cabeza lectora | no lo toca: es puro |

Los tres primeros son el motor; `spectrum-bars.ts` y `playhead-offset.ts` son los mapeos puros que se separaron del
singleton para poder testearlos — [más abajo](#por-qué-el-mapeo-binsbarras-vive-aparte) y
[más abajo](#la-cabeza-lectora).

**`voice.ts` y `scheduler.ts` no pueden tocar el singleton**, y no por disciplina: el singleton vive en
`engine.ts` y ellos no lo importan. Eso es lo que permite renderizarlos con un `OfflineAudioContext` en
los tests, y es la razón por la que el audio de este proyecto es verificable.

Hasta el spec 005 los tres bloques del motor eran secciones de un mismo archivo y el invariante lo sostenía un
comentario: nada estructural impedía que `scheduleVoice` llamara a `audio()` y el audio dejara de ser
testeable. Ahora lo sostiene el grafo de imports.

Efecto lateral: se puede importar `scheduler.ts` **sin** arrastrar el módulo de los singletons a un
proceso de node.

Los valores fijos y los tipos viven en el módulo que los define, con el nombre
de su módulo. Ahí están, por ejemplo, la duración de la nota y su release: `NOTE_INTERVALS` y
`RELEASE_INTERVALS` los fijan en intervalos, no en segundos, y `scheduleVoice` no tiene default para
`dur` ni para `rel` —un default fijo sería una constante que ya no puede ser constante, porque las dos
medidas dependen del tempo—, así que los dos llamadores (`tick` y `playNotes`) los calculan contra
`intervalDuration(bpm)` en cada llamada. `DEFAULT_VOICE` se queda con lo que **no** depende del tempo:
attack y decay, que son el transitorio del instrumento, y sustain, que es un nivel.

## Síntesis

```ts
env.gain.setValueAtTime(0, at);                              // ancla
env.gain.linearRampToValueAtTime(vel, at + attack);
env.gain.linearRampToValueAtTime(vel * sustain, at + attack + decay);
env.gain.setValueAtTime(vel * sustain, at + dur);
env.gain.linearRampToValueAtTime(0, at + dur + rel);
```

Dos detalles que parecen redundantes y no lo son:

- **El `setValueAtTime(0, at)` inicial.** Las rampas de Web Audio interpolan desde el *último evento
  agendado*, no desde cero. Sin ese ancla, la rampa de ataque arranca en el valor que haya quedado de
  una nota anterior y se oye un click.
- **Rampas lineales, no exponenciales.** `exponentialRampToValueAtTime` lanza si el target es `0`, así
  que para el release habría que rampar a un épsilon y cortar. La lineal es correcta y suficiente.

Las voces son *fire-and-forget*: `osc.onended` desconecta los nodos. Los `OscillatorNode` son de un
solo uso por diseño de la API; no hay pool ni voice stealing, y a cinco notas por pieza no hace falta.

## Scheduler con lookahead

`setTimeout` tiene jitter de decenas de milisegundos. El reloj de audio
(`AudioContext.currentTime`) es preciso a nivel de sample, pero no se puede "esperar" sobre él.

La solución es el patrón de *A Tale of Two Clocks*: un temporizador grueso que despierta cada **25 ms**
y agenda todo lo que caiga en los próximos **100 ms**, con tiempos absolutos del reloj de audio.

**El temporizador no dispara notas: decide cuándo mirar.** Por eso su jitter no se oye.

### El reloj es un origen, no un cursor

El estado del reloj son dos escalares, y ninguno es "el próximo compás":

```ts
export interface ClockState {
  origin: number;          // instante del ciclo 0 en el reloj del contexto
  scheduledUntil: number;  // hasta dónde ya se emitieron onsets
}
```

`ClockState` no cambió con el spec 009 — sigue siendo dos escalares. Lo que cambió es el período: los
onsets se resuelven **en forma cerrada**, sin avanzar un cursor, pero la unidad pasó del compás al
**ciclo** del recorrido:

```text
onset(k) = origin + (k × ciclo + offset + j) × intervalo
```

con `offset` el desplazamiento entero del paso dentro del ciclo (en intervalos) y `j` el índice de la
nota dentro de la pieza. Detalle de cómo se arma en
[#el-recorrido-en-el-scheduler](#el-recorrido-en-el-scheduler).

```ts
const from = Math.max(state.scheduledUntil, fromTime);
if (from >= until) return out;                    // ventana ya cubierta
for (const step of sequence.steps) {
  for (let at = firstOnsetAfter(from, state.origin, ciclo, step.offset / sequence.length); at <= until; at += ciclo) { … }
}
state.scheduledUntil = until;
```

Tres propiedades que salen de esa forma, y que hay que preservar:

- **`scheduledUntil` es lo que evita la re-emisión.** Los ticks son de 25 ms y el horizonte de 100 ms:
  sin él, cada onset saldría cuatro veces. Es un escalar compartido, no estado por paso.
- **Los ciclos perdidos se saltean, no se recuperan.** Cuando la pestaña estuvo oculta el reloj de
  audio siguió corriendo y `scheduledUntil` quedó atrás; `Math.max(…, fromTime)` descarta el hueco. No
  hay bucle de recuperación que acotar, porque saltear 10 ciclos cuesta lo mismo que saltear 1. Esto
  **reemplaza** a la guarda `if (state.nextBar < fromTime)` del spec 002.
- **Nunca hay más de `horizon` de *onsets* comprometidos**, con cualquier tamaño de ciclo. Es lo que
  hace que quitar una pieza la calle rápido; emitir un ciclo entero de una lo dejaría sonando hasta
  8,98 s con 10 piezas a 110 bpm (`research.md` del spec 009, §4). El límite es sobre el **onset**, no
  sobre la última nota: el arpegio se expande después del onset y esa cola siempre estuvo fuera del
  horizonte. Desde el spec 008 la cola mide `compás / 4` más la nota y su release, y desde que el
  release también está en intervalos escala entera con el tempo: 1.47 s a 60 bpm y 0.55 s a 160.

  **Ojo con leer esto como "quitar una pieza la calla en 100 ms": desde el spec 009 ya no es cierto.**
  El horizonte acota lo que está *comprometido*, no cuándo entra en vigencia el cambio: quitar una pieza
  reemplaza la secuencia **pendiente**, y la pendiente entra recién al cerrar el ciclo activo (D5). Con 8
  piezas a 110 bpm eso son hasta 7,5 s. Lo que el horizonte sigue garantizando es que **pausar** corta en
  100 ms más la cola, porque ahí se frena el temporizador y no hay ciclo que esperar.

`firstOnsetAfter` usa `floor(x) + 1` y **no** `ceil(x)`: se quiere el primer onset *estrictamente*
posterior a lo ya emitido. Con `ceil`, un onset que cae exacto en el borde de una ventana saldría dos
veces — al cerrar una ventana y al abrir la siguiente.

`startClock` deja `scheduledUntil = currentTime` y `origin = currentTime + 0.05`, en ese orden de
magnitud: **`scheduledUntil` tiene que quedar estrictamente antes de `origin`**, o el primer onset del
ciclo 0 se saltea y el primer sonido llega un ciclo tarde. Es la misma trampa que reaparece en el swap
de secuencia al cerrar un ciclo — ver [más abajo](#el-swap-en-el-cierre-de-ciclo).

## El recorrido en el scheduler

`circuit/sequence.ts` arma el circuito y los offsets; el motor no recalcula ni reordena nada, solo lee
lo que le entregan. El shell llama a `buildSequence(placed, regimen)` en un `useMemo` y
`proyectarAlMotor` (`playback/engine-bridge.ts`) lo lleva a la `Sequence` del motor, que **no lleva celdas**:

```ts
// playback/scheduler.ts
export interface Sequence {
  steps: { offset: number; notes: number[] }[];   // sin pieceId: el motor no tiene a quién devolvérselo
  clicks: { offset: number; note?: number }[];     // sin cell, pero desde el spec 011 SÍ con altura
  length: number;                                  // el ciclo, en intervalos
}
```

El click **mudo** suena igual en cualquier celda —es una campana de altura fija desde el spec 015, y
esa altura no sale del modelo (ver [más abajo](#el-click))—; desde
el spec 011 el recorrido puede cruzar una celda ocupada, y ese cruce lleva su nota en `note` —MIDI,
ausente cuando la celda está vacía—. La celda en sí sigue sin ser información que el motor pueda usar,
y `Sequence` sigue sin importar `Cell` del dominio ni con `import type`, porque el motor habla MIDI y
no importa el circuito: `note` viaja como número plano, no como referencia a la
celda que lo originó. Pero **ya no es cierto que para sonar alcance con contar clicks** — un click con
`note` suena distinto de uno sin ella (ver [más abajo](#el-click)). `setSequence(next)` reemplaza a
`addJob`/`removeJob`/`clearJobs`; `sequenceInfo()` reemplaza a `jobCount()` como receta de verificación
en el navegador — ver [más abajo](#cómo-verificar-el-audio).

### El período pasa del compás al ciclo

`firstOnsetAfter` **no cambia ni una línea** — sigue resolviendo la progresión en forma cerrada (ver
[arriba](#el-reloj-es-un-origen-no-un-cursor)). Lo que cambia es qué se le pasa: el período pasa a ser
el ciclo entero (`sequence.length * intervalDuration(bpm)`) y la fase de cada paso es
`offset / sequence.length`, en vez de la columna del ancla. Los clicks son offsets sueltos sin notas:
mismo `firstOnsetAfter`, sin expansión de arpegio.

### El swap en el cierre de ciclo

Colocar o quitar una pieza puede reordenar el circuito entero (D1 del spec 009) — el motor no puede
aplicar ese cambio a mitad de ciclo sin que el patrón salte. `setSequence(next)` guarda `next` como
**pendiente** y no toca la secuencia **activa**; `tick()`, antes de recolectar hits, revisa si el reloj
cruzó el borde del ciclo: si lo cruzó y hay pendiente, la activa pasa a ser la pendiente y ese borde
pasa a ser el nuevo `origin`.

**En ese swap hay que bajar `scheduledUntil` a estrictamente antes del nuevo `origin`.** Es la misma
trampa que `startClock` ya evita (ver arriba) y con el mismo síntoma: el horizonte es de 100 ms y el
borde se detecta cada 25 ms, así que al cruzarlo `scheduledUntil` ya quedó **adelante** del borde; si se
lo deja quieto, el primer onset del ciclo nuevo cae antes de donde `firstOnsetAfter` empieza a buscar y
se pierde en silencio, sin ningún error.

Si la secuencia activa está vacía, la pendiente entra en vigor **ya** — si no, la primera pieza jamás
sonaría, porque no hay ciclo que cerrar. Y con `sequence.length === 0` no hay borde que cruzar: la
guarda es explícita, porque calcular un período de longitud 0 divide por cero o da el borde por cruzado
en cada tick — es el estado real de "se quitó la última pieza", no un caso teórico.

**El precio es la latencia, y es una decisión, no un bug.** Colocar una pieza puede tardar hasta un
ciclo entero en escucharse: 7,5 s con 8 piezas a 110 bpm, 4,4 s con 4 (`research.md` del spec 009, §4).
Es el costo de que el circuito se pueda reordenar entero sin que el patrón salte a mitad de frase (D5).
Si al usarlo resulta intolerable, la salida no es aplicar los cambios en caliente —eso reordena el
patrón a mitad de frase— sino aplicarlos en el próximo cruce por la pieza afectada, que es una regla
más fina y su propio cambio.

### El click

Un salto de `d` celdas entre la salida de una pieza y la entrada de la siguiente produce `d − 1`
eventos intermedios, uno por celda del camino que devuelve `routeBetween(a, b, placed)`
(`circuit/routing.ts`). Sobre celda **vacía** suena una **campana de altura fija** de 50 ms a volumen
bajo (`CLICK_MIDI`, `CLICK_VELOCITY`, `CLICK_SECONDS` en `voice.ts`) — `scheduleClick` en
`voice.ts` es la otra forma de sonido del motor, aparte de `scheduleVoice`.

Fue **ruido blanco** desde el spec 009 y hasta el 015, con un argumento explícito: un oscilador
siempre tiene altura, y una altura haría que el recorrido dibujara una línea melódica que compite con
las piezas. El 015 lo acotó en vez de negarlo: **lo que dibuja una línea melódica es tener alturas
distintas**, y ésta nunca cambia — un metrónomo tiene altura y no toca nada. Lo que evita que se lea
como una nota más no es la brevedad sino el **registro**: `CLICK_MIDI` (96, `C7`, 2 093 Hz) está nueve
semitonos por encima del techo del instrumento (`D#6`, 1 244,5 Hz), así que ninguna pieza puede llegar
ahí. "Fuera de la escala" no era una opción y está medido: el instrumento usa **las 12 clases de
altura sobre 12**, así que no hay ninguna nota libre.

El motivo del cambio también está medido, renderizando los dos timbres offline: el centroide espectral
del ruido caía en **~11 000 Hz**, casi dos octavas por encima del techo del instrumento, contra los
**~2 100 Hz** de la campana. Y no era un evento marginal — en un tablero de 3 piezas el **44 %** de
los eventos de un ciclo son clicks.

| | ruido (hasta el 015) | campana (desde el 015) |
|---|---|---|
| Fuente | `AudioBufferSourceNode` con muestras aleatorias | oscilador senoidal |
| Altura | ninguna | fija, `CLICK_MIDI` = 2 093 Hz |
| Duración | 20 ms | 50 ms |
| Centroide medido | ~11 000 Hz | ~2 100 Hz (2 645 con ventana rectangular) |
| Cae 40 dB en | 19,6 ms | 29,5 ms |
| Default | encendido | **apagado** |

Sobre celda **ocupada** suena la nota de esa celda —la misma que la celda muestra
desde el spec 007— como una floritura: más corta y más suave que la nota de una pieza
(`GRACE_INTERVALS`, `GRACE_VELOCITY` en `voice.ts`, junto a `NOTE_INTERVALS` y no a
`CLICK_SECONDS`, porque a diferencia del click sí tiene altura), agendada con `scheduleVoice` — no
hace falta una función nueva. Con 8 piezas un ciclo tiene ~15 eventos intermedios contra 40 notas
(`research.md` del spec 009, §4) — sin ellos, un salto de varias celdas es un silencio mudo de casi un
segundo, y el recorrido —que es todo el modelo— se vuelve inaudible.

**Solo el click mudo se puede apagar; el interruptor es de mezcla y no del modelo.**
`setClicksAudible(false)` —el botón de metrónomo de la fila de transporte, que desde el spec 019 lleva
«Recorrido en el vacío» en su `aria-label` y su `title` en vez de como etiqueta visible— deja de cablear a sonido
los clicks **sin nota** en `tick()`; la `Sequence` sigue teniendo sus clicks y `collectWindow` los sigue emitiendo.
Filtrarlos antes obligaría a reconstruir la secuencia por algo que no es una decisión del tablero, y
haría que el ciclo pareciera distinto según el volumen. El cruce con altura **no** se apaga con este
interruptor (D6 del spec 011): es modelo, no mezcla.

**Hasta el spec 011 el camino cruzaba celdas ocupadas sin pagar nada.** `pathBetween` —hoy borrado,
junto con `cellDistance`, `bestRoute` y el const-object `ROUTE`— era el camino mínimo *ignorando*
obstáculos: medido, entre el 71 % y el 88 % de los tramos pisaban una pieza, y en el tablero lleno de
12 piezas caían ahí los 21 clicks del ciclo. Esquivar las piezas dejó de ser "un spec propio" —así lo
anotaba el 009 en su tabla de riesgos— y es exactamente lo que hace el 011: `routeBetween` no es un
BFS que rodea a cualquier costo, es un camino de **costo mínimo** con peso 1 en celda vacía y
`CROSS_COST = 5` (`circuit/routing.ts`) en celda ocupada, así que
rodea cuando el rodeo sale barato y cruza —sonando la nota— cuando rodear cuesta más caro. El
interruptor de clicks queda, pero ya no es la única mitigación: la mitigación de fondo es el peso.

**Desde el spec 015 ese interruptor arranca en `false`** —los clicks nacen apagados, y el default vive
en dos lugares que tienen que decir lo mismo: el `useState` de `App.tsx` y `clicksAudible` en
`engine.ts`, que el efecto de `playback/use-engine.ts` pisa al montar—. El argumento del 009 no se
negó: sin clicks un salto largo es un silencio mudo, y
apagarlos apaga el 44 % de los eventos de un tablero chico. Lo que cambió es quién decide. Por eso el
`T070` del 011, que proponía **borrar** el botón, quedó cerrado con un "no": con el default dado vuelta
el botón es la única forma de **encender** el recorrido.

**El 5 no es el 2 con el que este spec arrancó, y el porqué está medido en el docblock de la
constante.** Con peso 2 el recorrido cruzaba una pieza **teniendo un rodeo libre disponible** en el
20,4 % de los tramos (200 tableros aleatorios por tamaño); con 5 baja al 9,9 % y el ciclo crece 7,1 %.
Los 21 clicks del tablero lleno son hoy 14, y los 14 llevan altura: sin ninguna celda vacía el peso no
puede evitar nada, y ahí el recorrido no se apaga —sigue sonando y ahora dice sobre qué. El valor no
está cerrado: AC11 del 011 lo deja abierto a confirmarse escuchando, y moverlo es cambiar ese número.

## Reconciliación de loops

Un único `useEffect` —en `playback/use-engine.ts` desde el spec 022, en `App.tsx` hasta ahí— observa
`[secuencia, placed]` y le entrega al motor la secuencia donde debe estar. Los handlers solo cambian
estado.

```ts
useEffect(() => {
  encolar(secuencia, placed);
  setSequence(proyectarAlMotor(secuencia));
}, [secuencia, placed]);
```

La proyección vive en `playback/engine-bridge.ts` desde el spec 022 y **no se escribe a mano
acá**. Antes este snippet la mostraba inline, y con la forma corta:

```ts
clicks: s.clicks.map(({ offset, note }) => ({ offset, note })),   // ← NO
```

Esa forma deja la clave `note` **presente y en `undefined`**, que es el tercer estado que el tipo
`Click` existe para no tener: la **ausencia** de la clave es lo que significa «celda vacía». Hoy nadie
lo notaría porque `collectHits` compara `=== undefined`, y por eso el snippet vivió mal tanto tiempo —
copiarlo reintroducía el bug sin que fallara nada. `proyectarAlMotor` lo cierra con un ternario, y
`engine-bridge.test.ts` lo blinda con `'note' in destino` en vez de `=== undefined`.

El `buildSequence` que este snippet mostraba también quedó viejo por otro lado: desde el spec 017
recibe el **régimen** (`buildSequence(placed, regimen)`), y `secuencia` es un `useMemo` sobre
`[placed, regimen]`.

Dos cosas del snippet que no son detalle:

- **`playing` no está en las dependencias**, y salió a propósito con el spec 009. La secuencia es
  función del **tablero**, no del transporte: quien corta o arranca el sonido es `togglePlay`, que desde
  el spec 022 pasa por la pura `alternarTransporte` de `playback/engine-bridge.ts`. El `clearJobs()` + `if (!playing) return` de antes era la forma vieja de
  lograr lo mismo desde acá; con una sola llamada a `setSequence` deja de hacer falta, y colocar o
  quitar con el transporte parado igual deja la secuencia lista para cuando arranque.
- **Es una proyección, no una traducción.** `offset` y `notes` viajan tal cual; lo que se cae es
  `pieceId` —el motor no tiene a quién devolvérselo— y `cell` en los clicks, porque el motor no
  importa `Cell` ni como `import type` ([arriba](#el-recorrido-en-el-scheduler)). Las celdas no se
  pierden: siguen en `placed`.

Antes este efecto iteraba piezas y armaba un job por cada una; hoy es **una sola llamada**:
`buildSequence` (`circuit/sequence.ts`) arma el circuito entero —orden, offsets y clicks— de una vez, y
el puente entre el circuito y el motor es una sola pura, `proyectarAlMotor`. Que sea una pura y no dos
bloques de efecto es del spec 022: hasta ahí el mismo cruce estaba escrito dos veces —el efecto de
reconciliación y el de desmontaje—, con un comentario que ya admitía que escribirlo distinto invitaría a
divergir. Con la pura eso pasa a ser imposible de escribir, y los tres estados de `Click.note` tienen
test por primera vez.

**Por qué reemplazar la secuencia entera es seguro acá**, cuando con Tone habría reiniciado la fase de
cada loop: `setSequence` no agenda nada, solo deja la secuencia nueva como **pendiente** — `tick()` la
adopta recién al cerrar el ciclo (D5, ver
[#el-swap-en-el-cierre-de-ciclo](#el-swap-en-el-cierre-de-ciclo)). Con Tone cada job cargaba su propio
ID de evento del Transport y perderlo dejaba loops huérfanos — de hecho ese fue un bug real. Acá no hay
evento que perder: la secuencia es un dato que `tick()` lee, no algo agendado.

Y sigue siendo determinista porque **`buildSequence` se deriva del tablero y no del reloj**:
reconstruir la secuencia en cada reconciliación da siempre el mismo circuito para el mismo conjunto de
piezas. Si el orden se hubiera derivado del momento de colocación —lo que hacía Tone, por accidente—
este patrón lo habría destruido en cada reconciliación.

Tampoco hace falta flag de cancelación: `setSequence` es sincrónica, así que no hay promesa que pueda
resolver después de que el efecto se limpió.

## `AudioContext` y el gesto del usuario

El contexto vive en un singleton de módulo —hay uno por pestaña, no uno por componente— y se crea
perezosamente:

```ts
if (c.state === 'suspended') void c.resume();
```

Los navegadores exigen que el contexto se reanude desde un handler originado por el usuario. Como
`playNow` y `startClock` salen de clicks, la cadena de gesto se preserva.

**Esto se rompe fácil**: cualquier feature que quiera sonar sin click previo —un preview al pasar el
mouse, una nota al cambiar de pieza con el teclado— va a quedar muda hasta que el usuario haga click en
algo. Es una restricción del navegador, no del código.

`audio()` devuelve `null` si Web Audio no está disponible; la app queda usable pero muda, y cada
llamador tiene que chequearlo.

**Y desde el spec 027 un fallo PARCIAL vale igual que uno total.** `ctx` se asigna antes de crear el
gain y el analizador, así que cualquier cosa que tire después de `new AudioContext()` salía por el
`catch` devolviendo `null` pero dejaba el contexto en pie: la llamada siguiente entraba por
`if (ctx) return ctx` y contestaba un contexto con `master` en `null`, con lo cual `startClock`
arrancaba el timer, `clockRunning()` pasaba a `true` y el botón decía «Pausa» sin que sonara una
nota. El `catch` ahora baja `ctx`, `master` y `analyser` **juntos**, así que un contexto vivo implica
un grafo entero; el contexto a medio construir **no** se cierra —`close()` es una promesa y su
rechazo vacío sería una función sin cubrir contra el umbral 100— y queda sin referencias.

El `catch` además **latchea**: una marca de módulo hace que a partir del primer fallo `audio()`
conteste `null` sin reintentar el constructor. Sin ella cada click volvía a intentarlo y volvía a
avisar por consola —un click, un warning—; con ella el aviso es **uno** y la app queda muda hasta
recargar la pestaña, aunque la causa fuera transitoria. El precio se acepta porque el reintento
tampoco la desmuteaba, y porque un estado que se recupera solo es un estado que nadie puede
reproducir.

La consecuencia de diseño está del lado del reloj: `startClock()` chequea el **par** (`audio()` y el
master) porque es la única función cuya respuesta la UI muestra, y `tick()` recibe los dos por
parámetro en vez de leerlos del módulo — una garantía más fuerte que una guarda, y la salida que el
repo pide para una rama que dejó de ser alcanzable.

## Los dos caminos de reproducción

Hay **dos** funciones que producen sonido, y conviene saber cuál es cuál:

| Camino | Quién lo usa | Cómo llega a `scheduleVoice` |
|---|---|---|
| `playNotes()` | `playNow()`, al colocar una pieza | expande el arpegio y agenda |
| `tick()` | el loop por ciclo del recorrido | `collectHits()` ya devolvió los instantes; agenda directo |

**No están unificados en una sola función, y es a propósito**: `collectHits` tiene que ser pura para
poder testear el scheduler, así que devuelve instantes en vez de producir sonido. Volver a pasar por
`playNotes` obligaría a recalcular el espaciado que el scheduler ya aplicó.

Lo que **sí** está unificado es lo que importa para cambiar el sonido:

- `scheduleVoice()` — la única función que crea un oscilador.
- `DEFAULT_VOICE` — el timbre y la ADSR.
- `intervalDuration(bpm)` — el espaciado, definida sobre `barDuration` para que exista un solo lugar
  donde el compás se convierte en segundos.
- `NOTE_INTERVALS` y `RELEASE_INTERVALS` — la duración de la nota y su cola, medidas en intervalos y no
  en segundos absolutos, así que el solape del arpegio (`1 + RELEASE_INTERVALS` voces) es el mismo a
  cualquier tempo.

**La consecuencia práctica:** tocar el timbre en `DEFAULT_VOICE` alcanza para los dos caminos, y
también alcanza tocar `intervalDuration` para cambiar el ritmo: las dos expansiones —la de `playNotes`
y la que arma `collectHits`— salen de la misma función. Siguen siendo dos caminos —`playNotes` expande
el arpegio, `tick` recibe de `collectHits` los instantes ya expandidos—, pero lo que los separa se
achicó a la mecánica de agendado, no al espaciado.

## Análisis de la señal

El `AnalyserNode` va **en serie**, entre el master y el destino, no colgado de una rama paralela: así
ve exactamente la mezcla que sale por los parlantes. Es transparente —no altera la señal que lo
atraviesa—, de modo que insertarlo no cambia cómo suena nada.

```ts
analyser.fftSize = FFT_SIZE;                    // 256 → 128 bins
analyser.smoothingTimeConstant = SMOOTHING;     // 0.8
master.connect(analyser);
analyser.connect(ctx.destination);
```

Que sea transparente no es una creencia: `__tests__/integration.test.ts` renderiza la misma voz con y
sin el nodo en el camino y compara **muestra por muestra**. Es la única parte del análisis que se puede afirmar
offline.

Los dos valores vienen de `LiveWaveform` de `@elevenlabs/ui`, no de la intuición: 128 bins a 48 kHz dan
~187 Hz por bin —suficiente para visualizar, insuficiente para afinar— y sin suavizado temporal la
animación tiembla.

`readSpectrum()` devuelve las magnitudes 0–255 del último bloque, o `null` si todavía no hay señal que
mirar (sin contexto, o suspendido). **Es información, no una falla**: un array de ceros y "no hay
audio" se dibujan distinto, y devolver `null` también evita que el loop de dibujo cree el
`AudioContext` sin gesto del usuario.

**El buffer que devuelve es reusado** entre llamadas para no asignar 60 veces por segundo. Quien lo
guarde va a verlo cambiar por debajo; el consumidor previsto lo lee y lo descarta en el mismo cuadro.

### Por qué el mapeo bins→barras vive aparte

En `src/spectrum/spectrum-bars.ts`, y no dentro del nodo ni del componente, por una restricción medida:
**`AnalyserNode` no rinde nada útil en un `OfflineAudioContext`**. El render offline corre más rápido
que tiempo real y no tiene cuadros; `getByteFrequencyData` devuelve el estado del último bloque
procesado. Los tests del estilo "renderizar y afirmar sobre el espectro" que sí funcionan para la
síntesis, acá no existen.

La respuesta no fue renunciar a testear sino mover la lógica adonde sí se puede: `binsToBars(bins,
barCount)` toma un `Uint8Array` y devuelve alturas 0–1. Entrada a mano, salida determinista, sin tocar
Web Audio. El nodo queda reducido a una fuente de datos sin test propio.

Dos decisiones dentro del mapeo:

- **Bandas logarítmicas, no lineales.** Los bins están espaciados linealmente en frecuencia pero la
  percepción no: con reparto lineal las dos primeras barras se comen toda la información musical y el
  resto del canvas muestra agudos vacíos.
- **Pico por banda, no promedio.** Promediar una banda ancha aplana los transitorios, que es justo lo
  que hay que ver en un instrumento percusivo.

El canvas (`src/spectrum/Spectrum.tsx`) dibuja imperativamente dentro de `requestAnimationFrame` y
**no pasa por estado de React**: 60 renders por segundo para pintar barras competirían con el
re-render del tablero. React monta el `<canvas>` y arranca/frena el loop; nada más.

## La cabeza lectora

Segundo consumidor del motor por fuera de React, con el mismo patrón que `readSpectrum()`: leer un
singleton sin pasar por estado de React porque la frecuencia de actualización lo prohíbe.

**Superficie:** `playheadOffset(): number | null` y `cycleGeneration(): number`, dos exports nuevos de
`engine.ts`. `playheadOffset` lee del singleton y de la secuencia **activa**, y devuelve `null` en pausa,
sin contexto, con la secuencia vacía y mientras la activa **todavía no empezó a sonar** (ver abajo) —
exactamente como `readSpectrum()` devuelve `null` en reposo.
`cycleGeneration` es un contador de swaps de ciclo: es el único observador del instante exacto en que la
secuencia pendiente reemplaza a la activa (ver [el swap en el cierre de
ciclo](#el-swap-en-el-cierre-de-ciclo)), y `playback/route-source.ts` lo usa para saber cuándo cambiar
de tablero.

**La aritmética vive en `playback/playhead-offset.ts`, aparte de `engine.ts`, por el mismo motivo que
`spectrum-bars.ts`:** lo testeable va separado del singleton, que en los tests no existe. `offsetAt(now,
origin, intervalSeconds, cycleIntervals)` calcula `floor((now − origin) / intervalo) mod ciclo` en
**módulo euclídeo**, y devuelve `null` —nunca `NaN`— en tres degradados: ciclo 0 (tablero vacío, se
alcanza con solo apretar play), `t` anterior al `origin` (el `%` de JS conserva el signo del dividendo) y
argumentos no finitos.

**La posición está compensada por la latencia de salida.** Sin restar `outputLatency` (con
`baseLatency`, o `0`, como fallback en ese orden) la cabeza va sistemáticamente adelantada, y en un
instrumento eso se percibe como que la imagen miente. Trampa de tipos medida: `lib.dom.d.ts` declara
`readonly outputLatency: number`, **no opcional**, mientras que Firefox no lo implementa — TypeScript
dice que el fallback sobra justo donde hace falta, y como el repo prohíbe `any` y `@ts-ignore`, la
lectura se tipa como `number | undefined` de forma explícita.

**Por qué no pasa por estado de React, con el número exacto:** el intervalo dura entre 0,25 s (60 bpm) y
0,094 s (160 bpm), o sea 4 a 10,6 actualizaciones por segundo. Llevar eso a `useState` re-renderizaría 60
celdas más la paleta y la lista, diez veces por segundo, para mover un resaltado — es exactamente lo que
`Spectrum.tsx` ya evita (ver [arriba](#análisis-de-la-señal)). `playback/Playhead.tsx` compara la
celda calculada contra la anterior y solo escribe el estilo **cuando cambió**: 60 lecturas por segundo,
~10 escrituras. Y la cabeza **salta, no se desliza**: el instrumento está cuantizado a la grilla de
intervalos, y un movimiento continuo sugeriría una continuidad que no existe.

**El estado "pendiente" no pasa por React, y esa fue una corrección sobre la marcha.** El plan del 010 lo
tenía como la excepción declarada a D1, con el argumento de que cambia una vez por ciclo —7,5 s con 8
piezas a 110 bpm— contra las 4 a 11 veces por segundo de la cabeza. Dejó de valer cuando el estreno pasó
a ser **celda por celda**: son cinco cambios al ritmo del intervalo, o sea exactamente la frecuencia que
la medición de arriba prohíbe. Hoy el velo son nodos que `Playhead.tsx` crea y destruye a mano encima de
la grilla, así que **no queda nada del spec 010 en el árbol de React**, y la regla no tiene excepciones.

Que el estreno sea celda por celda no es un adorno: es lo único que hace visible que a una pieza le toca
su turno en un instante concreto, y que ese instante no lo decide el orden de colocación sino el
circuito. Con el destape en bloque al cerrar el ciclo, las ocho piezas se encendían juntas y esa
información se perdía.

**Y depende de una guarda de una línea, que el review encontró apagada.** `collectWindow` pone la
pendiente en vigencia **dentro del lookahead** y deja `origin` en el borde, que en ese momento todavía es
futuro: medido, hasta 82 ms a 110 bpm, más la latencia de salida, y lo mismo en el primer arranque con
los 50 ms de `CLOCK_START_DELAY`. Con `now < origin`, `offsetAt` contesta —bien, como función total— la
**cola** del ciclo, o sea `ciclo − 1`; y como el velo destapa toda celda con `offset ≤ offset actual`, ese
número, que es el máximo posible, destapaba las cinco de un saque en el mismo cuadro en que se creaban.
El estreno celda por celda no se veía **nunca**, ni al colocar con el ciclo andando ni al apretar play, y
`pnpm verify` no podía verlo. Por eso `playheadOffset()` devuelve `null` en esa ventana: la ruta vieja ya
no está y la nueva todavía no empezó, así que cualquier celda que se dibujara ahí sería mentira. El hecho
del scheduler que lo causa queda clavado en `scheduler.test.ts` («el swap deja `origin` en el FUTURO»),
que es la parte testeable — la lectura del reloj no lo es.

`playback/route-source.ts` es el singleton de módulo que espeja el
par `active`/`pending` del motor pero con la `Sequence` del **dominio**, que es la única que lleva
celdas: el motor tiene el par pero su `Sequence` no puede ver `Cell` (ver
[arriba](#el-recorrido-en-el-scheduler)), y la UI tiene las celdas pero solo del tablero de *ahora*, o
sea la pendiente. Sin esto, durante la espera de hasta 7,5 s que el swap de ciclo introduce, la cabeza
recorrería el circuito nuevo mientras suena el viejo. El swap está atado a `cycleGeneration()`, que es el
único observador del instante exacto.

**Y tiene una puerta de reinicio, `reiniciar()`, que el spec 027 le agregó.** El módulo avanza sólo
cuando `cycleGeneration()` sube, y ese contador lo mueve `tick()`, o sea el reloj. Con el transporte
parado el par queda congelado y `encolar` igual recomputa el velo leyéndolo: tras un `Reset` quedaba
dibujado el velo de piezas que ya no están, sobre un tablero vacío, hasta el próximo Play. La llama el
`Reset` del shell a través de `reiniciarRecorrido()` de `playback/use-engine.ts` —el mismo módulo por
el que sale `frenarTransporte()`—, porque las dos colas se reinician por el mismo camino o vuelve la
asimetría que **era** el bug: el párrafo de `App.tsx` que dice que «Reset es una orden explícita de
volver a cero, no una edición del tablero» estaba escrito sólo para el motor.

`generacion` es lo único que **no** vuelve a su valor inicial: se sincroniza con `cycleGeneration()`.
Ponerla en cero reintroduciría desde este lado exactamente la mentira que `cycleGen` evita al no
resetearse nunca, y además haría un swap fuera del borde del ciclo en el cuadro siguiente.

**Este spec no calcula ningún recorrido: lo lee.** Entre el par de celdas más lejano del tablero hay 792
caminos mínimos, o sea 792 formas de que el dibujo discrepe del sonido si la UI eligiera el suyo — el
mismo argumento que ya separó al 009 del 010 (ver la [nota de revisión sobre ese
corte](https://github.com/federicohermo/pentomino-games/issues/71)).

## Cómo verificar el audio

### En tests: `OfflineAudioContext`

Renderiza a un `AudioBuffer` en memoria, más rápido que tiempo real y de forma determinística. Los
helpers están en `src/playback/__tests__/test-context.ts`:

| Helper | Para qué |
|---|---|
| `offline(secs)` | contexto de render |
| `zeroCrossHz(d, from, to)` | frecuencia por cruces por cero **interpolados** |
| `peakNear(d, t)` | pico en una ventana |
| `firstAudible(d)` | instante de la primera muestra audible |
| `detectOnsets(d)` | onsets por seguidor de envolvente con histéresis |

Dos trampas que costaron un ciclo de tests cada una:

- **`zeroCrossHz` debe interpolar.** Contar cruces y dividir por la duración de la ventana cuantiza:
  en 0.1 s el error es de ~5 Hz, suficiente para leer 261.6 Hz como 263.2. Se mide entre el primer y el
  último cruce interpolados.
- **`detectOnsets` no puede ser un umbral sobre la muestra cruda.** Cada cruce por cero de la onda
  parece silencio: medido, 21 falsos onsets para 3 notas. Hace falta envolvente por ventanas de 5 ms
  con dos umbrales (0.05 para disparar, 0.01 para rearmar).

### En el navegador

```js
const m = await import('/src/playback/engine.ts');   // en dev, mismo singleton
m.sequenceInfo();                                  // { steps, clicks, crosses, length } de la activa
m.clockRunning();                                  // reloj
m.audio().state;                                   // 'running' | 'suspended'
m.readSpectrum();                                  // null en reposo; Uint8Array(128) sonando
```

`clicks` y `crosses` van **separados desde el spec 011**, y `clicks` ya no es el total de celdas
cruzadas: cuenta solo las mudas —celda vacía—, y las ocupadas, que suenan su nota como floritura, van
en `crosses`. El campo `clicks` de la `Sequence` sigue mezclando las dos, pero el motor las distingue
—una se apaga con `setClicksAudible` y la otra no (D6)— y esta función existe justamente para mirar el
motor sin oírlo: un solo número obligaría a oír cuál es cuál.

Para comprobar que el scheduler realmente dispara, contar osciladores creados:

```js
const c = m.audio(), orig = c.createOscillator.bind(c);
let n = 0; c.createOscillator = () => { n++; return orig(); };
// esperar N segundos… n ≈ (segundos / duraciónDelCiclo) × notas del ciclo
// duraciónDelCiclo = sequenceInfo().length * intervalDuration(bpm)
// notas del ciclo = 5 × sequenceInfo().steps
```
