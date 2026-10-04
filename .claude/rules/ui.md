---
paths:
  - "src/App.tsx"
  - "src/components/**/*.tsx"
  # Los `.ts` de la capa entran desde el spec 022: los efectos que el shell tenía
  # viven en `use-engine.ts` y `use-input.ts`, que NO son `.tsx`. Sin este patrón la regla
  # no se carga al tocarlos, que es exactamente donde hacen falta las tres cosas
  # que el 022 agregó abajo — la cardinalidad de dependencias, «callbacks y no
  # setters», y el `tapLimpio` compartido.
  - "src/components/**/*.ts"
---

# UI: el shell y los componentes

`App.tsx` es el shell: estado con `useState` local, derivados, handlers y la composición. Desde el spec
022 **no declara un solo `useEffect`**: los cuatro de reconciliación viven en `components/use-engine.ts`,
los dos de entrada en `components/use-input.ts` y el que mide el viewport para escribir `--cell` en
`components/use-grid.ts` (specs 021 y 031). Ese último es el caso que muestra que la regla no es una
formalidad: un listener de `resize` es exactamente lo que la sección «Los listeners de entrada» ya
resolvía, y el shell se quedó con el `ref` y la llamada. **Ninguna función pura y ningún literal de
dominio** — y eso ya no significa «se va a `domain/`»: un `.tsx` no puede exportar nada además del
componente (`react-refresh/only-export-components`), así que lo que vive acá no se puede testear, pero
el destino puede ser tanto `domain/` como un `.ts` de `components/`. Es lo que el spec 029 aplicó a los
dos últimos lugares donde quedaba lógica encerrada: los bucles de `Playhead.tsx` y `Spectrum.tsx`
salieron a `playhead-loop.ts` y `spectrum-loop.ts` sin cambiar una línea de comportamiento.

Desde ese spec `components/` tiene **dos clases de test y las dos corren con `pnpm test`**: los `.ts`
puros en el proyecto `node` —`input.ts`, `cell-text.ts`, `cell-name.ts`, `piece-mini.ts`,
`orientation-text.ts`, `route-source.ts`, `engine-bridge.ts`, `palette.constants.ts` y los dos
`-loop.ts`— y los
`*.browser.test.tsx` en un
Chromium de verdad, que es donde se verifican los seis componentes, `App.tsx` y los dos hooks. El
discriminante es el **sufijo**, no la carpeta. Y el umbral es 100 en las cuatro métricas: lo que se
agregue acá viene con su test o no mergea.

Los componentes son presentacionales, uno por archivo: reciben datos y callbacks por props, sin estado
ni efectos propios. La excepción ya no es una sola: `Spectrum.tsx` y `Playhead.tsx` (spec 010) no reciben
props y leen del motor por su cuenta, dibujando imperativamente. La regla que las habilita es la misma en
las dos: un componente puede leer del motor por su cuenta y dibujar imperativamente cuando la frecuencia
de actualización haría que el estado de React re-renderizara el árbol para nada —60 fps en `Spectrum`,
4 a 10,6 veces por segundo en `Playhead`—. Lo que decide no es la importancia del dato sino su
**frecuencia**, y el spec 010 lo pagó: su plan dejaba el estado "pieza pendiente" en `useState` porque
cambiaba una vez por ciclo (7,5 s con 8 piezas a 110 bpm), y hubo que sacarlo cuando el estreno pasó a
ser celda por celda —cinco cambios al ritmo del intervalo—. Hoy `Playhead.tsx` también dibuja ese velo,
con nodos que crea y destruye él mismo.

- **El loop no toca nodos que renderiza React, y React no toca nodos del loop.** Es la otra mitad de la
  regla, y la más fácil de romper: la tentación es atenuar la celda de `Board` desde el bucle. Las celdas
  van con `key={i}` y **sin refs ni `data-*`** justamente para que no haya handle; lo que el loop
  necesita pintar, lo pinta con nodos propios superpuestos. Partir el estilo de un mismo nodo entre los
  dos es lo que el review del spec 007 pagó caro.

- **Todo lo que suena en el loop pasa por el efecto de reconciliación**, que vive en
  `components/use-engine.ts` y no en el shell. Un único `useEffect` sobre `[secuencia, placed]` entrega
  la secuencia al motor con `setSequence`; los handlers solo cambian estado. `playing` **no** está en
  las dependencias, y desde el spec 009 eso es deliberado: la secuencia es función del tablero y no del
  transporte, y quien arranca o corta el sonido es `togglePlay`. El `clearJobs()` + `if (!playing)
  return` de antes era la forma vieja de lograr lo mismo desde acá. El patrón imperativo anterior
  —cada handler limpiando lo suyo— produjo loops huérfanos que sobrevivían a "Quitar" y "Reset". Si
  hace falta agendar algo nuevo, va adentro de ese efecto.
- **El hook recibe la `secuencia` ya derivada y no la vuelve a derivar.** El `useMemo` de
  `buildSequence(placed, regimen)` se queda en el shell: si el hook llamara a `buildSequence` por su
  cuenta, el dibujo y el sonido podrían mirar circuitos distintos sin que nada falle, que es lo que D5
  del 009 existe para cerrar. El shell deriva la regla; el hook recibe el resultado.
- **La proyección dominio→motor vive en `components/engine-bridge.ts` y en ningún otro lado de
  `src/`.**
  `proyectarAlMotor` es el único puente entre las dos capas: entrega la `Sequence` del dominio dejando
  caer `pieceId` y `cell`, porque `audio/` no puede ver `Cell` ni con `import type`. Es una **pura** y
  no un efecto, justamente para que ese cruce tenga test —los tres estados de `Click.note`, incluido
  que el click mudo salga **sin la clave**—. Ver `.claude/rules/audio.md`.
- **El transporte se alterna con `alternarTransporte(playing, MOTOR)` y no con `startClock`/`stopClock`
  sueltos.** La pura devuelve lo que el motor dice que pasó y no lo que se le pidió, que es la falla
  suave que `.claude/rules/audio.md` obliga a chequear en todo llamador. `MOTOR` es el cableado real y
  vive en `use-engine.ts`, el único módulo de la capa que importa la **API de transporte** del motor
  (`startClock`, `stopClock`, `clockRunning`, `setSequence`, `setBpm`, `setClicksAudible`). No es el
  único que importa `audio/engine.ts`: `Playhead.tsx`, `Spectrum.tsx` y `route-source.ts` también, pero
  los tres piden **lecturas** —`playheadOffset`, `readSpectrum`, `cycleGeneration`— y ninguna de las
  tres arranca, frena ni agenda nada.
- **Nunca mutar objetos ya entregados a React.** Ese fue exactamente el bug de los loops que motivó el
  rediseño: `newPiece._sched = id` después del `setPlaced`. Si un dato tiene que cambiar después de
  crearse, o va en el estado con su propio setter, o va afuera de React (ref o singleton de módulo).
- **Efectos que reconcilian**, no que ejecutan comandos. Con flag de cancelación si hacen trabajo
  asincrónico; sincrónicos si la limpieza tiene que ganarle al re-montaje de StrictMode.
- **`key` por id, nunca por índice**, en listas de elementos removibles.
- **Un solo export por `.tsx`.** `react-refresh/only-export-components` lo exige. Los tipos de props
  que se comparten entre un contenedor y sus paneles van a `components/types/*.types.ts`
  (`panel.types.ts`); los que no se comparten quedan inline y sin exportar. Es la misma regla que
  mantuvo al dominio sin tests mientras vivía acá, y la que le sacó al shell sus seis `useEffect` con
  el spec 022.
- **Lo que sale de una constante va por estilo inline, no por clase.** Tailwind escanea el fuente: una
  clase interpolada (`w-[${CELL_PX}px]`) no se generaría.

## El tablero se edita en el tablero

Desde el spec 014 **no hay panel derecho**: `PlacedList` murió y con él la única superficie que
duplicaba lo que el tablero ya dice. Una pieza colocada se quita clickeándola y se mutea con
`Alt`+click, y las dos operaciones piden **tener esa misma pieza en la paleta** — la llave se mide sobre
la celda clickeada con `occupantAt`, no con `isValid`, que también falla al chocar contra una pieza
distinta y ahí no tiene que pasar nada.

- **La condición «es la pieza que está en la mano» se escribe una sola vez.** La usan el handler del
  click y la derivación del hover, que decide el cursor y si se pinta el fantasma. Dos copias son dos
  formas de que el cursor prometa una cosa y el gesto haga otra.
- **El estado de una pieza no se comunica con su color.** El color es identidad y está medido en
  contraste; la opacidad la tiene tomada el velo de `Playhead`. El muteo usó el canal que quedaba —la
  ausencia de color— y el próximo estado tiene que buscarse el suyo. Ver [DESIGN.md](../../DESIGN.md).
- **No hay `col-span` ni tarjetas desde el spec 021**: el tablero ocupa el viewport y los dos paneles
  flotan encima, `fixed`, sin empujar la grilla. El tamaño de celda es
  de unos **73 px** y lo que sale del viewport es **cuántas celdas hay** (spec 031): `grid-fit.ts`
  contesta las dos cosas y `components/use-grid.ts` las escribe. La celda va por la custom property
  `--cell` —**todo lo que dependa de ella la lee de ahí y nunca de una constante**: la grilla, la
  baldosa entera, el velo, la cabeza lectora y las cajas de los dos flotantes—, y las dimensiones
  vuelven como estado, porque deciden cuántos nodos existen y eso el CSS no lo puede resolver. El
  reparto es por frecuencia: la celda cambia en cada píxel del arrastre y las dimensiones una o dos
  veces, así que el hook devuelve el objeto anterior cuando los números no cambiaron.

  **Y no hay scroll.** `Board.tsx` se quedó sin `overflow-x-auto`, sin `max-h-full` y sin `w-max`: la
  grilla entra por construcción, porque `cols · cell ≤ vw`. Lo único que se queda fijo es el filete de
  1 px de la baldosa, y su porqué está escrito al lado.

## El árbol de accesibilidad dice lo que el color pinta

`DESIGN.md` titula «El color comunica identidad, nunca estado» y `palette.constants.ts` mide contraste
con APCA contra un piso de Lc 60 — un rigor que casi ningún proyecto tiene. Lo que no se cubría es el
canal donde no hay color. El spec 025 lo midió sobre `src/`: **cero** `aria-pressed`, **cero**
`aria-checked` y **cero** `role=` en los 22 botones y el `input` de la app.

Las tres cláusulas, y las tres ya existían en el repo como comentarios sueltos antes de ser regla:

- **Todo control solo-icono lleva `aria-label`: el glifo no es un nombre.** El precedente es el botón de
  transporte de `TransportPanel.tsx`, que al quedarse sin su texto se quedó sin nombre accesible y lo
  dice en su propio comentario —«`aria-label` porque al sacar el texto el botón se queda sin nombre
  accesible: el glifo no lo es»—. La regla es lo que hace que el próximo nazca con nombre: el 019 muda
  «Recorrido en el vacío» a la fila de transporte como un SVG solo-icono, que es exactamente este caso.
- **Todo control que alterna lleva `aria-pressed`, y su nombre es lo que alterna, no el valor.** Un
  botón que se llama `OFF` tiene el nombre equivocado: lo que hace falta saber es **qué** se apaga. Y un
  grupo de selección única donde la selección es sólo un fondo oscuro no llega al árbol de ninguna forma
  — va como `role="group"` con `aria-labelledby`, sobre un nodo que **ya exista**, y `aria-pressed` en
  cada botón. **No** como `radiogroup`: eso obliga a un modelo de foco —una sola parada de tabulación y
  flechas para moverse dentro— y ese modelo lo fija el spec 026 para el tablero. Tomarlo de refilón para
  cuatro botones sería decidirlo dos veces y probablemente distinto.
- **La etiqueta se toma del texto visible con `aria-labelledby`, no se duplica en un `aria-label`.** El
  precedente es el `aria-label` de las doce miniaturas del spec 016 —«para que el lector de pantalla
  diga lo que el ojo ve»—, que es la forma correcta justamente porque ahí **no hay** texto visible que
  referenciar: una forma dibujada con `div`s no tiene nombre. Cuando el texto sí está en pantalla,
  duplicarlo es la misma cadena escrita dos veces, y la copia que se olvida de actualizar es la que
  nadie ve.

Y **`type="button"` en todo `<button>`**, sin excepción. Hoy no hay un solo `<form>` en el árbol, así
que no hay bug; pero el default de un `<button>` dentro de un formulario es `submit`, y en esta app eso
es recargar la página perdiendo el tablero entero, **sin deshacer**
([#47](https://github.com/federicohermo/pentomino-games/issues/47)).

### Quién verifica cada una, desde el spec 050

Hasta el 050 esta sección entera dependía de que se leyera y se recordara, que es lo que el spec 030
midió y descartó: **una regla en prosa está desincronizada la mitad de las veces.** Hoy cada cláusula
tiene dueño, y el alcance de cada uno importa tanto como su existencia:

| Cláusula | Quién | Alcance |
|---|---|---|
| Solo-icono lleva `aria-label` | `src/__tests__/arbol-accesible.browser.test.tsx` | Recorre todo control **nativo** y los `role` de una lista cerrada (`ROLES`): exige nombre accesible y que no sea sólo un glifo |
| `aria-labelledby` sobre duplicar la etiqueta | el mismo | Indirecto: pregunta por el nombre **calculado**, así que las dos formas pasan y ninguna se privilegia |
| El nombre de un toggle no es el valor | el mismo | Sólo la **segunda mitad**. Que un toggle *lleve* `aria-pressed` no se verifica: se lo busca por el atributo que se quiere exigir, así que es circular |
| `type="button"` en todo `<button>` | `src/__tests__/App.browser.test.tsx`, `describe` «lo que llega al arbol de accesibilidad» | Recorre los `<button>` de la app entera |

**Y el piso genérico lo cubre `eslint-plugin-jsx-a11y`** (`strict`) sobre `src/**/*.tsx`, que es la
mitad que esta sección nunca escribió porque se daba por sabida: un `role` que exige atributos que no
están, un handler sobre un elemento no interactivo, un `tabIndex` sobre algo que no lo admite. Tiene
**dos** exenciones, las dos en `Board.tsx` y las dos nombradas con su motivo en `eslint.config.js` —el
`role="grid"` que no es focusable porque implementa roving tabindex, y el envoltorio cuyo
`onContextMenu` tiene su contraparte de teclado en `use-input.ts`—. Lo que el plugin **no** puede
hacer es ninguna de las cuatro cláusulas de arriba: no distingue un glifo de un texto ni sabe cuál
botón es un toggle.

**Un *disclosure* va con `aria-expanded`, no con `aria-pressed`.** La cláusula de arriba dice «todo
control que alterna lleva `aria-pressed`» y leída al pie dejaría como deuda a los dos encabezados
plegables (`App.tsx:652`, `PiecePalette.tsx:80`), que están bien: `aria-pressed` dice que un control
está **hundido**, y `aria-expanded` que la región que controla está **abierta**. Un botón que muestra y
esconde otra cosa es lo segundo.

Todos consultan por **rol y nombre**, nunca por `className`: preguntarle al árbol de accesibilidad es
la diferencia entre verificar accesibilidad y verificar que se escribió un atributo. Ojo con
`getByRole`, que empareja el nombre por **subcadena** — los nombres van anclados con regex—.

## El foco se mueve por regiones, no por controles

Lo que el 025 midió en el árbol de accesibilidad, el spec 026 lo midió en el teclado: **cero**
`tabIndex`, **cero** `role` y **cero** estilo de foco en todo `src/`. El caso caro es el tablero —una
celda es un `div` con `onClick`, así que no recibe foco ni lo anuncia nadie— y desde el spec 014 eso
dejó de ser un hueco de *lectura*: quitar una pieza y mutearla **sólo existen ahí**, o sea que hay una
operación destructiva sin ninguna otra vía y sin deshacer
([#47](https://github.com/federicohermo/pentomino-games/issues/47)).

- **Una región compuesta es UNA parada de tabulación, y adentro se mueve con las flechas.** Es el
  *roving tabindex*: el elemento activo lleva `tabIndex={0}` y todos sus hermanos `-1`, así que el
  `Tab` entra a la región y no a cada uno de sus miembros. Las celdas del tablero no son una parada
  cada una — eran sesenta cuando el spec 026 midió esta tabla, y desde el 031 son **hasta 390**:

  | | una parada por celda | **1 parada + flechas** |
  |---|---|---|
  | `Tab` para cruzar el tablero | 60 pulsaciones (390 hoy) | 1 |
  | `Tab` para salir hacia lo que sigue | 60 pulsaciones (390 hoy) | 1 |
  | Patrón ARIA | ninguno lo recomienda | es el patrón `grid` |
  | Coherente con el gesto que ya existe | no | sí — el mouse también se mueve *dentro* del tablero |

  Una parada por celda convierte al tablero en una **trampa de salida**. Y no en el camino al
  transporte —`TransportPanel` se compone adentro de `PiecePalette` y la paleta va antes que el
  tablero en el DOM, así que a Play se llega sin pasar por ninguna celda—: la trampa es la de
  **después**, con todo lo que venga detrás del tablero a esa cantidad de pulsaciones y el
  `Shift`+`Tab` de vuelta costando lo mismo. **Y el otro extremo también es una falla**: si NINGUNA
  celda lleva el `0`, el tablero se cae del orden de tabulación entero — ver el cursor acotado a
  `dims`, abajo.

- **El estado del cursor vive en el shell, y el cursor de teclado es el mismo que el del mouse.**
  `App.tsx` ya tiene `hover: Cell | null`, y de ahí salen el fantasma, el cursor (`pointer` /
  `not-allowed`) y la decisión de si el click edita o coloca. Mover el foco con una flecha escribe
  **ese mismo estado**, así que el fantasma, la nota y la validez funcionan con teclado sin una línea
  nueva de dibujo — y no aparece un segundo «dónde está apuntando» que pueda desincronizarse del
  primero. Es la misma razón por la que `hoverEdita` le llega calculado a `Board` en vez de derivarse
  ahí: dos copias de dónde está el cursor son dos formas de que prometa una cosa y el gesto haga otra.

  **Y desde el spec 031 lo que se dibuja no es `hover` sino `cursor`, que es `hover` acotado a `dims`.**
  El tablero cambia de tamaño solo y ni el mouse ni el foco se enteran de un `resize`, así que el par
  guardado puede quedar apuntando a una celda que ya no existe — y eso no es inofensivo: `Board` ancla
  el roving tabindex ahí, o sea que un cursor colgado deja al tablero **sin ninguna** `tabIndex={0}` y
  fuera del orden de tabulación. Es el mismo corte que `visibles`/`placed` hace con las piezas, sobre
  el otro estado que lleva coordenadas de tablero adentro. La regla que generaliza: **cuando una
  constante pasa a ser un parámetro, hay que enumerar todo el estado que la tenía embebida.**

- **El anillo de foco va en la caja de afuera, y son dos propiedades y no una.** Una celda son dos
  cajas —la de `--cell` y la baldosa redondeada de adentro, con un aire de `2/73` de la celda—, y los canales de la
  baldosa están todos tomados: el fondo es identidad, el blanco es el muteo, el rosa es la jugada
  inválida, el gris es el fantasma, el grosor de borde es la cabeza lectora y la opacidad es el velo.
  La caja de afuera no pinta nada, así que ahí va el foco. Y van **dos** tonos —claro adentro, oscuro
  afuera— porque abajo puede haber `#FFFF00` (la `V`) o `#0000FF` (la `W`) y un `outline` de CSS tiene
  un solo color: `outline` para el claro y `box-shadow` con spread para el oscuro. Ver
  [DESIGN.md](../../DESIGN.md).

- **Lo prohibido es `transform: scale`**, y el repo ya lo midió: el docblock de
  `components/constants/playhead.constants.ts` lo dice para la cabeza lectora —«`scale` AGRANDA la caja
  a efectos de overflow y `box-shadow` es *ink overflow*: pinta afuera sin agrandar nada»—, y cuando se
  midió el síntoma eran las dos barras del `overflow-x-auto` de `Board`, con el `scrollHeight` pasando
  de 378 a 381. Desde el spec 031 ese contenedor no scrollea y quien recorta es el `overflow-hidden`
  del raíz, así que el síntoma cambió —una celda cortada en el borde en vez de una barra— pero el
  mecanismo no. El anillo de foco es exactamente el mismo caso.

Con esto queda cerrado el `T025` de Seguimiento del spec 025, que quedó esperando este modelo: su
tercera cláusula descartó `radiogroup` para el grupo de orientación porque «obliga a un modelo de foco
—una sola parada de tabulación y flechas para moverse dentro— y ese modelo lo fija el spec 026». El
modelo está escrito acá y vale para **toda** región compuesta, así que ese grupo puede pasar a
`radiogroup` sin volver a decidirlo — y mientras no pase, su `role="group"` con `aria-pressed` sigue
siendo lo correcto.

## Los listeners de entrada

El spec 013 fue el primero que agregó uno —hasta ahí el único `addEventListener` de `src/` era un
`matchMedia` en `Spectrum.tsx`—, así que la regla la escribió él y la próxima se copia de esta.

- **El listener global vive en un hook de `components/`, en un efecto propio** —`use-input.ts` desde
  el spec 022—, y el componente sobre el que escucha no gana ni estado ni efectos. El shell es quien
  tiene los setters, así que el hook recibe **callbacks y no setters**: así cambiar la forma del estado
  es cambiar el shell y no el hook.
- **Las dependencias del efecto son las reales.** Un `[]` con un ref del estado para suscribir una sola
  vez es la optimización que este repo no necesita —son dos `addEventListener` sobre `window`— y
  esconde de dónde sale cada valor. Si el handler no lee ningún valor (setter funcional), ahí sí `[]`.
  La **única** excepción la abrió el spec 020, y sólo porque la cardinalidad de suscripción es un AC
  ajeno: `alRotar` tiene que leer cuál es la pieza en la mano y el AC16 del 022 le prohíbe re-suscribir
  el `wheel`, así que va por `selectedRef`. Lo que la vuelve legítima no es el ref sino su escritor —un
  `elegirPieza` que es el **único** que toca `selected`, así que el ref no se puede desincronizar por
  construcción— y que ese ref **no se escribe en el render**, que es la forma obvia y la que
  `react-hooks` rechaza («Cannot access refs during render»). Ver la nota de revisión del 020:
  https://github.com/federicohermo/pentomino-games/issues/82.
- **Con callbacks, la cardinalidad de suscripción pasa a decidirse en el shell.** Los callbacks del
  teclado se memoizan con sus dependencias reales —desde el 020 es `[orientar, selected]`, porque el
  cambio se calcula adentro del setter funcional sobre la ranura anterior y ya no hace falta leer la
  orientación— para que el efecto se re-suscriba cuando cambia la pieza en la mano, y el de la rueda
  con `[]` para que su listener se registre una sola vez por montaje. Y un objeto de acciones armado inline **no puede entrar crudo** al array de
  dependencias del efecto: tiene identidad nueva por render, así que el hook se re-suscribiría por
  render y no por cambio de estado — peor que antes, y sin que nada falle. El hook lo desarma y lista
  sus campos.
- **Un ref compartido entre dos hooks entra por parámetro a los dos.** `tapLimpio` lo lee el teclado y
  lo escriben los dos; vive en el shell, que es quien los compone. Meterlo adentro del hook que lo lee
  deja al otro sin forma de escribirlo, y ahí vuelve el bug de `Ctrl`+rueda del spec 013 sin que falle
  un solo test.
- **La DECISIÓN del gesto se extrae como pura a `components/`**, recibiendo los campos del evento que
  importan y no el evento. En un `.tsx` no se puede ni exportar, y como pura corre en el proyecto
  `node` —sin navegador, sin fabricar un `KeyboardEvent`— que es donde la decisión se verifica barata y
  exhaustiva. El precedente son `input.ts`, `cell-text.ts`, `route-source.ts` y `engine-bridge.ts`.
  Lo que queda en el hook es cableado, y desde el spec 029 **eso también tiene test**: el proyecto de
  navegador monta el hook con `renderHook` y dispara eventos de verdad. Que el cableado sea verificable
  no derogó la regla —una pura sigue siendo más barata de agotar que un evento sintético—, sacó su
  excusa.
- **`wheel` no puede ir por prop de JSX si hace falta `preventDefault`.** React registra sus listeners
  en el contenedor raíz y a `touchstart`, `touchmove` y `wheel` los registra **pasivos** (react-dom
  19.1.1), donde `preventDefault()` es un no-op que el navegador solo avisa por consola. Va por
  `addEventListener(nodo, 'wheel', h, { passive: false })` —hoy en `useRuedaRota`— con el nodo por un
  `ref` creado en `App.tsx`, que es quien compone los hooks. Es la falla más cara posible: el handler
  corre, así que parece que anda.
- **El handler global se saltea `<button>` e `<input>`**: si se saltea el evento, el navegador tiene
  que quedárselo entero — es lo que evita el doble disparo con un control enfocado sin recurrir a un
  `blur()` a mano. **Una celda del tablero es el caso intermedio y va por su propia pregunta**: se
  lleva la barra, el `Enter` y las flechas, y deja pasar todo lo demás. Ensanchar la guarda vieja
  apagaría también `Shift` y `Ctrl` justo donde más se usan.
- **«¿Hay acción?» y «¿hay que frenar el default?» son dos preguntas y van en dos puras.** Parecen la
  misma hasta que aparece el auto-repeat: la barra mantenida **no** tiene que alternar el transporte a
  30 Hz, pero **sí** tiene que seguir frenando el scroll, porque cada `keydown` repetido trae su propio
  default. Atado a «hay acción», un tap largo arrancaba el transporte una vez y después scrolleaba la
  página.
- **Limpieza sincrónica en el retorno del efecto, para todos los listeners que registró.** StrictMode
  monta dos veces en dev: sin el `removeEventListener` quedan dos.

Detalle en [docs/guides/conventions.md](../../docs/guides/conventions.md).
