/**
 * La orientación de la pieza en la mano, dicha en palabras.
 *
 * Existe porque la miniatura **no puede decirla entera**, y está medido: de
 * las 96 combinaciones de pieza × rotación × reflexión, **29 suenan distinto sin verse
 * distinto** (el 30 %, repartido en 6 de las 12 piezas). La `I` tiene dos formas para
 * cuatro rotaciones y la `X` una sola para las cuatro; la reflexión no le agrega ni una
 * forma a `I`, `T`, `U`, `V`, `W` ni `X`. Rotar una `X` cuatro veces da cuatro arpegios
 * distintos —`A4 B4 C#5 E5 F#5` a 0°, `E5 F#5 G#5 B5 C#6` a 270°— y cero cambio visible.
 *
 * Hasta el 019 eso lo tapaban los cuatro botones de grados, que este spec borra porque
 * duplican la rueda y el `Shift`. Un botón que además informa es dos cosas; lo que hacía
 * falta era la segunda, y una línea de texto no se puede apretar.
 *
 * ## Por qué vive en un `.ts` y no adentro del `.tsx`
 *
 * `react-refresh/only-export-components` prohíbe que un `.tsx` exporte algo que no sea el
 * componente: escrita adentro de `PiecePalette.tsx` esta pura no se podría exportar y por
 * lo tanto no se podría testear. Es el mismo movimiento con el que salieron `cell-text.ts`
 * y `piece-mini.ts` (016), y es de quien esta función es hermana.
 *
 * Y no en `cell-text.ts`: ese archivo contesta qué dice una CELDA DEL TABLERO y su tipo
 * cruza hacia `Board.tsx`. Acá la pregunta es qué dice el panel de la pieza en la mano.
 */

/**
 * Los dos fragmentos de la orientación: los grados, y la palabra «reflejada» o `null`.
 *
 * **Fragmentos y no una cadena terminada**, y ésa es toda la decisión de este archivo: los
 * dos lectores que hay la escriben distinto y ninguno de los dos puede ceder.
 *
 * ```
 * la línea visible del panel    180° · reflejada
 * el `aria-label` del botón     X, rotación 180°, reflejada
 * ```
 *
 * Bajar el `aria-label` al formato visible le saca el sustantivo «rotación» y le mete un
 * separador que el lector de pantalla deletrea, o sea que unificar el texto saldaría la
 * duplicación agrandando la deuda de accesibilidad. Y subir la línea visible al del
 * `aria-label` la vuelve una frase larga en una fila que tiene que entrar en un renglón.
 *
 * Lo que sí se comparte es la DERIVACIÓN —el `* 90` y la condición del espejo—, que es lo
 * que estaba escrito dos veces: partida la tarjeta, las dos copias ni siquiera comparten
 * archivo. Cada `.tsx` compone su formato con estos dos pedazos.
 *
 * El tipo va inline en la firma y no en `components/types/`: no es un tipo de props que
 * dos componentes se pasen, es la forma del retorno de una función. El precedente es
 * `reflejaElContextMenu(e: { ctrlKey: boolean })` en `input.ts`.
 */
export function textoDeOrientacion(
  rotation: number,
  mirror: boolean,
): { grados: string; reflejada: string | null } {
  return { grados: `${rotation * 90}°`, reflejada: mirror ? 'reflejada' : null };
}
