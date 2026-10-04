/**
 * Los tres sonidos que puede pisar la cabeza lectora en un intervalo del recorrido: la
 * nota propia de una pieza, el cruce con floritura o el click mudo.
 *
 * El cruce es sobre una celda ocupada que no es su turno, y el click mudo sobre celda
 * vacia. Const-object y no un booleano porque el conjunto tiene TRES valores y no dos, y
 * `erasableSyntaxOnly` rechaza `enum` (ver `Marca` en `route.types.ts` para el porque del
 * cambio).
 */
export const MARCA = { nota: 'nota', cruce: 'cruce', click: 'click' } as const;
