/**
 * Las cuatro acciones que un gesto de entrada puede pedirle al shell: rotar la pieza por
 * colocar, alternar su reflexión, alternar el transporte o **seleccionar** otra pieza.
 *
 * `seleccionar` es la unica que no sale de un modificador: las
 * doce letras eligen su pentominó. Va acá adentro y no como una cuarta rama suelta del
 * cableado porque la decisión de QUÉ gesto es sigue siendo una sola pregunta —la que
 * contesta `accionDeTecla`—, y sacarla de esta tabla la partiría en dos lugares.
 *
 * Const-object y no `enum` — el `erasableSyntaxOnly` del tsconfig los rechaza, y es la
 * misma opción que permite que node cargue `src/` sin compilar. El precedente exacto
 * es `MARCA` en `route.constants.ts`, y vive acá y no en `input.ts` porque los módulos
 * de este repo no declaran constantes.
 *
 * No hay una quinta acción `no-hacer-nada`: la ausencia de acción es `null`, y eso deja
 * que el llamador use el mismo valor para decidir si hace `preventDefault` — si el
 * handler se saltea el evento, el navegador tiene que quedárselo entero.
 */
export const ACCION = {
  rotar: 'rotar',
  reflejar: 'reflejar',
  transporte: 'transporte',
  seleccionar: 'seleccionar',
} as const;

/**
 * Lo que un click sobre una celda le puede pedir al tablero.
 *
 * Cuatro y no dos: colocar y colocar-muteada son la misma edición del tablero pero
 * distinto gesto de escucha —la muteada **no** dispara el arpegio de cortesía, porque se
 * está poniendo justamente para que no suene— y separarlas acá es lo que evita que esa
 * condición viva como un `if` suelto en el shell.
 *
 * La ausencia de acción sigue siendo `null`, igual que en `ACCION`: es el click sobre una
 * pieza que **no** es la que está en la mano, que no hace nada — como antes de este spec.
 */
export const EDICION = {
  quitar: 'quitar',
  mutear: 'mutear',
  colocar: 'colocar',
  colocarMuteada: 'colocar-muteada',
} as const;
