---
paths:
  - "src/audio/**/*.ts"
  - "src/components/Spectrum.tsx"
  - "src/components/Playhead.tsx"
---

# Capa de audio

Motor propio sobre Web Audio, sin librerías: `voice.ts` (síntesis), `scheduler.ts` (lookahead),
`engine.ts` (singletons y la API que consume la UI) y `spectrum.ts` (mapeo bins→barras). Habla números
MIDI y **no conoce el dominio**.

El porqué de cada decisión, con las mediciones que la respaldan, está en
[docs/architecture/audio.md](../../docs/architecture/audio.md). Lo que no hay que romper:

- **`voice.ts` y `scheduler.ts` reciben el `AudioContext` por parámetro y no pueden tocar el
  singleton**, porque vive en `engine.ts` y ellos no lo importan. Es lo que permite renderizarlos con
  `OfflineAudioContext`, y desde el spec 005 lo sostiene el grafo de imports en vez de un comentario:
  es la diferencia entre audio testeable y audio que solo se puede escuchar.
- **`ctx.resume()` necesita un gesto.** Nada suena antes del primer click. Cualquier feature que quiera
  sonar sin click previo va a quedar muda.
- **Falla suave:** `audio()` devuelve `null` si Web Audio no está disponible; la app queda usable pero
  muda, y todo llamador tiene que chequearlo.
- **Hay dos caminos a sonido, no uno:** `playNotes()` (arpegio al colocar) y `tick()` (loop), que llama
  a `scheduleVoice()` directo porque `collectHits` ya expandió los instantes. Lo unificado es
  `scheduleVoice`, `DEFAULT_VOICE` y `intervalDuration(bpm)`: cambiar el timbre alcanza para los dos, y
  cambiar el intervalo también, porque las dos expansiones salen de la misma función. `tick()` agenda
  además `scheduleClick()` (spec 009) para los clicks del recorrido, con volumen propio.
- **El scheduler usa lookahead:** temporizador grueso de 25 ms que agenda 100 ms de futuro contra el
  reloj de audio. El temporizador no dispara notas, decide cuándo mirar.
- **El reloj es un origen, no un cursor.** `ClockState` son dos escalares —`origin` y `scheduledUntil`—
  sin cambios desde el spec 002, y los onsets salen en forma cerrada
  (`origin + (k × ciclo + offset + j) × intervalo`, con `offset` el desplazamiento del paso dentro del
  ciclo y `j` el índice de la nota). `scheduledUntil` es lo único que evita re-emitir cada onset cuatro
  veces; los ciclos perdidos por la pestaña oculta **se saltean, no se recuperan**; y nunca hay más de
  `LOOKAHEAD` de **onsets** comprometidos, con cualquier tamaño de ciclo — es lo que hace que **pausar**
  corte en 100 ms **más lo que le quede de arpegio ya agendado**, que desde el spec 008 depende del tempo
  (`compás / 4` más la nota y su release, todo en intervalos: 1.47 s a 60 bpm, 0.55 s a 160). Ojo: eso vale para pausar, no
  para **quitar una pieza** — desde el spec 009 eso reemplaza la secuencia pendiente y entra recién al
  cerrar el ciclo (D5), o sea hasta 7,5 s con 8 piezas a 110 bpm. `firstOnsetAfter`
  usa `floor(x) + 1` y no `ceil(x)`: con `ceil`, un onset en el borde de la ventana sale dos veces. Y
  `startClock` tiene que dejar `scheduledUntil` **estrictamente antes** de `origin`, o se pierde el
  primer onset del ciclo 0.
- **El click se apaga en la mezcla, no en el modelo — pero solo el click mudo.**
  `setClicksAudible(false)` deja de cablear a sonido los clicks sin nota en `tick()`; la secuencia
  sigue teniendo sus clicks y `collectHits` los sigue emitiendo. Filtrarlos antes obligaría a
  reconstruir la secuencia por algo que no decide el tablero. Desde el spec 011 el recorrido
  (`routeBetween`) puede cruzar una celda ocupada, y esa celda **suena su nota** —una floritura más
  corta y más suave que la nota de pieza—; ese cruce con altura **no se apaga con
  `setClicksAudible`**: es modelo, no mezcla (D6 del spec 011).
- **El motor distingue tres clases de evento, no dos.** `HIT` (`audio/constants/scheduler.constants.ts`)
  pasa de dos a tres claves, y el union `Hit` (`audio/types/scheduler.types.ts`) gana una tercera rama
  con su propio `hz` —no un `hz?: number` sobre la rama del click—. La construye `collectHits` en
  `audio/scheduler.ts`; `engine.ts` solo la despacha. La `Sequence` sigue sin llevar `Cell` ni ningún
  otro tipo de `domain/` —ni con `import type`—, pero desde el spec 011 **ya no es cierto que para
  sonar alcance con contar clicks**: `clicks` es `{ offset: number; note?: number }[]`.
  `proyectarAlMotor` (`components/engine-bridge.ts`) sigue llevando `buildSequence(placed, regimen)`
  a esa versión antes de que `use-engine.ts` la pase a `setSequence`. Es D7/D8 del spec 009 más la
  ampliación del 011, y lo verifica `pnpm lint` con el override de capa.
- **El swap de secuencia al cerrar el ciclo (spec 009) tiene la misma trampa que `startClock`.** Al
  reemplazar la secuencia activa por la pendiente hay que bajar `scheduledUntil` a estrictamente
  **antes** del nuevo `origin`, o el primer onset del ciclo nuevo se pierde en silencio sin ningún
  error — el mismo síntoma que la guarda de arriba.
- **El `AnalyserNode` va en serie** entre el master y el destino, y es transparente al audio.
  `readSpectrum()` devuelve `null` en reposo —eso es información, no falla— y reusa el buffer entre
  llamadas: quien lo guarde va a verlo cambiar por debajo. El mapeo bins→barras vive aparte, en
  `spectrum.ts`, porque **`AnalyserNode` no rinde nada útil en `OfflineAudioContext`**: es lo testeable,
  y por eso está separado del nodo.
- **La cabeza lectora (spec 010) es el segundo consumidor del motor por fuera de React.** Su superficie
  son dos exports de `engine.ts`: `playheadOffset(): number | null` (lee del singleton y de la secuencia
  **activa**; `null` en pausa, sin contexto, con la secuencia vacía y mientras `now < clock.origin`,
  igual que `readSpectrum()` en reposo) y
  `cycleGeneration(): number`, un contador de swaps de ciclo. **La guarda `now < origin` no es
  defensiva:** el swap se decide dentro del lookahead y deja `origin` en el borde, que todavía es futuro,
  así que sin ella la cabeza contesta la cola del ciclo nuevo —el offset MÁXIMO— mientras suena la vieja.
  La aritmética vive aparte, en
  `audio/playhead.ts` (`offsetAt`, módulo euclídeo, `null` y nunca `NaN` en los tres degradados), por el
  mismo motivo que `spectrum.ts`. Lo que no hay que romper: la posición está **compensada por la
  latencia de salida** (`outputLatency` → `baseLatency` → `0`) o la cabeza queda sistemáticamente
  adelantada, y `outputLatency` no es opcional en `lib.dom.d.ts` pese a que Firefox no lo implementa —la
  lectura se tipa `number | undefined` a mano porque el repo prohíbe `any` y `@ts-ignore`. Detalle en
  [docs/architecture/audio.md](../../docs/architecture/audio.md#la-cabeza-lectora).

**Verificar audio sin oírlo:** en tests con `OfflineAudioContext`; en el navegador con `sequenceInfo()`
—pasos, clicks **mudos**, cruces con altura y largo del ciclo de la secuencia activa; los dos últimos
son del spec 011, y `clicks` dejó de ser el total de celdas cruzadas— y contando osciladores. Recetas en
[docs/architecture/audio.md](../../docs/architecture/audio.md#cómo-verificar-el-audio).
