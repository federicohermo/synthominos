/** Cuanto futuro se agenda en cada vuelta del temporizador, en segundos. */
export const LOOKAHEAD = 0.1;

/** Cada cuanto despierta el temporizador, en ms. No dispara notas: decide cuando mirar. */
export const TICK_MS = 25;

/**
 * Pulsos por compas. El instrumento esta en 4/4.
 *
 * No confundir con el ancho del tablero, que ademas no es un numero fijo: aquel dice
 * cuantas celdas hay y este en cuantos pulsos se divide el compas. Se pudieron
 * confundir mientras el eje X del tablero ERA el tiempo; hoy el tablero es un
 * recorrido y el motor no lo mira.
 */
export const BEATS_PER_BAR = 4;

/**
 * En cuantas partes se divide el pulso. Con 4, la unidad es la semicorchea.
 *
 * Es la grilla mas fina del instrumento: todo lo que se mide en tiempo —el paso
 * del arpegio y la duracion de una nota— se cuenta en intervalos, no en segundos.
 * Que sea una constante y no un numero suelto es lo que permite cambiar la
 * subdivision en un solo lugar sin que el arpegio y la nota se desincronicen.
 */
export const SUBDIVISIONS_PER_BEAT = 4;

/**
 * Las TRES clases de evento sonoro del recorrido: nota de pieza, click de celda vacia
 * y cruce por celda ocupada.
 *
 * La nota la dispara una pieza; el click lo produce una celda vacia que el circuito
 * cruza al ir de una pieza a la siguiente; y el cruce por una celda OCUPADA suena la
 * nota de esa celda como floritura.
 *
 * Tres claves y no dos con un campo opcional: el argumento largo
 * esta en el docblock de `Hit`, y ademas `cross` y `click` se despachan distinto en
 * `tick()` — `setClicksAudible` apaga solo al segundo, y sin discriminante no
 * tendria a quien apagar.
 *
 * Const-object con union derivada (`HitKind`) y no un `enum`: `erasableSyntaxOnly`
 * los rechaza, y es la misma opcion que permite cargar estos modulos con node sin
 * compilar. Los valores son strings iguales a sus claves para que un `Hit` sea
 * legible tal cual sale en un log o en un test, sin tener que traducir un numero.
 */
export const HIT = { note: 'note', click: 'click', cross: 'cross' } as const;
