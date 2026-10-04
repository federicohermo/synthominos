/**
 * La base con la que `claveDeTramo` empaqueta costo y pasos en un entero.
 *
 * **Tiene que ser mayor que la SUMA de los pasos del circuito entero, no que los de un
 * tramo.** Held-Karp suma claves y compara sumas, asi que lo que no puede acarrear al
 * campo del costo es el total: 12 tramos de a lo sumo 60 pasos —el tablero tiene 60
 * celdas y un camino no repite ninguna— dan 720. De ahi 1024, la potencia de dos que lo
 * pasa con margen.
 *
 * Achicarlo a 60 "porque ningun tramo mide mas" es el error que este docblock existe
 * para evitar: el acarreo no falla ruidosamente, ordena mal el circuito y el tablero
 * suena distinto sin que nada se ponga en rojo.
 */
export const PASOS_MAX = 1024;
