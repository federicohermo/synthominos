---
paths:
  - "src/**/*.{ts,tsx}"
  - "mcp-server/src/**/*.ts"
---

# Comentarios

Estos son los dos árboles que lintean `local/comment-shape` y `local/comment-anchor` (spec 051), o sea
que esta regla se carga justo cuando se está escribiendo el comentario y no cuando se está haciendo
cualquier otra cosa. El porqué de cada cláusula está en
[docs/guides/conventions.md](../../docs/guides/conventions.md) § Comentarios; acá está lo operable.

**El comentario explica el porqué, no el qué**: una decisión, una restricción, un bug evitado. La forma
más rápida de contestarlo, y la que este repo adopta, es la de Ousterhout: **el comentario tiene que
estar en un nivel de abstracción DISTINTO del código**. «¿Esto es un porqué?» se contesta que sí casi
siempre; «¿esto está en otro nivel que el código?» se contesta mirando, y `// normalized` arriba de
`return c` la falla sin discusión. En español, igual que los commits y los specs.

## Qué caza cada `messageId`

| Regla | `messageId` | Dispara con |
|---|---|---|
| `comment-shape` | `vacio` | Un comentario sin cuerpo, o sólo asteriscos |
| `comment-shape` | `codigo` | Código archivado en un comentario — lo guarda git, con la fecha y el motivo |
| `comment-shape` | `etiqueta` | Un comentario JSX de ≤6 palabras sin conjunción causal: lo dice el marcado, y miente en cuanto cambie |
| `comment-shape` | `resumen` | Un docblock cuyo **primer párrafo** pasa de 2 líneas |
| `comment-anchor` | `muerta` | Una cita con forma de archivo que **no resuelve** contra el árbol |
| `comment-anchor` | `historia` | Narrativa histórica: `ya no`, `anteriormente`, `previamente`, `solía`, `hasta hace`, y `antes` + verbo en pasado |

Una corrida de `//` consecutivos es **un** comentario para las dos reglas, y las directivas
(`eslint`, `ts-`, `c8`…) no se miran.

## El primer párrafo de un docblock: ≤2 líneas

El resumen es **el primer párrafo — hasta la primera línea en blanco —**, y ahí va *qué es esto*. Lo que
sigue **no tiene tope**: ahí va *por qué es así*, con toda la extensión que haga falta.

No es una regla de longitud disfrazada. Es para que quien explora el repo bajo presupuesto de líneas
—una persona apurada, o un agente— sepa con la primera línea si el archivo le sirve. El repo ya escribía
así antes de que la regla existiera: el 84 % de sus 617 docblocks abría con ≤2 líneas.

`@remarks` **se acepta y no se exige**: este repo no usa tags TSDoc y pedirlos sería importar una
convención en vez de codificar la que ya tiene.

**A las corridas de `//` no se les pide resumen.** Serían 516 ediciones para inventar una convención que
el repo nunca tuvo, y nada dice que estructurar un comentario de línea sirva.

## Una cita tiene que resolver

Nombrar un archivo en un comentario **está bien y se fomenta**: de las 315 citas que había cuando la
regla entró, 309 resolvían. Lo que no está bien es que una deje de resolver sin que nadie se entere —el
caso que motivó el spec fue `log.md`, citado siete veces después de que la mudanza a Issues lo borrara—.

- La cita se empareja **por basename**, no por ruta completa: `// ver constants/piece.constants.ts` pasa
  con que exista algún `piece.constants.ts`. Lo que el chequeo caza es **el archivo borrado o
  renombrado**, y exigir la ruta exacta convertiría las 309 citas vivas en un problema de formato.
- **`lib.*.d.ts` y los cuatro archivos de un spec** (`spec.md`, `research.md`, `plan.md`, `tasks.md`) no
  se verifican: los primeros son de TypeScript y los segundos viven en una caché gitignoreada que en la
  CI está vacía. Citarlos como fuente de un número medido sigue siendo la convención del repo.
- Si la cita no puede resolver —un archivo de afuera, un script de un solo uso ya borrado—, la salida es
  **describir el rol y no la ubicación**, o citar el issue de su spec.

## El eje del tiempo: restricción vigente contra crónica

Es la regla del spec 035, y `historia` la marca sin decidirla. Ante un hallazgo, la pregunta es una:
**¿esto describe una restricción que HOY hace que el código tenga que ser así, o cuenta cómo se llegó?**

- **Restricción vigente** → se queda, **reescrita sin la forma histórica**. No se borra el argumento: se
  le saca el eje temporal.
- **Crónica** → se muda al [issue de su spec](https://github.com/federicohermo/pentomino-games/issues)
  como nota de revisión, y en su lugar queda un puntero de una línea. El número de issue sale de
  `specs/mapa.json` y no del `NNN`: el spec 001 es el issue #63.
- **Ante la duda, se queda.** Un comentario de más cuesta una lectura; uno de menos cuesta el argumento.
- **Si un párrafo mezcla las dos cosas, se parte.**

## Lo que NO se verifica, y se evaluó

Que no aparezcan de nuevo como propuesta:

- **Longitud y densidad.** Se midieron —302 y 49 hallazgos— y se rechazaron. Chocan con «sin objetivo
  numérico» y con la evidencia: sacarle los comentarios a un modelo le degrada la refinación de código
  hasta un 90 %. **Ningún comentario de este repo se acorta por ser largo.**
- **El comentario al final de la línea.** Se permite, y es decisión explícita del dueño del repo: ancla
  la explicación al token exacto sin gastar una línea. `no-inline-comments` del core hace justo eso, y
  además está congelada con la deprecación aceptada.
- **Prohibir citar un archivo.** Es lo que hace el repo del que se portaron las reglas; acá se invirtió.

El criterio que ordena las tres: **lo que se verifica es la exactitud, no la longitud.** Un comentario
largo y verdadero es barato; uno corto y podrido es caro.
