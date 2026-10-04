/**
 * El tamano de celda OBJETIVO, en px, y lo unico que queda de la larga historia de
 * `CELL_PX`.
 *
 * El tablero no tiene un tamano fijo en celdas: la grilla es la que entra en el viewport a
 * este tamano. O sea que este numero no decide cuanto mide el tablero —eso lo decide la
 * pantalla— sino **que tan grande se ve una baldosa**, que es lo unico que decide de verdad.
 *
 * ```
 * 1. cuantas entran           c0 = max(GRID_MIN.w, round(vw / CELL_PX_OBJETIVO))
 *                             r0 = max(GRID_MIN.h, round(vh / CELL_PX_OBJETIVO))
 * 2. el tamano real           cell = min(vw / c0, vh / r0)
 * 3. y cuantas entran a ESE   cols = max(GRID_MIN.w, floor(vw / cell))
 *                             rows = max(GRID_MIN.h, floor(vh / cell))
 * ```
 *
 * La formula vive en `board-fit/grid-fit.ts` —donde tiene test— y quien la escribe en el
 * DOM es `board-fit/use-grid.ts`. Todo lo que dependa del tamano de celda lee
 * `var(--cell)` y no este numero: una custom property la resuelve el navegador en cada
 * elemento, asi que redimensionar la ventana reposiciona las celdas, el velo y la cabeza
 * lectora **sin un solo re-render de React**.
 *
 * Medido sobre los viewports reales:
 *
 * ```
 * viewport        cols x rows   celdas   celda    nota
 * 1920 x 1080      26 x  15      390     72,0 px  18,7 px
 * 1512 x  982      21 x  13      273     72,0 px  18,7 px
 * 1440 x  900      20 x  12      240     72,0 px  18,7 px
 * 1366 x  768      19 x  11      209     69,8 px  18,2 px
 * 1280 x  720      18 x  10      180     71,1 px  18,5 px
 *  834 x 1112      11 x  15      165     74,1 px  19,3 px
 *  430 x  932       6 x  13       78     71,7 px  18,7 px
 *  375 x  667       5 x   9       45     74,1 px  19,3 px
 *  320 x  568       5 x   8       40     64,0 px  16,7 px
 * ```
 *
 * La celda real se queda entre 64 y 74,1 px: el redondeo la mueve un 4,4 % como mucho,
 * salvo en el ultimo viewport, donde el minimo de 5 columnas de `GRID_MIN` no entra a 73 px
 * y **se achica la celda antes que dejar que aparezca scroll**.
 *
 * ## Por que 73 y no 60
 *
 * El argumento es **tipografico**. El candidato anterior era 60 y estaba medido con un
 * `Range` sobre el nodo de texto a la fuente que se renderiza —los nombres con sostenido,
 * `D#4`, todos iguales porque `tabular-nums` iguala los digitos, ocupan 35,4 px a los 19 px
 * que la celda usaba—, pero valia con la fuente clavada en 19 px. Con la tipografia
 * proporcional a la celda (las razones de abajo), 60 de celda da una nota de 15,6 px, o sea
 * por debajo del tamano que el repo midio como necesario. **73 es la celda donde la nota
 * vale exactamente los 19 px medidos.**
 *
 * El numero sube con la fuente, asi que hay que remedirlo cada vez que cambien las razones
 * de abajo — es la trampa que este docblock ya se comio dos veces con el layout viejo.
 */
export const CELL_PX_OBJETIVO = 73;

/**
 * Las razones que vuelven proporcional todo lo que la baldosa media en px fijos.
 *
 * Cada una es `medida_de_hoy / CELL_PX_OBJETIVO`, con el denominador tomado del SIMBOLO y
 * no escrito a mano: asi el 73 vive en un solo lugar. A `--cell = 73` las seis dan de
 * vuelta el numero exacto que la baldosa tenia cuando cada medida era un px clavado, que es
 * lo que sostiene que la baldosa se vea **igual** — y lo que evita tener que remedir el aire
 * alrededor del texto, la trampa que el docblock de arriba nombra.
 *
 * Se consumen como `calc(var(--cell) * RAZON)` y por estilo inline, nunca como clase:
 * Tailwind escanea el fuente y una clase interpolada no se genera.
 *
 * La lista, con la medida que la origino:
 *
 * ```
 * NOTA_RAZON      19 px   el `text-[19px]` de la nota
 * PASO_RAZON      13 px   el `text-[13px]` del `#N`
 * AIRE_RAZON       2 px   el `p-0.5` entre la caja de la celda y la baldosa
 * RADIO_RAZON      8 px   el `rounded-lg`, dicho DOS veces sobre el mismo objeto
 * RESERVA_RAZON    8 px   el `pb-2` que le deja alto a la nota sobre el `#N`
 * PASO_ABAJO_RAZON     2 px   el `bottom-0.5` del `#N`
 * PASO_DERECHA_RAZON   6 px   el `right-1.5` del `#N`
 * ```
 *
 * **El borde de 1 px NO esta en esta lista, y es a proposito** — ver el comentario junto
 * al `border` de `Board.tsx`.
 */
export const NOTA_RAZON = 19 / CELL_PX_OBJETIVO;
export const PASO_RAZON = 13 / CELL_PX_OBJETIVO;
export const AIRE_RAZON = 2 / CELL_PX_OBJETIVO;
export const RADIO_RAZON = 8 / CELL_PX_OBJETIVO;
export const RESERVA_RAZON = 8 / CELL_PX_OBJETIVO;
export const PASO_ABAJO_RAZON = 2 / CELL_PX_OBJETIVO;
export const PASO_DERECHA_RAZON = 6 / CELL_PX_OBJETIVO;

/* `PREVIEW_CELL_PX` (20) se fue con el panel de previsualizacion aparte (`PiecePreview`),
   que dejo de existir cuando el fantasma del tablero paso a mostrar la nota de cada
   celda (spec 007, issue #69).

   La miniatura de la paleta **no deshace ese retiro**, y conviene que quede escrito
   porque se le parece. Aquel panel se fue por repetir las NOTAS —el fantasma las dice mejor,
   sobre la celda donde van a caer— y la miniatura de la paleta no dice ni una nota
   ni un `#N` (D7): dice la FORMA, que es lo que aquel retiro se llevo puesto de
   paso y lo unico que el fantasma no puede contestar, porque para verlo ya hay que
   haber elegido la pieza. Y aquel 20 era una miniatura sola en un panel de 252 px;
   aca son doce en el mismo lugar. */

/**
 * El lado de la caja de la miniatura de la paleta, en celdas.
 *
 * 5 es la caja mas chica que contiene cualquier pentomino en cualquiera de sus 8
 * orientaciones: el maximo en un eje lo pone sola la `I` —5×1 acostada, 1×5 parada— y
 * ninguna otra pieza pasa de 4×2 ni de 3×3. Con 4 la `I` no entra.
 *
 * **Con la orientacion por pieza la caja fija es MAS necesaria, no menos.** Si las doce
 * miniaturas compartieran una orientacion, una fila que se descuadra al rotar se descuadra
 * entera y de una vez. Como cada pieza recuerda la suya y las doce cambian por separado,
 * sin la caja fija rotar la `I` sola moveria a sus once vecinas de la grilla. El argumento
 * esta duplicado en `piece-mini.ts` y en `DESIGN.md`, y los tres tienen que decir lo mismo.
 *
 * **No se toma `CELLS_PER_PIECE` de `domain/`**, aunque valga 5 tambien. Son dos
 * numeros distintos que coinciden por casualidad: aquel dice cuantas celdas tiene una
 * pieza —una propiedad del modelo— y este cuantas casillas mide la caja donde se
 * dibuja, que es una decision de layout. Atarlos haria que cambiar el pentomino a
 * hexomino moviera el layout, y que agrandar la caja pareciera un cambio de modelo.
 */
export const MINI_BOX = 5;

/**
 * El lado de una celda de la miniatura, en px.
 *
 * **El argumento con el que este numero se eligio esta muerto**, y conviene decirlo antes
 * que nada porque era el argumento entero: salia del alto de la fila de tarjetas que la
 * paleta compartia con el tablero, y esa fila no existe. La cadena completa —seis columnas
 * de 8 px para no robarle alto al tablero— esta en el spec 021 (issue #83). Hoy no hay
 * fila, no hay tarjeta y el tamano de celda sale del viewport; la paleta es un dock `fixed`
 * que flota encima y no le quita un pixel a nadie.
 *
 * Lo que decide el numero ahora es la CAJA DEL DOCK, que mide `calc(var(--cell) * 2)` de
 * ancho — 146 px en el peor caso, que es el piso. Ahi adentro tienen que entrar las doce
 * miniaturas con su letra, y la tabla de columnas se resuelve contra el ancho real del
 * contenedor (`OrientationPanel.tsx`) y no contra el breakpoint del viewport, que no dice
 * nada sobre cuanto mide esta caja.
 *
 * 8 px se queda porque sigue siendo el mas chico que deja leer la FORMA: con `MINI_BOX = 5`
 * la caja mide 40 px de lado, y a menos que eso las piezas de tres celdas de ancho dejan de
 * distinguirse entre si. No se remidio con el dock puesto — si el dock cambia de ancho, este
 * es el numero a remedir.
 */
export const MINI_CELL_PX = 8;

/**
 * El ancho minimo de una columna de la grilla de miniaturas, en px.
 *
 * Derivado y no tipeado: es la caja del mini (`MINI_BOX x MINI_CELL_PX` = 40) mas el
 * `px-2` del boton que la contiene (8 por lado) mas su borde (1 por lado). Si alguno de
 * los dos numeros de arriba cambia, este lo sigue solo.
 *
 * Reemplaza a la tabla de breakpoints que `OrientationPanel` tenia: ahi las columnas salian
 * del ancho del VIEWPORT, que era una buena aproximacion del ancho de la tarjeta mientras la
 * tarjeta ocupaba una columna del grid.
 * Con el dock son dos variables distintas —el dock mide `calc(var(--cell) * 2)`, o sea
 * entre 146 y 360 px, mientras el viewport puede estar en `xl`— y la aproximacion se cae:
 * a 1366 x 768 el breakpoint pedia SEIS columnas adentro de una caja de 256 px. Con
 * `repeat(auto-fill, minmax(MINI_PISTA_PX, 1fr))` la cuenta la hace el navegador contra la
 * caja real, que es la misma decision de una sola fuente del numero que `--cell`.
 */
export const MINI_PISTA_PX = MINI_BOX * MINI_CELL_PX + 16 + 2;

/** Extremos del slider de tempo, en bpm. El valor inicial es DEFAULT_BPM del motor. */
export const TEMPO_MIN = 60;
export const TEMPO_MAX = 160;

/**
 * Los dos anchos del anillo de foco de la celda, **como razon de la celda**.
 *
 * ## Por que son DOS y no uno
 *
 * Porque abajo de la celda enfocada puede haber cualquiera de los 12 colores, y los dos
 * extremos de la lamina son `#FFFF00` (la `V`) y `#0000FF` (la `W`): un solo tono se
 * pierde contra alguno de ellos. Van claro adentro y oscuro afuera, y como un `outline`
 * de CSS tiene un unico color hacen falta DOS propiedades — es lo que DESIGN.md fija.
 *
 * ## Donde cae cada banda, que es lo que decide los numeros
 *
 * Una celda son dos cajas: la de `--cell` y la baldosa redondeada de adentro, con el aire
 * de `AIRE_RAZON` entre las dos (el padding de `Board.tsx`). Las dos bandas se reparten ese
 * aire y el borde de la baldosa, y las dos se dibujan HACIA ADENTRO de la caja de afuera:
 *
 * ```
 *   0 → 1 aire   banda OSCURA   sobre el aire, o sea sobre el blanco del panel
 *   1 → 2 aires  banda CLARA    sobre el borde negro de la baldosa y el arranque de su color
 * ```
 *
 * **Y por eso son razones y no dos numeros de 2 px.**
 * El reparto de arriba no dice «2 px»: dice «una banda sobre el aire y la siguiente sobre la
 * baldosa», o sea que los dos numeros son el aire dicho dos veces. Con el aire vuelto
 * proporcional y estos dos clavados en 2, a celda 180 el aire mide 4,93 px y las DOS bandas
 * caen enteras adentro de el: la clara deja de pisar la baldosa, queda sobre el mismo blanco
 * que la oscura y el anillo se vuelve de un solo tono — que es exactamente el modo de falla
 * que estos dos numeros existen para evitar.
 *
 * Valen lo mismo que el aire porque el aire es la unidad del reparto: la banda clara tiene
 * que pisar la baldosa para quedar sobre el color de la pieza, que es contra lo que se la
 * eligio. Con ese reparto el anillo se ve SIEMPRE: sobre `#FFFF00` la clara desaparece pero
 * la oscura esta sobre blanco, y sobre `#0000FF` pasa lo contrario.
 *
 * ## Por que hacia adentro y no hacia afuera, que es lo obvio
 *
 * Por el orden de pintado. Los `outline` se pintan al final del contexto de apilamiento
 * —arriba de todo—, pero un `box-shadow` se pinta en la fase de fondo del elemento, y las
 * baldosas de todas las celdas son `relative`, o sea POSICIONADAS: se pintan despues. Un
 * anillo hacia afuera dejaria la banda oscura tapada por las baldosas vecinas en los
 * cuatro lados y la clara visible encima — o sea un anillo de un solo tono, que es
 * justamente lo que estos dos numeros existen para evitar. Hacia adentro no hay
 * competencia: la oscura cae en el aire, que no lo pinta nadie.
 *
 * Y de paso resuelve solo el recorte: dibujado hacia adentro el anillo no asoma ni un pixel
 * fuera de la caja, asi que no puede agrandar la region scrolleable ni quedar recortado en
 * las celdas del borde. Quien recorta es el `overflow-hidden` del contenedor raiz, y el
 * anillo no le llega.
 */
export const ANILLO_FOCO_OSCURO_RAZON = AIRE_RAZON;
export const ANILLO_FOCO_CLARO_RAZON = AIRE_RAZON;
