# Verificación

Todo lo que `pnpm verify` hace y por qué tiene la forma que tiene. Es el detalle que
[`CLAUDE.md`](../../CLAUDE.md) resume en cinco líneas: allá vive la afirmación y el número medido,
acá el razonamiento que los produjo.

Nada de esto es preferencia. Cada decisión llegó midiendo, y varias llegaron después de que algo
fallara **en verde** — que es el modo de falla que este documento persigue de punta a punta.

## `pnpm verify` es el nodo de convergencia

Corre `lint ‖ typecheck ‖ suite ‖ mcp:test` en paralelo y es lo que hay que correr antes de un PR.
Medido con caché caliente: **41,2 s en serie contra 23,7 s en paralelo**, y un nodo rojo devuelve
exit 1.

**Y desde el spec 023 no depende de que alguien se acuerde:** `.github/workflows/verify.yml` lo corre
sobre cada `pull_request` y cada push a `main`, con Chromium instalado por el propio workflow.

El workflow corre el **script**, no la lista de nodos, y el porqué está comentado ahí: la forma exacta
de `verify` ya costó dos trampas, y enumerarla en el YAML crearía un segundo lugar donde vive. La
evidencia no es hipotética — el 029 le cambió `test` por `suite`, y un workflow con la lista habría
seguido en verde sin el gate de coverage.

### Desde el 043 los workflows son dos, y el segundo no verifica: escribe

`.github/workflows/mapa.yml` corre sólo en el push a `main` y **deriva `specs/mapa.json`** desde los
PR y los issues, commiteándolo si cambió. Tarda ~20 s contra los 87 s de `verify`, porque no instala
dependencias ni baja Chromium: `.claude/scripts/lib/specs.ts` no importa nada y node corre el `.ts`
directo.

Ese mismo spec le dio a `verify` los permisos que le faltaban —`issues: read` y `pull-requests: read`,
más `GH_TOKEN`—, y con eso **el gate del mapa deja de saltearse en la CI**. Estaba salteándose desde
que existe: el runner trae `gh`, pero el token sólo tenía `Contents: read`, así que las dos consultas
fallaban y el gate declaraba «sin `gh` disponible» — 7 de sus 17 tests, en verde.

**El token va sólo en el trigger `pull_request`, y es deliberado.** En el push a `main` de un merge de
spec conviven un mapa que todavía dice `Propuesto` y un PR ya mergeado —la condición que el gate
declara mentira— porque `mapa.yml` corre **en paralelo** con `verify`, no antes. Con el token puesto
en los dos triggers, cada merge de spec dejaría `main` en rojo con un rojo ya arreglado. En el PR el
gate confirma; en `main` la Action corrige. El comentario del YAML tiene las dos alternativas que se
descartaron.

Lo que sigue salteándose en la CI es el tercer bloque del gate, el que exige `pendientes: 0` a los
specs cerrados: necesita `specs/` hidratado, que desde el 034 es caché. Se saltea **declarándolo**,
que es la diferencia entre un gate que no aplica y uno que se apagó.

### Su forma exacta tiene dos cosas que no son cosméticas

`pnpm --filter "{.}" run --parallel "/^(…)$/"`, y las dos se descubrieron fallando en verde:

- **`--filter "{.}"` es obligatorio.** `--parallel` es un flag recursivo de workspace y **excluye el
  paquete raíz**: sin el filtro corre solo los scripts de `mcp-server` y reporta éxito sin haber
  tocado `lint`, `typecheck` ni `test` de la app. El filtro va **por ruta** (`{.}`) y no por nombre,
  para que renombrar el paquete no lo deje mudo otra vez.
- **El `$` del regex tampoco es decorativo:** sin él el patrón también engancha `test:watch` y arranca
  un segundo vitest. Medido: en shell no interactiva no cuelga —vitest sin TTY no entra en modo watch
  y termina igual—, así que el costo visible es trabajo duplicado. En una terminal interactiva sí
  queda esperando. El ancla borra la pregunta.

## `suite` son DOS pasadas de vitest, en secuencia y no en paralelo

Spec 029: primero `test` sin instrumentar y después `coverage`, con umbral **100** en las cuatro
métricas. Los dos motivos están medidos y ninguno es preferencia:

- **Instrumentar es medir el instrumento.** v8 inserta contadores en cada rama y los dos presupuestos
  de performance del 009 pasan de 1,8 ms a **11,3 ms** contra un techo de 5. Se saltean bajo coverage
  con `skipIf`, y el presupuesto se verifica en la pasada limpia — **la local**. Desde el 023 el mismo
  `skipIf` los saltea también cuando `CI` está puesta, por el mismo motivo con otra cara: el runner de
  Actions dio **8,4 ms y 15,7 ms** en dos corridas del mismo commit, o sea que no es una máquina lenta
  con un número propio sino una VM sin número, y no hay techo que ahí signifique algo. El precio, que
  el `skipIf` dice al lado: **estos dos presupuestos no los verifica la CI**, los verifica el `verify`
  de tu máquina.
- **Y en secuencia porque en paralelo el presupuesto también se cae, por otra razón.** Con cinco
  procesos pesados compitiendo por CPU la mediana sube igual y `verify` daba rojo sin que nada
  estuviera mal — el mismo modo de falla que el comentario de AC8 en `sequence.test.ts` ya
  documentaba cuando subió su techo de 2 a 4. Encadenarlas deja **cuatro** nodos concurrentes, o sea
  la misma contención que había antes del 029, y el presupuesto vuelve a medir lo que dice medir.

### Por qué el umbral es 100 y no 95

Un umbral más bajo es un presupuesto de deuda **sin dueño**: nadie sabe cuáles son las líneas que el
margen permite, así que nadie las revisa. Y su corolario: **cero comentarios que saltean una rama**,
por el mismo argumento que «cero `any`». Si una rama parece inalcanzable, se borra o se vuelve
alcanzable — las cuatro que aparecieron están anotadas en el research del 029, y desde el spec 032 lo
verifica `no-warning-comments` con los tres términos.

Y el 023 encontró la quinta, que sólo se ve corriendo el gate en **otra** máquina: un comparador
`a.name < b.name ? -1 : 1` dentro de `walk()` cubría sus dos ramas en Windows y una sola en el runner,
porque **cuál lado se ejecuta depende del orden en que el filesystem entrega las entradas** —NTFS
alfabético, ext4 por hash— y `mcp:test` daba `99.64%`. El umbral 100 pasaba por el sistema de archivos
de quien lo corriera. La salida no fue un ignore sino borrar la rama: el comparador es aritmético
(`Number(a > b) - Number(a < b)`), que además deja el orden total.

## El nodo que más creció es `lint`

Lo pagó el spec 030: el linting con tipos lo llevó de ~2,5 s a **11,0 s**. Se pagó con la medición al
lado —`recommendedTypeChecked` sobre el repo entero da 100 hallazgos y 97 son un solo patrón de
`node:test`— y ya se recortó lo que no valía: `import-x/no-cycle` costaba **15 s más** y encontraba
cero ciclos, así que no está.

Aun así el reloj de `verify` no lo manda el lint sino **`suite`, con 19,4 s**: el 030 se escribió
previendo ser el nodo más lento de los cuatro y el 029 lo desbancó antes de que ninguno de los dos se
mergeara. Es el dato de cada uno medido sin el otro — el par de arriba está medido con los dos
puestos.

Desde el spec 032 `lint` también lintea **todos los `.md`** del repo, en dos carriles: el preset
completo sobre la documentación viva, y sólo las reglas que cazan un error de **renderizado** sobre
`specs/[0-9]*/**`, porque la Desviación 2 de [`specs/README.md`](../../specs/README.md) dice que un
spec mergeado no se reescribe. El detalle de los dos carriles está en `eslint.config.js`, al lado de
cada bloque. El conteo de archivos **no se escribe acá a propósito**: es exactamente la clase de
número que envejece con el `.md` siguiente, y el que lo verifica es `eslint .` sin glob.

**Markdown cuesta 2,5 s**, y el «antes» hubo que re-medirlo: comparar contra los 11,0 s del 030 no
decía nada —otra máquina, otro momento—, así que el 032 corrió `eslint .` con
`--ignore-pattern "**/*.md"` en la misma sesión, **13,6 → 16,1 s**. `suite` seguía mandando el reloj
con 33,8 s, más del doble. La regla que deja eso escrito vale para todos los números de esta página:
**un número de performance de un spec viejo no sirve como línea de base**, y los pares de arriba lo
son sólo dentro de su propia medición.

## Desde el 048 el lint no espera a que alguien lo corra

Todo lo de arriba tiene una propiedad en común y es un problema: **se dispara cuando alguien
tipea el comando.** Un agente que edita veinte archivos y nunca corre `pnpm verify` no ve una sola
regla del repo hasta que abre el PR — y desde el 047 ese PR en rojo no se puede mergear, así que el
error no llega a `main`, pero se descubre **al final**, con veinte archivos escritos sobre una
premisa equivocada en vez de al segundo.

`.claude/scripts/lint-al-cerrar.mjs` corre como hook **`Stop` y `SubagentStop`**, lintea lo que
cambió en el árbol y, si hay rojo, lo devuelve como texto para que el agente lo arregle antes de dar
el turno por terminado. **No reemplaza a `pnpm verify` ni a la CI**, y no hay que leerlo así:
adelanta el momento en que el agente se entera, de «cuando abre el PR» a «cuando cree que terminó».

**Por turno y no por edición**, que es la decisión, y la toman cuatro números medidos sobre
`63e569a`: `pnpm lint` entero 21,78 s, un archivo con información de tipos 4,42 s, sin tipos 2,44 s,
y los 38 de `src/` sin tipos 3,47 s. O sea que **~2,4 s son arranque fijo** —un `PostToolUse` le sumaría eso a *cada*
`Edit`, y veinte ediciones son un minuto y medio repartido en veinte pausas— y que **ir de 1 archivo
a 38 cuesta 1 segundo**, así que la granularidad fina no compra nada.

**Los dos eventos, y lo que cuesta.** `Stop` y `SubagentStop` son eventos distintos y `Stop` no
cubre subagentes; este repo hace la mayor parte de su trabajo adentro de subagentes, así que un hook
declarado sólo en `Stop` no vería el turno donde se escribieron los archivos. El precio es que N
carriles en paralelo pagan N veces el presupuesto sobre la misma caché de ESLint, y por eso el hook
se serializa con un **lock que no espera**: el que no lo toma deja pasar diciéndolo.

Lo medido en la máquina de desarrollo, con el `eslint.config.js` de los specs 049 y 050 ya puestos
—**nunca en la CI**, que varía hasta 1,86× entre corridas—:

| | Techo | Medido (mediana) |
|---|---|---|
| Árbol sin un archivo linteable | < 200 ms | **135 ms** |
| Un archivo cambiado | < 6 s | **4,57 s** |

Los dos valen **con la máquina descargada**, y sólo eso: bajo cinco `verify` concurrentes la fila
de un archivo se remidió en 5,5–16,2 s y la del árbol limpio en 201–237 ms. Un `.md` más en el repo
—el que agrega el 047— no los mueve, porque el hook lintea **sólo lo que cambió**; lo que mueve es
el `pnpm lint` entero de arriba ([#145](https://github.com/federicohermo/pentomino-games/issues/145)).

El `timeout` declarado es **30 s**, y no es el `10` del gate del 037 copiado: aquél corresponde a un
hook de 64,6 ms y éste cuesta segundos. Son cinco veces el techo —margen para el turno que cambió
treinta archivos y para una máquina cargada— y muy por debajo del default de 600 s, que sería una
sesión trabada durante diez minutos.

**Qué corre y qué no.** Lint sobre lo cambiado —`git diff`, el `--cached` y
`git ls-files --others`, que es el único que ve los archivos nuevos— filtrado a `.ts`, `.tsx`, `.js`
y `.md`, que son las extensiones que la config cubre, **y a los que todavía existen**: un borrado
también sale en `git diff`, y ESLint sobre una ruta que no está sale con status 2, que el hook lee
como «no pude decidir» — o sea que sin ese filtro un turno que borra un `.md` dejaba de verificar
todo lo demás, callado y en verde. `.mjs` **queda afuera a propósito**: el bloque
que extiende `js.configs.recommended` está atado a `**/*.js`, glob que en flat config no matchea
`.mjs`, así que los siete `.mjs` de `.claude/scripts/` —el hook mismo incluido— hoy se lintean con
cero reglas ([#143](https://github.com/federicohermo/pentomino-games/issues/143)). **No corre la
suite**: es el reloj de `verify`, y además el [#97](https://github.com/federicohermo/pentomino-games/issues/97)
documenta un test intermitente — dentro de un nodo que alguien tipea es una molestia, dentro de un
hook por turno es un bloqueo intermitente del cierre, que es la forma más rápida de que el hook se
apague. **No corre el typecheck aparte**: el lint ya corre con información de tipos, que es de dónde
salen esos 4,42 s.

**Y falla abierto, como su hermano.** Si ESLint no está, si la config está rota, o si el bloqueo
anterior fue del propio hook (`stop_hook_active`), deja pasar y lo dice. Un hook que bloquea cuando
no pudo decidir se desactiva el primer día.

### Los dos hooks protegen la SESIÓN, no el repositorio

Vale para éste y para el gate del spec 037 (`.claude/scripts/gate-de-spec.mjs`), y conviene leerlo
antes de confiar en ninguno de los dos: **un hook de Claude Code se dispara cuando el que trabaja es
la sesión**. Una persona editando `docs/architecture/overview.md` en su editor, parada en `main`, no
ejecuta el gate del 037 nunca; un `git commit` desde una terminal fuera de la sesión, tampoco.

**No es un defecto a arreglar.** Cubrir a una persona sería un hook de git, que es otra decisión con
otro costo —empieza por instalar algo que este repo no tiene, y este repo mide antes de agregar
dependencias— y esto es un harness de agentes: hace lo que un harness de agentes hace. Lo que
protege el repositorio es la otra mitad, la que no depende de dónde se escribió: `pnpm verify` en la
CI sobre cada PR, y el ruleset del 047 que no deja mergear en rojo.

## Los tests de `src/` son dos proyectos de Vitest y un solo comando

Spec 029. El corte no es por capa sino por lo que el test necesita:

- **`node`** — `environment: 'node'` contra `node-web-audio-api`. El dominio es puro y el audio tiene
  una implementación nativa de Web Audio, así que corre ahí sin adaptación. Su `include` tiene
  **cinco** raíces, y las cuatro de afuera son gates que **no importan una línea de `src/`**: cada uno
  vive al lado del **sujeto** que verifica, no de lo que el sujeto toca. `__tests__/` en la raíz son
  los cuatro que miran lo que no vive en `src/` —`index.html`, `public/manifest.json`, `README.md`, y
  el modelo de dos ramas del spec 047—;
  `docs/__tests__/` los tres de la **documentación** —enlaces y anclas de todo `.md`, el mapa de
  `directory-structure.md` y el techo de 200 líneas de `CLAUDE.md`, issue #100—; `specs/__tests__/`
  los dos del **registro** —la convención y `mapa.json`, spec 035—; y `.claude/scripts/__tests__/` los
  cuatro de los **scripts** —el de publicar e hidratar, el del lanzador de `gh` del issue #125, el del
  gate de rama del spec 037 y el de este hook—, que son del script y no de `specs/`, que es lo que el
  script manipula. El `include` de coverage sigue siendo
  `src/**`, y desde el 038 eso **no alcanza**: v8 reporta todo archivo que se **ejecutó**, y el
  `include` sólo decide cuáles de los que nadie tocó se suman al denominador. `mapa-de-specs.test.ts`
  importa `readSpecStatus` del otro paquete, así que `mcp-server/` entero entró a la tabla y puso el
  umbral en rojo: está en el `exclude` del coverage de vitest, y su gate al 100 sigue siendo
  `mcp:test`.
- **`browser`** — Chromium de verdad, por Playwright, para los archivos `*.browser.test.tsx`. Entra
  porque jsdom no puede: `Spectrum.tsx` necesita canvas 2D, `createLinearGradient`, `ResizeObserver`,
  `matchMedia` y un `getBoundingClientRect` con números, y `audio/engine.ts` necesita
  `new AudioContext()` y `window.setInterval`. Cubrirlos con jsdom exigiría mockear exactamente el
  código que se quiere cubrir, que es cobertura sin verificación.

El discriminante es el **sufijo** y no una carpeta: un test de `Board.tsx` que necesita navegador
sigue siendo un test de `Board.tsx` y vive al lado.

**Chromium no está en el lockfile**: un clone nuevo necesita `pnpm exec playwright install chromium`
antes del primer `verify`. En CI eso no hace falta acordárselo: el workflow del 023 lo instala con
`--with-deps`, que el runner de Ubuntu necesita para las librerías de sistema.

Los del MCP server son de `node --test`, en su propio paquete, y desde el 029 corren con los
`--test-coverage-*=100` de node.

## El gestor es pnpm

Fijado en `packageManager` y versionado en `pnpm-lock.yaml`. **No usar npm**: instalaría un
`node_modules` plano y dejaría un `package-lock.json` al lado del `pnpm-lock.yaml`, o sea dos
lockfiles que resuelven distinto y un deploy que elige uno de los dos. La config de pnpm vive en
`pnpm-workspace.yaml`, no en el `package.json`.

`node_modules` es **estricto**: solo se puede importar lo declarado en `package.json`. Un import de
una dependencia transitiva que con npm andaba, acá falla — es a propósito, y es la red que atrapa los
imports fantasma antes de que lleguen a producción.

## Versión de Node

Node ≥ 20.19 o ≥ 22.12 — lo exige Vite 7 y desde el spec 023 lo declara **nuestro propio** `engines`,
no el de Vite: con Node 18 el gestor lo dice al instalar, en vez de que se entere el build.

El MCP server pide **≥ 22.18** porque corre TypeScript sin compilar; es un piso de tooling, vive en el
`engines` del server —que es quien lo necesita— y con Node 20 solo se pierde el server.
