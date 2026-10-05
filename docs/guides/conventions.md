# Convenciones de Código

## Organización de `src/`

### La dirección de dependencia

`src/` son cuatro capas con **una sola dirección**:

```text
types/ ← constants/ ← módulos              types/ no importa nada de afuera de types/
transform.ts ← board.ts                    domain/ no importa nada de fuera de domain/
             ← music.ts ← invariants.ts    audio/  no importa nada de fuera de audio/
                                           components/ y App.tsx importan de las dos
```

`domain/` y `audio/` son **hermanos sin aristas entre ellos**: el motor habla números MIDI y no sabe
qué es un pentominó.

**La verifica el linter, no la revisión.** Desde el spec 030 la verifica por **ruta**:
`import-x/no-restricted-paths` con una zona por arista prohibida, todas en una sola regla y no en un
override por capa. Agregar a mano un import prohibido falla `pnpm lint` con el mensaje de la zona;
está probado desde un módulo y desde un test.

**Y dejó de ser una red.** Hasta el 030 se prohibía el *string* del import, así que los patrones tenían
que llevar `../` y `../../` —porque `types/`, `constants/` y `__tests__/` están un nivel más abajo que
los módulos— y un `domain/sub/x.ts` nuevo habría quedado sin cubrir hasta que alguien agregara el
patrón. Las zonas resuelven la ruta contra el filesystem: la carpeta nueva queda cubierta sola.

**Lo que sigue en `no-restricted-imports` son los paquetes**, porque un paquete de npm no tiene ruta en
el repo: React para `domain/` y `audio/`, y los de estado global para todo `src/`. Ahí sí se usa la
variante de `typescript-eslint` y no la core, porque también ve los `import type`, que son justo los que
un refactor descuidado usaría para colarse.

**Adentro de `domain/` también hay dirección, y desde el cierre de los seguimientos del 009 también la
verifica el linter.** Era la única del repo que vivía sólo como dibujo en `CLAUDE.md`: las cuatro capas
tenían su override, pero un `board.ts` importando `sequence.ts` pasaba el lint sin decir nada.
`DOMAIN_INTERNO` en `eslint.config.js` la escribe módulo por módulo, en tres niveles —`transform.ts`
abajo; `board.ts` y `music.ts` encima de ella y **sin conocerse entre sí**, porque que las reglas del
tablero y el modelo musical sean ortogonales es una propiedad del instrumento; `sequence.ts` e
`invariants.ts` como hojas que no se importan entre sí—. Desde el 030 esas cinco filas se expanden a
cinco **zonas** de la misma regla, así que el trap de flat config —el override más específico reemplaza
al anterior en vez de sumarse, y sin repetir los patrones de la capa `board.ts` habría quedado libre de
importar React— ya no aplica acá: no hay override que pisar. Donde sí sigue aplicando es en los dos
bloques de `no-restricted-imports` que quedaron, y por eso los grupos son constantes con nombre
(`GRUPO_ESTADO`, `GRUPO_REACT`) y no listas escritas dos veces.

El efecto más importante es indirecto: `voice.ts` y `scheduler.ts` reciben el `AudioContext` por
parámetro y **no pueden** tocar el singleton, porque vive en `engine.ts` y ellos no lo importan. El
invariante que antes sostenía un comentario ahora lo sostiene el grafo de imports — y es lo que hace
testeable al audio.

### Cada rol tiene su carpeta

**Los módulos contienen comportamiento; los datos, los tipos y los valores fijos viven en la carpeta de
su rol.** Un `.ts` de capa tiene funciones y nada más. El archivo repite el nombre del módulo con el
sufijo del rol: `Cell` no es `types/index.ts`, es `domain/types/transform.types.ts`, el contrato del
módulo `transform.ts`.

| Rol | Carpeta | Archivo |
|---|---|---|
| lógica de un concern | la capa | `<módulo>.ts` |
| tipo que cruza un límite | `<capa>/types/` | `<módulo>.types.ts` |
| dato o valor fijo | `<capa>/constants/` | `<módulo>.constants.ts` |
| test de un módulo | `<capa>/__tests__/` | `<módulo>.test.ts` |
| helper de test | `<capa>/__tests__/` | nombre descriptivo |
| componente | `components/` | `PascalCase.tsx`, único export |
| hook que cablea un módulo | al lado del módulo | `use-<módulo>.ts` |
| hook sin módulo propio | `<capa>/hooks/` | `useCamelCase.ts` |
| validación de datos externos | `<capa>/schemas/` | `<módulo>.schema.ts` |
| helper interno de un módulo | `<capa>/utils/` | `<módulo>.utils.ts` |
| helper genérico sin dominio | `src/lib/` | `<tema>.ts` |

**Los módulos no declaran constantes.** Si aparece un literal con significado, va a `constants/`. Los
únicos números que quedan en un módulo son los que no tienen nombre posible: un `+ 1` de índice, un
`% 12` que es la aritmética de las clases de altura, el `440`/`69` que *define* el anclaje MIDI.

**Lo verifica el linter en `domain/` y en `audio/`, y no en `components/`** (spec 030). La línea es la
del motivo, que está en el párrafo siguiente: lo que hizo daño fue un valor escrito en dos lugares, y
una constante privada de un solo componente no puede desincronizarse con nada.

Cuando el 030 lo midió, las siete de `components/` vivían en los `.tsx` —`BAR_COUNT`, `GAP`, `MIN_BAR`
e `IDLE_TEXT` en `Spectrum.tsx`; `BORDE_COLOR`, `VELO_CAJA` y `VELO_TAPA` en `Playhead.tsx`— y el
argumento para dejarlas ahí era que sus docblocks explican el **mecanismo** de dibujo y no el valor.
**Hoy no queda ninguna**: el spec 029 sacó los dos bucles a `.ts`, eso las dejó en módulos de capa
—donde la regla escrita sí aplicaba— y se mudaron a `components/constants/` con los docblocks enteros.
El alcance del linter no cambia por eso; lo que cambia es que el ejemplo ya no sostiene la parte
estética del argumento: mudarlas no alejó ninguna explicación de su código. Lo que sostiene la línea
es lo medible — una privada no se desincroniza con nada. El selector tampoco mira `ObjectExpression`,
por lo que el spec 022 ya dejó escrito sobre `MOTOR` y `RUTA_VACIA`: son cableado de funciones, no
valores fijos.

El motivo es medible, no estético: antes de la separación había cuatro pares de números que tenían que
coincidir y nada sincronizaba — el `0.35` de `NOTE_DUR` estaba también como default de `scheduleVoice`,
el `110` del tempo estaba en la UI y en el motor, y el tamaño de celda convivía con un `w-7 h-7` que
tenía que valer lo mismo.

De ese ejemplo ya no queda ninguno de los dos símbolos: el spec 008 reemplazó `NOTE_DUR` por
`NOTE_INTERVALS` —que se mide en intervalos y no en segundos— y le sacó el default a `scheduleVoice`,
porque una duración que depende del tempo no puede tener un valor por defecto que no lo mire.

Las `Props` de cada componente son la excepción: se quedan **inline y sin exportar**, porque
`react-refresh/only-export-components` obliga a que el componente sea el único export del `.tsx`.

**Un hook que cablea un módulo va al lado de ese módulo y no a `hooks/`.** El spec 022 sacó los seis
efectos del shell y los partió en dos pares: `engine-bridge.ts` con las puras y `use-engine.ts` con los cuatro
efectos que las llaman, y `input.ts` con las puras de entrada y `use-input.ts` con los dos efectos que
las cablean. El nombre en kebab-case y la adyacencia son lo que hace visible el par —la decisión vive en
el archivo sin `use-`, el cableado en el que lo tiene—, y mandarlos a `components/hooks/` habría partido
cada par en dos carpetas por una convención de nombre. `hooks/` sigue reservado para un hook que **no**
tenga un módulo del que sea el cableado.

**Las carpetas de rol se crean cuando tienen su primer archivo.** Hoy no hay `hooks/`, `utils/`,
`schemas/` ni `lib/`: estarían vacías.

<a id="tabla-de-crecimiento"></a>

| Cuando aparezca… | Va a |
|---|---|
| un segundo concern de CSS (tokens `@theme`, capa base) | `styles/theme.css` + `styles/base.css`, importados por `styles/index.css` |
| tests que no mapean 1:1 a un módulo (e2e, smoke, visual) | `tests/` en la raíz, fuera de `src/` |
| un helper de test compartido **entre capas** | `src/testing/` |
| validación de datos externos (persistir, compartir por URL) | `<capa>/schemas/` + zod — **decisión con spec propio** |
| un asset importado desde código | `src/assets/` |
| un provider o un router | `src/app/`, con `App.tsx` adentro |
| una segunda pantalla o modo | recién ahí `src/features/` tiene sentido |
| estado que necesitan dos ramas del árbol | subir el estado, o un hook con propósito específico en `<capa>/hooks/` — **no** un store global |

### Sin barrels, con extensión, sin alias

- **Ningún `index.ts` de re-exportación.** `export * from './x'` hace cargar archivos de más y vuelve al
  módulo responsable de propagar esas re-exportaciones por HMR. Cada import apunta al módulo concreto.
  **Desde el spec 049 el linter verifica el `export *`** —un selector de `ExportAllDeclaration` a secas,
  que es lo que la regla de la extensión de acá abajo **no** veía: `export * from './x.ts'` la cumple—.
  Lo que el linter **no** verifica es el nombre del archivo, y es una decisión con número: los tres
  `index.ts` del repo —`mcp-server/src/index.ts`, `resources/index.ts` y `tools/index.ts`— son un
  entrypoint y dos registros que arman un `readonly [...]`, no barrels. «De re-exportación» un selector
  no lo evalúa, así que prohibir el nombre daría tres falsos positivos. Queda afuera el barrel que
  re-exporta a mano (`export { a } from './a.ts'`), y se declara: media red escrita como media red es
  honesta.
- **Extensión explícita en todo import local**: `./domain/transform.ts`, no `./domain/transform`.
  Reduce operaciones de resolución, y sobre todo **node crudo la exige** (`ERR_MODULE_NOT_FOUND`), que
  es lo que permite cargar `domain/` sin compilar. Ojo: omitirla **no rompe la app** —Vite resuelve
  igual—, así que el error sería invisible del lado del navegador. **Desde el spec 030 la verifica el
  linter** (`no-restricted-syntax`), sobre todo `src/` y `mcp-server/` y en las cuatro formas de
  nombrar un módulo: `import`, `import()`, `export … from` y `export * from`. Ojo con lo que esa
  enumeración dice y lo que no: son las cuatro formas en las que se verifica **la extensión**, no el
  barrel — el `export * from` está ahí porque también lleva una ruta. Antes del 030 el único
  que la ejercía era el MCP server del 006, que carga `src/` con node crudo — `pnpm mcp:test` sigue
  fallando al primer import sin extensión, pero ahora es la segunda red y no la única, y solo ve lo
  que el server importa.
- **Sin alias de paths** (`@/domain/…`). La profundidad máxima es uno, así que el beneficio es
  cosmético, y node no conoce los alias de Vite.
- **Un componente por archivo**, y ningún export que no sea el componente en un `.tsx`. No es
  preferencia estilística: es lo que el lint ya exige, y la granularidad de Fast Refresh es el módulo.

## TypeScript

### Nada de `any`

**Cero `any` y cero `@ts-ignore` en el repo.** No es aspiracional: es el estado actual.

Los tres que hubo desaparecieron sin que nadie los atacara de frente. Dos estaban alrededor de la
gestión de loops y se fueron cuando esa lógica se volvió declarativa; el tercero era el `synth` de
Tone, con su `@ts-ignore` por los tipos de constructor genérico, y se fue con Tone.

Los tres estaban tapando un problema de diseño, no de tipos. **Si aparece la tentación de uno nuevo,
sospechar del diseño antes que de TypeScript.**

Su contraparte en el linter es `noInlineConfig`: **no hay `eslint-disable` en el repo**, porque
silenciar la regla es la otra forma de tapar el problema. Si hace falta una excepción real, va como
**override por archivo** en `eslint.config.js` —que se ve en el diff y se explica— y no como un
comentario suelto.

### La aserción no nula (`!`) es de la misma familia

Un `!` es un `any` chiquito: le dice al compilador que se calle **sin darle un motivo**. El spec 027
la nombró y el 032 la convirtió en gate — `@typescript-eslint/no-non-null-assertion` en `error`.

**Antes de escribir una, probar el `const`.** El `!` que había en `audio/engine.ts` existía sólo
porque TypeScript pierde el estrechamiento al entrar al closure de un `forEach` cuando la variable es
un `let` de módulo; salió gratis con una `const` local, sin discutir con el compilador.

En producción quedan **tres**, y las tres viven como override por archivo en `eslint.config.js` con
el motivo escrito al lado:

| Archivo | Por qué el compilador no puede verlo |
|---|---|
| `src/main.tsx` | El idiom de Vite sobre un `#root` que el propio `index.html` garantiza |
| `src/domain/invariants.ts` | El `queue.shift()!` de un BFS, dentro de un `while` que ya garantiza la cola no vacía |
| `src/components/Board.tsx` | El ancestro `[role="grid"]` existe por construcción: el handler vive en un descendiente de esa grilla. El `if` alternativo sería una rama inalcanzable, y el umbral 100 no deja cubrirla |

**En los tests no vale**, y la regla está apagada ahí: el `!` sobre un `find` o un `querySelector` que
el propio test acaba de fijar es la forma de que el test **falle** si el nodo no está. Son 102, en 100
líneas, y son deliberadas.

Esa lista de overrides es ahora la **única fuente** del número. Mientras vivió en la prosa de
`CLAUDE.md` se desincronizó dos veces: decía «dos» cuando eran tres, y «66» cuando eran 102. Y el
número **se escribe junto con la regla que lo produce**, porque sin ella no se reproduce — se cuenta
por *ocurrencia*, corriendo la regla con sus tres overrides apagados; por línea da 100, porque hay dos
líneas con dos `!`.

### Nada de saltear una rama de coverage

El corolario del umbral 100, que hasta el spec 032 era prosa y ahora lo verifica `no-warning-comments`
con los tres términos de los proveedores de coverage y `location: 'anywhere'`.

Si una rama parece inalcanzable, la salida es **borrarla o volverla alcanzable**, nunca pedirle al
proveedor que la saltee: un umbral con escapes es un umbral más bajo y sin dueño, que es exactamente
el argumento con el que el 029 rechazó el 95.

**La regla mira texto y no sintaxis, y eso tiene un precio que se paga una vez:** deletrear uno de los
términos *para explicar por qué no usarlo* la viola igual. Por eso los tres términos literales viven
en `eslint.config.js` y en ningún comentario del repo — `vite.config.ts`, `specStatus.ts` y
`specWrite.ts` los escribían los tres, y los tres se reescribieron nombrando el mecanismo en vez del
término.

### Tipos de dominio

```ts
// domain/types/transform.types.ts
export type Cell = [number, number];       // [x, y], y crece hacia abajo
// domain/types/pieces.types.ts
export type PieceKey = 'F' | 'I' | … ;     // declarado explícito, no derivado
```

`PieceKey` se declara a mano y `BASE_MAP` se tipa `Record<PieceKey, number>`, no al revés: el tipo de
las piezas sale de la geometría y no de la tabla musical, y **agregar una pieza sin darle tónica es un
error de compilación**. Antes se derivaba de `keyof typeof BASE_MAP` y ese caso pasaba en silencio.

### Nada de `enum`

**No hay ninguno en el repo, y no puede haberlo**: `tsconfig.app.json` tiene `erasableSyntaxOnly: true`,
que los rechaza con `TS1294`. No es una restricción a levantar — es la misma opción que garantiza que
el código sea *type-strippable*, o sea lo que permite que node cargue `src/domain/` sin compilar. Un
`enum` emite código en runtime, por eso queda afuera.

El reemplazo para cualquier conjunto cerrado reparte sus dos mitades en las carpetas de rol:

El ejemplo no es hipotético: es el conjunto cerrado que el spec 020 estrenó para la rotación.

```ts
// components/constants/orientation.constants.ts  — el valor
export const ROTACION = { cero: 0, noventa: 1, ciento_ochenta: 2, doscientos_setenta: 3 } as const;
// components/types/orientation.types.ts          — el tipo
export type Rotacion = (typeof ROTACION)[keyof typeof ROTACION];
```

Los otros tres del repo son `ACCION` y `EDICION` (`components/constants/input.constants.ts`), `MARCA`
(`route.constants.ts`) y `REGIMEN` (`domain/constants/music.constants.ts`).

### El idioma de los identificadores

**Inglés para el vocabulario técnico universal, español para el vocabulario del instrumento.** Es
**descriptiva**: sale de mirar lo que el repo ya escribió, no es un mandato nuevo, y **no se renombra
nada** hacia atrás. Aplicarla hacia atrás sería un churn que ningún test atrapa.

Inglés cuando el nombre existiría igual en cualquier repo: `rotate90`, `normalize`, `reflect`,
`midiFor`, `buildSequence`, `setBpm`, `clockRunning`, `offset`, `notes`. Es el vocabulario del dominio
técnico —geometría, MIDI, Web Audio, React— y traducirlo agrega un salto mental por cada lectura.

Español cuando el nombre nombra algo de **este** instrumento, o un rol que sólo existe acá: `puertas`,
`regimen`, `velo`, `tapLimpio`, `celdas`, `marcas`, `encolar`, `rutaActiva`, `proyectarAlMotor`,
`accionDeTecla`, `MotorDeTransporte`. Acá el inglés sería una traducción de algo que se piensa en
español —los comentarios, los commits y los specs están en español—, y la traducción se pierde: nadie
llamaría `gates` a las puertas de una pieza dos veces igual.

El caso de borde que decide la regla es el **rol**: `MotorDeTransporte` no replica
`startClock`/`stopClock`/`clockRunning` porque el tipo describe lo que su consumidor necesita y no la API
del motor. Si el nombre viene de afuera, va en el idioma de afuera; si lo inventa este repo, va en
español.

## Geometría

### El orden del array es un invariante

`rotate90`, `normalize` y `reflect` (en `domain/transform.ts`) son `map` sobre las celdas: **la celda
del índice `k` sigue siendo la misma celda lógica después de transformar.**

De eso depende `ANCHOR_INDEX`, que guarda la celda de agarre como índice en vez de coordenada; de eso
depende el mapeo celda↔nota que `degreeByCellIndex` calcula sobre la forma canónica y arrastra por
índice (spec 007); y de eso dependen las puertas del recorrido, que leen la celda del paso 0 y la del
paso 4 por índice sobre `PlacedPiece.cells` (specs 009 y 010). Cualquier cambio que filtre, ordene o reagrupe
celdas dentro de esas funciones rompe la colocación de piezas **en silencio**.

Hoy hay una red: `checkArrayOrder()` de `domain/invariants.ts` lo verifica sobre las 96 combinaciones, y
su propio test comprueba que el chequeo **da rojo** cuando una transformación reordena.

Si hace falta transformar celdas de otra forma, escribir una función nueva en vez de modificar estas.

### `y` crece hacia abajo

Las coordenadas son de grilla, no cartesianas: `y` es el índice de fila. Consecuencia práctica: cualquier
cálculo angular (`Math.atan2(dy, dx)`) recorre el círculo en sentido **horario** en pantalla. No está
mal, pero es la clase de cosa que alguien "arregla" por error.

## Estado

- **Sin estado global.** No hay Context, Redux ni Zustand. Todo es `useState` local en `App`. Desde
  el spec 030 lo verifica el linter y por **dos** caminos, porque uno solo no alcanza: el paquete
  —Redux, Zustand y compañía, con `no-restricted-imports`— y la **llamada** a `createContext`, que es
  la mitad que el paquete no ataja: importar `react` en `components/` es legítimo, así que lo que hay
  que prohibir ahí es la llamada y no el import.
- **Lo que no es estado de UI, no va en estado.** El contador de ids vive en un `useRef` porque
  cambiarlo no debe re-renderizar. El `AudioContext` y la secuencia del motor —la activa y la
  pendiente— viven en singletons de módulo porque hay uno por pestaña, no uno por componente.
- **Nunca mutar objetos ya entregados a React.** Es literalmente el bug que tuvieron los loops:
  `newPiece._sched = id` después de `setPlaced(prev => [...prev, newPiece])`. Si un dato tiene que
  cambiar después, o va en el estado con su propio `set`, o va afuera de React.
- **Identidad estable para elementos removibles.** `PlacedPiece.id` existe para eso; las `key` de listas
  usan el id, nunca el índice.

## Efectos

Los efectos **reconcilian**, no ejecutan comandos. El efecto de audio observa `[secuencia, placed]` y le
entrega al motor la secuencia entera con `setSequence`. Los handlers solo cambian estado.

**Y un `.tsx` no declara la lógica de un efecto: a lo sumo monta un módulo en una línea.** El motivo es
el mismo por el que salieron el audio y el dominio: `react-refresh/only-export-components` prohíbe que
un `.tsx` exporte algo además del componente, así que la lógica de un efecto escrita ahí no se puede
exportar y por lo tanto no se puede verificar. Lo que se queda en el shell es la **derivación** —los
`useMemo`— y los callbacks: el hook recibe el resultado, no la regla.

**Desde el spec 049 lo verifica el linter** (`no-restricted-syntax` sobre `src/**/*.tsx`), y hasta
entonces esta sección decía dos cosas falsas —«los seis del repo» y «no viven en el `.tsx`»—, que es
justo lo que pasa con una regla que nadie verifica. Los números de hoy, contados:

- **Diez efectos de producción.** Ocho en cuatro hooks de `components/` —cuatro de reconciliación en
  `use-engine.ts` y dos de entrada en `use-input.ts` desde el spec 022, el que mide el viewport en
  `use-grid.ts` desde el 021, que es un `useLayoutEffect`, y el del arrastre de los flotantes en
  `use-drag.ts` desde el 052— y **dos en un `.tsx`**, `Playhead.tsx` y
  `Spectrum.tsx`. `App.tsx` no declara ninguno, que es lo que `CLAUDE.md` afirma.
- **Esos dos son las únicas exenciones, y están nombradas archivo por archivo** en `eslint.config.js`,
  no por glob — el precedente son las tres aserciones no nulas. Cumplen el motivo y violan la letra:
  son de **una línea** y delegan en `iniciarCabeza` e `iniciarEspectro`, que viven fuera del `.tsx` y sí
  están testeados. Si alguno crece, la exención deja de aplicar por su propio argumento, y el linter no
  mide líneas: por eso el motivo está escrito arriba del override.
- **La regla nombra los dos hooks**, `useEffect` y `useLayoutEffect`. `use-grid.ts` usa el segundo a
  propósito (spec 021), así que anclarla sólo en el primero dejaba pasar la misma lógica con el otro
  nombre.
- **`src/**/__tests__/` queda afuera**, y por decisión escrita: la prohibición es sobre la capa de
  componentes, no sobre lo que la monta. Un harness que monte un componente con efecto es legítimo.

`playing` **no** está en las dependencias: la secuencia es función del tablero y no del transporte, y
quien corta o arranca el sonido es `togglePlay` con `alternarTransporte`.

Que reemplazar la secuencia entera sea aceptable no es casualidad, es una propiedad del diseño: la
secuencia es un **dato puro** que `tick()` lee, y el reloj es un origen que el efecto no toca —
`setSequence` ni siquiera la pone en vigencia, la deja **pendiente** hasta que el ciclo activo cierre
(D5 del spec 009). Con Tone, donde cada loop era un evento con identidad, el mismo patrón habría
reiniciado la fase de todos, y perder su ID dejaba loops huérfanos.

Hoy **ningún efecto del repo hace trabajo asincrónico**, así que no hay flag de cancelación en ningún
lado. Si vuelve a hacer falta, el patrón es el de siempre (`let cancelled = false` capturado en el
closure, chequeado después del `await`, seteado en la limpieza).

Y ojo con las limpiezas asincrónicas: en StrictMode pueden correr **después** del siguiente efecto. Si
la limpieza tiene que ganarle al re-montaje, tiene que ser sincrónica — es el caso del efecto de
desmontaje de `use-engine.ts`, que llama a `stopClock()` y entrega una secuencia vacía con
`setSequence()`. Ver
[audio.md](../architecture/audio.md#reconciliación-de-loops).

## Tests

### Nada de `.only` ni `.skip`, ni un test sin una sola aserción

Es la misma familia de bug que el `--filter "{.}"` y el `$` del regex de `verify`: **fallar en
verde**. Un `.only` olvidado deja pasar la suite entera sin que nada avise, y un test sin `expect` es
un archivo que suma al conteo y no verifica nada.

Desde el spec 030 lo verifica el linter, y hace falta **una regla por runner** porque ninguna de las
dos alcanza al otro:

| Dónde | Quién lo caza |
|---|---|
| `src/**/__tests__/`, `__tests__/`, `docs/__tests__/`, `specs/__tests__/` y `.claude/scripts/__tests__/` | `@vitest/eslint-plugin` — `no-focused-tests` (con `fixable: false`, para que `--fix` no borre el `.only` en silencio), `no-disabled-tests` y `expect-expect` |
| `mcp-server/**/__tests__/` | un selector de `no-restricted-syntax`: ahí corre `node --test` y el plugin de Vitest no lo mira |

**El test sin una sola aserción queda afuera en `mcp-server/`, y es a propósito:** con `node:test` no
hay un `expect` que contar, así que no tiene equivalente barato. Y antes del selector un `.skip` ahí
fallaba igual, pero **por accidente** —lo cazaba `no-floating-promises`, porque `allowForKnownSafeCalls`
nombra `test`/`describe`/`it` y no sus miembros—, o sea que el mensaje hablaba de promesas sin esperar
y no del motivo, y bastaba un `void` para silenciarlo sin que nada dijera nada.

## Comentarios

**Los comentarios explican el porqué, no el qué.** El código dice qué hace; el comentario existe para lo
que no se puede leer del código: una decisión, una restricción, un bug evitado.

La formulación es de Ousterhout y es más operable que la nuestra: **un comentario tiene que estar en un
nivel de abstracción DISTINTO del código.** De ahí sale su red flag *«Comment Repeats Code»*, y el motivo
para preferirla es práctico: «¿esto es un porqué?» se contesta que sí casi siempre, y **«¿esto está en
otro nivel que el código?» se contesta mirando**. `// normalized` arriba de `return c` falla la segunda
pregunta sin discusión.

Bien:

```ts
// Se guarda como índice dentro de SHAPES[pieza] en vez de como coordenada porque
// rotar, reflejar y normalizar mapean cada celda preservando el orden del array.
const ANCHOR_INDEX: Record<PieceKey, number> = { … };
```

Mal:

```ts
// Mapea cada pieza a un índice
const ANCHOR_INDEX: Record<PieceKey, number> = { … };
```

Los comentarios de este repo están **en español**, igual que los mensajes de commit y los specs.

### Lo que se verifica es la exactitud, y no la longitud

Éste es el criterio que ordena la sección entera, y hasta el spec 051 no estaba escrito. **El consumidor
principal de los comentarios de este repo es un modelo leyendo el código para cambiarlo**, y para él los
comentarios no se comportan como uno esperaría. Tres mediciones, y las tres empujan para el mismo lado:

- **Sacarlos es caro, y justo en la tarea que se hace acá.** Desactivar los conceptos de comentario en
  las representaciones internas de un modelo degrada la refinación de código **hasta un 90 %** y el
  autocompletado hasta un 15 % ([arXiv:2512.16790](https://arxiv.org/html/2512.16790v1)). Refinar código
  es exactamente lo que se hace en este repo. **La prosa larga es un activo medido.**
- **Que uno mienta cuesta tanto como ofuscar el código.** CodeCrash midió sobre **17 modelos y 1279
  tareas** que el lenguaje natural engañoso —comentarios incluidos— degrada el razonamiento sobre código
  un **23,2 %** de media, y sigue costando **13,8 %** aun razonando paso a paso: tanto daño como
  ofuscar la estructura ([arXiv:2504.14119](https://arxiv.org/html/2504.14119)).
- **El volumen irrelevante desorienta, aunque sea verdadero.** El estudio de *context rot* sobre 18
  modelos nombra la **interferencia por distractores**: contenido semánticamente parecido pero
  irrelevante desorienta activamente. Una crónica de cómo se llegó a algo es literalmente eso — habla
  del código, y es sobre un pasado que ya no rige.

**La conclusión: lo que importa no es cuánto dice un comentario sino que lo que dice siga siendo
cierto.** Un comentario largo y verdadero es barato; uno corto y podrido es caro. Por eso lo que se
verifica ataca la exactitud, y **nada de este repo se acorta por ser largo**.

### Cada cláusula, y quién la verifica

Desde el spec 051 las dos reglas locales de `eslint-rules/` cierran la última convención que seguía
siendo prosa. El detalle operable —para escribir, no para consultar— vive en
[`.claude/rules/comentarios.md`](../../.claude/rules/comentarios.md), que se carga sola al tocar
`src/**` o `mcp-server/src/**`.

| Cláusula | Lo verifica |
|---|---|
| Un comentario no está vacío ni archiva código | `local/comment-shape`, `vacio` y `codigo` |
| Un comentario JSX no reetiqueta el marcado | `local/comment-shape`, `etiqueta` |
| El primer párrafo de un docblock no pasa de 2 líneas | `local/comment-shape`, `resumen` |
| **Una cita tiene que resolver** | `local/comment-anchor`, `muerta` |
| Un comentario no narra historia | `local/comment-anchor`, `historia` |
| El comentario dice el porqué y está en otro nivel que el código | **Nadie: es la parte que un linter no puede evaluar** |

La última fila es el punto de la tabla. Lo que el linter exige no se vuelve a explicar en prosa acá; lo
que no puede evaluar se queda entero, porque ahí la prosa es lo único que hay.

**Una cita tiene que resolver** es la cláusula que la sección no tenía, y viene de darle vuelta una regla
prestada. El repo del que se portó **prohíbe** nombrar un archivo en un comentario, con un argumento que
es bueno allá: sus citas apuntan afuera del repo. Acá se midió antes de decidir —**315 citas, 309
vivas**— y prohibirlas habría sido 98 % ruido. Así que en vez de prohibir la cita se verifica que
resuelva, que caza el modo de falla real: el archivo borrado o renombrado, que
[arXiv:2212.01479](https://arxiv.org/abs/2212.01479) midió sobre más de 3000 proyectos. El caso que lo
motivó acá fue `log.md`, citado **siete** veces —tres en producción— después de que la mudanza de los
specs a Issues lo borrara.

Y no es una preferencia de estilo: **un cambio que deja el comentario inconsistente tiene ~1,5 veces más
probabilidad de terminar en un commit que introduce un bug** que uno consistente, medido sobre 1300
millones de cambios a nivel AST en 1500 sistemas (Wen et al., ICPC 2019). Por eso es un gate y no una
guía.

### El eje del tiempo: restricción vigente contra crónica

«El porqué» tiene dos formas y sólo una envejece bien. **Se queda el comentario que describe una
restricción que HOY hace que el código tenga que ser así. El que cuenta cómo se llegó se muda al
[issue de su spec](https://github.com/federicohermo/pentomino-games/issues) como nota de revisión, y en su lugar queda un puntero de una línea.**

El issue de un spec es donde el lector busca el porqué de ese spec, así que no es una poda: es
mudanza. Fue `specs/revisiones.md` hasta el spec 035, que repartió sus 41 notas —el archivo había
llegado a 89.316 bytes y ya no entraba en un issue, y nadie lo podaba—. El costo de tener la crónica en el código es que el lector tiene que separar, párrafo por
párrafo, la restricción que sigue viva de la historia de cómo se llegó — y la segunda se pudre sola:
cada spec nuevo deja una capa más de «antes esto decía otra cosa».

**Desde el 051 lo marca `local/comment-anchor`, con `historia`.** La regla no decide: señala el
candidato, y separar es un juicio.

Se queda (restricción vigente — el código no puede escribirse de otra forma):

```ts
// El ternario y no `({ offset, note })`: con la forma corta el click mudo sale con la
// clave `note` PRESENTE y en `undefined`, y la ausencia del campo es justo lo que dice
// "celda vacía".
```

Se muda (crónica — cuenta un cambio de opinión, no una restricción de hoy):

```ts
// El plan del spec 009 decía que el ciclo era X. Se cambió DESPUÉS DE ESCUCHARLO, y el
// spec 011 le sacó el síntoma y no el motivo.
```

Tres reglas para aplicarlo sin perder nada:

- **Ante la duda, se queda.** Un comentario de más cuesta una lectura; uno de menos cuesta el
  argumento, y el argumento es lo que este repo tiene de valioso.
- **Si un párrafo mezcla las dos cosas, se parte**: la restricción se queda donde está, la historia se
  muda y deja el puntero.
- **Sin objetivo numérico.** Un porcentaje es un incentivo a borrar el comentario largo, que acá es
  sistemáticamente el bueno.

### Tres chequeos que se evaluaron y se rechazaron

Están acá para que no se vuelvan a proponer. Los tres venían en las reglas portadas, y los tres se
midieron sobre este árbol antes de decidir:

- **Longitud (302 hallazgos) y densidad (49).** Son presupuestos de prosa: chocan con «sin objetivo
  numérico» de arriba y con el 90 % de degradación en refinación. Recortar por número optimiza la
  variable equivocada.
- **El comentario al final de una línea de código (49).** **Se permite**, y es una decisión explícita:
  ancla la explicación al token exacto sin gastar una línea, y ningún benchmark dice que dañe.
  `no-inline-comments` del core de ESLint hace exactamente eso, y además está *frozen* con la
  deprecación ya aceptada y sin reemplazo en `@stylistic`, así que atarse a ella sería comprar el
  trabajo dos veces.
- **Prohibir citar el issue de un spec (10).** Acá el puntero al issue **es** la convención, y la
  escribió el 035.

Corrida verbatim, la regla prestada daba **1007 hallazgos en 92 de 93 archivos**. Un gate que enciende
en rojo el árbol entero no se arregla: se apaga. Con el recorte de arriba quedaron 186, y ninguno es un
desacuerdo de estilo — son una cita que no resuelve, un primer párrafo que baja al cuerpo, o una crónica
que ya tiene adónde mudarse.

## Estilos

Tailwind 4, sin archivo de config. Las utilidades se escriben inline en el JSX. Para lógica condicional
de clases, template literals:

```tsx
className={`border ${occ ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-100'}`}
```

Cuando las ramas pasan de dos, calcular la clase en una variable antes del JSX (como hace el `tone` de
las celdas del tablero) en vez de anidar ternarios.

**Lo que sale de una constante va por estilo inline, no por clase.** Tailwind escanea el fuente: una
clase interpolada (`w-[${CELL_PX}px]`) no se generaría, así que el número volvería a estar escrito dos
veces. Desde el spec 021 las celdas del tablero ya no se dimensionan ni con la constante ni con una
clase: leen la custom property `--cell`, que `components/use-grid.ts` escribe sobre el contenedor
raíz midiendo el viewport. El estilo inline sigue siendo la vía —`width: calc(var(--cell) * 1)`— y el
motivo se sumó uno: una custom property la resuelve el navegador en cada elemento, así que
redimensionar la ventana reposiciona las celdas, el velo y la cabeza lectora **sin un solo re-render de
React**.

## Commits

- En español, imperativo, sin scope de Conventional Commits.
- El cuerpo explica **el porqué y la causa raíz**, no el listado de archivos tocados — eso ya está en el
  diff.
- Los cambios de borrado van en su propio commit, para que revertirlos sea trivial.
