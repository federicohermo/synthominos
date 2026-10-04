import { GRID_MIN } from '../board-editing/placement.ts';
import type { Dims } from '../board-editing/placement.ts';

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
 * Lo que hay que dibujar para llenar un viewport de `vw × vh` con celdas de unos 73 px:
 * cuántas entran y cuánto mide cada una.
 *
 * Reemplaza a `cellPxPara`, y el cambio es de qué se despeja. Aquel tenía el
 * tablero fijo en 10 × 6 y despejaba el TAMAÑO de la celda, que en un escritorio se iba a
 * 180 px; éste tiene la celda fija en 73 y despeja la CANTIDAD.
 *
 * ```
 * 1. cuántas entran al objetivo   c0 = max(GRID_MIN.w, round(vw / CELL_PX_OBJETIVO))
 *                                 r0 = max(GRID_MIN.h, round(vh / CELL_PX_OBJETIVO))
 * 2. el tamaño real               cell = min(vw / c0, vh / r0)
 * 3. y cuántas entran a ESE       cols = max(GRID_MIN.w, floor(vw / cell))
 *                                 rows = max(GRID_MIN.h, floor(vh / cell))
 * ```
 *
 * ## El paso 2 es el que garantiza que no haya scroll
 *
 * `min` de los dos ejes, igual que en el 021 y por el mismo motivo: la celda es cuadrada,
 * así que manda la dimensión más apretada. Tomar el máximo daría una grilla que desborda
 * por el otro eje, y desbordar es exactamente lo que este spec vino a sacar.
 *
 * ## El paso 3 parece redundante y no lo es
 *
 * Los dos primeros ya dan un tablero que entra, pero el eje que **no** manda puede quedar
 * con más de una celda libre cuando la ventana es muy desproporcionada: a 2000 × 300 el
 * mínimo de 5 filas fuerza una celda de 60 px y sobrarían 380 px de ancho, o sea seis
 * columnas sin usar. Recontar contra la celda real cierra eso, y sigue sin poder desbordar
 * porque `floor(vw / cell) · cell ≤ vw` por definición de `floor`. En los nueve viewports
 * reales de la tabla de `CELL_PX_OBJETIVO` este paso no cambia ningún número.
 *
 * El `+ EPS` del `floor` no es defensivo: cuando el eje que manda es el mismo que ya
 * contó —el caso normal—, `vw / cell` es exactamente `c0` en aritmética real pero puede
 * dar `25,999999996` en coma flotante, y ahí el `floor` **quita una columna de verdad**.
 *
 * ## Los mínimos son un piso duro
 *
 * `GRID_MIN` sale de `domain/`: 5 × 5 es la caja más chica donde entra cualquier pentominó
 * en cualquier orientación. Abajo de eso hay piezas de la paleta que no se podrían colocar
 * en ningún lado, así que en un viewport que no dé para 5 celdas de 73 px lo que cede es el
 * tamaño de la celda (320 × 568 → 64 px) y nunca la cantidad.
 *
 * Es una pura y vive acá y no en `use-grid.ts` por el motivo de siempre: así se testea en
 * `environment: 'node'`, sin navegador y sin fabricar un `resize`. Lo que queda del otro
 * lado es cableado —leer la caja, escribir la custom property y guardar las dimensiones—
 * y eso lo cubre el proyecto `browser`.
 */
export function grillaPara(vw: number, vh: number): { dims: Dims; cell: number } {
  const c0 = Math.max(GRID_MIN.w, Math.round(vw / CELL_PX_OBJETIVO));
  const r0 = Math.max(GRID_MIN.h, Math.round(vh / CELL_PX_OBJETIVO));
  const cell = Math.min(vw / c0, vh / r0);
  // Una caja de lado cero —el contenedor todavía sin medir, o la app dentro de un
  // `display: none`— daría una división por cero y un `NaN` que viajaría hasta el
  // `gridTemplateColumns`. Se contesta el tablero mínimo con celdas de cero: es lo que
  // corresponde dibujar en una caja sin tamaño, y en cuanto la caja mida algo el `resize`
  // vuelve a pasar por acá.
  if (cell <= 0) return { dims: GRID_MIN, cell: 0 };
  const EPS = 1e-9;
  return {
    dims: {
      w: Math.max(GRID_MIN.w, Math.floor(vw / cell + EPS)),
      h: Math.max(GRID_MIN.h, Math.floor(vh / cell + EPS)),
    },
    cell,
  };
}
