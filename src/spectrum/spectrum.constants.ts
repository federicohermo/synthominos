/**
 * Los valores fijos del dibujo del espectro.
 *
 * Viven aca y no en `spectrum-loop.ts` por la regla de `CLAUDE.md`: un `.ts` de capa
 * tiene funciones y nada mas. Mientras el bucle estuvo adentro de `Spectrum.tsx` la
 * regla no llegaba —un `.tsx` es un componente, no un modulo de capa—; salieron a un
 * `.ts` para poder testearlos, y con eso estos cuatro numeros pasaron a estar donde la
 * regla mira.
 */

/** Barras dibujadas. Menos que los 128 bins: agrupadas se leen sin ruido visual. */
export const BAR_COUNT = 48;

/** Separacion entre barras, en px CSS. */
export const GAP = 2;

/** Altura minima de una barra con senal: por debajo de esto no se ve que hay algo. */
export const MIN_BAR = 2;

/** Lo que dice el canvas cuando no hay senal que dibujar. */
export const IDLE_TEXT = 'En reposo — el audio arranca con el primer click';
