import type { REGIMEN } from './music.constants.ts';

/**
 * Que hace la rotacion: cambiar la ESCALA o cambiar el ORDEN.
 *
 * Ver `REGIMEN` en `constants/music.constants.ts`, que es donde estan los dos valores y
 * el porque de que existan los dos.
 *
 * Derivado del const-object y no un `enum`: `erasableSyntaxOnly` rechaza los enums, y
 * es la misma opcion que permite que node cargue `src/<capability>/domain/` sin compilar. Es el
 * mismo patron que `HitKind` sobre `HIT` y `MarcaKind` sobre `MARCA` — un conjunto
 * cerrado se escribe una sola vez, como valores, y el tipo se deriva.
 *
 * Viaja como PARAMETRO por todo el modelo —`notesForRotation`, `arpeggioFor`,
 * `noteAtCell`, `buildSequence`— y nunca como global: el repo no tiene estado global,
 * y el regimen es estado de `App.tsx` como el tempo. Eso es tambien lo que hace que
 * retirar uno de los dos, cuando se decida cual se queda, sea borrar una rama en vez
 * de desenredar un singleton.
 */
export type RegimenDeRotacion = (typeof REGIMEN)[keyof typeof REGIMEN];
