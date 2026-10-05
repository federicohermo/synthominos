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
 * La formula vive en `components/grid-fit.ts` —donde tiene test— y quien la escribe en el
 * DOM es `components/use-grid.ts`. Todo lo que dependa del tamano de celda lee
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
 * Lo que decide el numero es la LEGIBILIDAD DE LA FORMA, y nada mas: 8 px es el mas chico
 * que la deja leer, porque con `MINI_BOX = 5` la caja mide 40 px de lado y a menos que eso
 * las piezas de tres celdas de ancho dejan de distinguirse entre si.
 *
 * **Y ese es todo el criterio, porque la caja del dock dejo de ser una restriccion.** Con el
 * chasis arrastrable el ancho del dock es la SALIDA y no la entrada: las columnas salen de
 * `columnasRectangulares` contra `REJILLA_ANCHO_TECHO_PX`, la casilla sale de este numero
 * (`CASILLA_PX` = `MINI_BOX x MINI_CELL_PX` mas el aire) y el panel mide lo que eso pida.
 * Subir este 8 agranda el dock; no lo hace desbordar.
 */
export const MINI_CELL_PX = 8;


/** Extremos del reloj de tempo, en bpm. El valor inicial es DEFAULT_BPM del motor. */
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

/**
 * El lado de la casilla de la tabla periodica, en px.
 *
 * **Derivado y no tipeado**, igual que las razones de arriba y por el mismo motivo: es la caja
 * del mini (`MINI_BOX x MINI_CELL_PX` = 40) mas el aire que la rodea. Si alguno de los dos
 * numeros de arriba cambia, la casilla lo sigue sola.
 *
 * El aire es de 4 px por lado y ahi termina la cuenta: `CASILLA_PX` = 48. Es la medida que
 * el prototipo del spec 052 midio en el DOM contra otras dos —40 y 56— y la unica que
 * conserva entera la caja de 40 px que este archivo documenta como el minimo que deja leer
 * la FORMA. Con 40 de casilla la caja tendria que achicarse; con 56 el dock se va a 252 px
 * de ancho y tapa 20 celdas en vez de 16.
 *
 * **Cuadrada, y eso es lo que reemplaza al boton de 107,8 x 65,6 de antes.** El ancho de
 * aquel boton lo decidia el `1fr` de la grilla y el alto su contenido, asi que la casilla
 * cambiaba de forma con el ancho del dock. En una tabla periodica el simbolo vive en una
 * casilla de lado fijo: es lo que hace que las doce se lean como un conjunto y no como una
 * lista.
 */
export const CASILLA_AIRE_PX = 4;
export const CASILLA_PX = MINI_BOX * MINI_CELL_PX + CASILLA_AIRE_PX * 2;

/** La separacion entre casillas de la tabla periodica, en px. Es el `gap` del prototipo medido. */
export const REJILLA_GAP_PX = 4;

/**
 * El ancho maximo de la rejilla de miniaturas, en px, y el UNICO parametro con el que se
 * elige la forma del rectangulo.
 *
 * Con el chasis arrastrable la caja dejo de medirse en celdas y paso a medirse por su
 * contenido, asi que la pregunta se dio vuelta: **las columnas son la entrada y el ancho es
 * la salida**, no al reves. Hasta aca lo contestaba `calc(var(--cell) * 2)`, que fijaba el
 * ancho y dejaba que `auto-fill` contara contra el — y contra 108 px utiles contaba UNA.
 *
 * Los anchos que pide cada cantidad, con `CASILLA_PX` = 48 y `REJILLA_GAP_PX` = 4, o sea
 * `c x 48 + (c - 1) x 4`:
 *
 * ```
 * 2 col -> 100 px      3 col -> 152 px      4 col -> 204 px
 * 6 col -> 308 px     12 col -> 620 px
 * ```
 *
 * 220 deja entrar hasta 4 y deja afuera a 6, y de ahi sale el `4 x 3`: un dock de 220 px
 * de ancho —medido en Chromium, 220 x 357 con las filas de abajo— y el contenido entero
 * visible, contra 1192 px de desborde.
 *
 * **Es la palanca entera**: subirlo a 308 da un dock de `6 x 2` sin tocar una linea de
 * `OrientationPanel`, porque quien elige es `columnasRectangulares` y no el navegador.
 */
export const REJILLA_ANCHO_TECHO_PX = 220;

/**
 * Cuanto se mueve un flotante con una flecha del teclado, en px.
 *
 * El arrastre por puntero es continuo y el del teclado no puede serlo, asi que este numero
 * es todo el compromiso: con un paso muy chico cruzar la pantalla cuesta cientos de
 * pulsaciones, y con uno muy grande el panel no se puede posicionar. A 16 px, cruzar un
 * viewport de 1536 cuesta 96 pulsaciones y el panel llega a cualquier lado con un error
 * menor al de la celda mas chica que el tablero dibuja.
 */
export const PASO_TECLADO_PX = 16;

/**
 * Cuanto de un flotante tiene que quedar SIEMPRE dentro del viewport, en px.
 *
 * Es lo que hace que el panel no se pueda perder: soltarlo en (-9999, -9999) lo deja
 * alcanzable. 48 px es mas que el alto del asa, o sea que lo que queda visible siempre
 * incluye una franja del control con el que se lo trae de vuelta.
 *
 * **En vertical el tope de arriba es 0 y no `-caja.alto + margen`, y no es simetria mal
 * hecha**: el asa vive en el BORDE SUPERIOR del chasis. Dejar que el panel suba mas alla
 * del viewport esconderia justo la franja con la que se agarra, y quedaria un panel visible
 * e inmovil — que es peor que uno perdido, porque parece que anda.
 */
export const MARGEN_VISIBLE_PX = 48;

/**
 * Cuantos px de arrastre vertical vale un bpm en el reloj de tempo.
 *
 * A 2 px por bpm, el rango entero —`TEMPO_MIN` a `TEMPO_MAX`, 100 bpm— se recorre con 200
 * px de arrastre, que entra en cualquier viewport sin soltar el puntero. El slider que
 * reemplaza medía 107,8 px para el mismo rango, o sea 0,93 bpm por px: casi el doble de
 * sensible, y con el numero saltando de a uno cada pixel.
 */
export const ARRASTRE_PX_POR_BPM = 2;

/** El `p-2` del chasis, en px. Sale de la clase de Tailwind y esta acá para que el ancho del dock de `drag.ts` lo lea. */
export const PANEL_PADDING_PX = 8;

/** La separacion inicial de un flotante contra el borde de la pantalla, en px. */
export const MARGEN_INICIAL_PX = 8;

/**
 * La caja de la franja de Senal, en celdas del tablero: tres de ancho y, abierta, una de alto.
 *
 * Una sola copia porque la leen dos: la caja que `App.tsx` le pasa al chasis y la posicion
 * inicial de `drag.ts`, que la apoya sobre el borde de abajo. Escrito dos veces, el alto se
 * desincroniza sin que nada falle: restar dos celdas en vez de una deja la franja a 84 px
 * del borde, medido.
 */
export const SENAL_ANCHO_CELDAS = 3;
export const SENAL_ALTO_CELDAS = 1;
