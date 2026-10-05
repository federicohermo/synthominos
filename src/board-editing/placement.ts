import type { Cell } from '../pieces/transform.ts';
import type { PieceKey } from '../pieces/pieces.ts';

/**
 * The rules of the board: where a piece lands, and whether a move is legal.
 *
 * Every function receives everything as a parameter instead of closing over state. That is
 * what makes them testable, and what spares the MCP server a second copy of the placement
 * rule. The route between two cells belongs to the circuit: `circuit/routing.ts`.
 *
 * **That includes the size of the board.** This file imports no dimension: the dimensions
 * arrive as `Dims` because they come from the viewport, and only the UI sees the viewport.
 */

/**
 * El tablero mas chico que tiene sentido, en celdas.
 *
 * El tamano del tablero **no es una constante**: sale del viewport y
 * llega como parametro (`Dims`). Lo que queda fijo son estos dos bordes.
 *
 * 5 x 5 y no 4 x 4 porque 5 es el lado de la caja mas chica que contiene cualquier
 * pentomino en cualquiera de sus 8 orientaciones —el maximo en un eje lo pone sola la
 * `I`, 5x1 acostada y 1x5 parada—, o sea que abajo de 5 hay piezas que no entran en
 * ninguna posicion. Es el mismo argumento que `MINI_BOX` en `piece-mini.ts`, sobre otro
 * dibujo: aquel es la caja donde se dibuja la miniatura y este es el tablero, y coinciden
 * porque los dos tienen que contener a la `I`.
 *
 * Es un piso duro: en un viewport donde 5 celdas de 73 px no entren, la que se achica es
 * la celda. El tablero nunca tiene menos de 5 x 5 — sin eso hay piezas de la paleta que no
 * se podrian colocar en ningun lado, que es peor que una celda chica.
 */
export const GRID_MIN: Dims = { w: 5, h: 5 };

/**
 * El tablero de siempre: 10 x 6.
 *
 * No es lo que la app dibuja —eso lo decide el viewport— pero sigue
 * siendo el tablero de REFERENCIA, y por eso vive acá y no como dos numeros sueltos en
 * cada llamador: lo usan el MCP server cuando la consulta no dice dimensiones y los tests
 * del dominio que no tienen ninguna razon para inventar un tamano. Que sea el mismo par
 * historico es lo que hace que una consulta a `simulate_board` escrita cuando el tablero
 * era fijo siga dando exactamente lo mismo.
 */
export const GRID_DEFAULT: Dims = { w: 10, h: 6 };

/**
 * Cuantas piezas acepta el tablero, sea del tamano que sea.
 *
 * **Es una regla y no una consecuencia del AREA.** En el tablero de referencia el area
 * alcanza para deducirlo —60 celdas y 5 por pentomino son 12— pero con el tablero saliendo
 * del viewport no alcanza: 1920 x 1080 dan 390 celdas, o sea 78 piezas. `shortestCircuit`
 * da 12 por sentadas en su docblock, asi que el limite tiene que estar escrito, y esta
 * escrito aca.
 *
 * Y 78 no es un tablero mas grande: es otro problema. El circuito se resuelve con
 * Held-Karp **exacto**, `O(n^2 * 2^n)`, y eso esta elegido a proposito —el greedy da
 * recorridos +20,1 % en promedio y +79 % en el peor caso, y ademas no es determinista
 * entre tableros iguales—. Medido sobre 26 x 14 = 364 celdas, con la cache de distancias
 * por destino puesta:
 *
 * ```
 * piezas   buildSequence
 *   12        3,1 ms
 *   13        3,7 ms
 *   14        5,6 ms
 *   15        9,7 ms
 *   16       18,6 ms
 * ```
 *
 * Duplica por pieza, que es lo que dice `2^n`. No hay optimizacion que compre 78: son 66
 * duplicaciones.
 *
 * Asi que el tope se escribe, y vale **exactamente lo que hoy es cierto**. No recorta
 * ningun tablero que se pueda armar hoy: lo que cambia es quien lo garantiza.
 */
export const MAX_PIEZAS = 12;

/**
 * Una pieza ya colocada en el tablero, con sus celdas en coordenadas de tablero.
 *
 * NO lleva las notas. Las llevaba —`notes: number[]`, poblado al colocar— y era un dato
 * DERIVABLE guardado en el estado: `arpeggioFor(piece, rotation, mirror, regimen)` da exactamente
 * lo mismo, asi que el campo solo agregaba la posibilidad de que se contradijeran. Nada
 * impedia construir una pieza con `rotation: 1` y las notas de la rotacion 0, y ahi el
 * tablero —que ya derivaba, ver `Board.tsx`— y el motor —que leia el campo— decian cosas
 * distintas.
 *
 * `cells` en cambio NO es derivable de las demas: depende de donde se hizo click, que es
 * informacion que solo existe en el gesto.
 */
export interface PlacedPiece {
  id: string;
  piece: PieceKey;
  rotation: number;
  mirror: boolean;
  cells: Cell[];
  /**
   * La pieza ocupa su lugar y su tiempo en el circuito pero NO suena sus notas.
   *
   * Donde habria ido su arpegio van cinco clicks, uno por celda, en los mismos offsets.
   * El orden de visita, los offsets del resto y el largo del ciclo no cambian.
   *
   * Va acá por el mismo argumento que `cells` y no por el que retiró a `notes`: **no es
   * derivable**. No sale de la pieza, ni de la rotacion, ni de las celdas — sale de un
   * gesto, que es informacion que solo existe en el click.
   *
   * **Obligatorio y no `muted?: boolean`.** Opcional daria dos formas de decir "no
   * muteada" —`false` y ausente— y este repo ya pago ese error una vez: en `Click.note`
   * la AUSENCIA del campo significa algo distinto de un `undefined` explicito, y hay un
   * ternario puesto a proposito en `proyectarAlMotor` (`playback/engine-bridge.ts`) para no
   * producir el tercer estado — y que tiene test. Acá no hay nada que la
   * ausencia pueda significar, asi que no se le da la
   * oportunidad.
   */
  muted: boolean;
}

/**
 * Cuánto mide el tablero, en celdas.
 *
 * **Es un parámetro y no una constante.** El tablero medía `GRID_W × GRID_H` = 10 × 6 y las
 * funciones del dominio lo leían de una constante; hoy mide lo que entra
 * en la pantalla —26 × 15 en un escritorio de 1920 × 1080— y quien lo sabe es la capa que
 * ve el viewport, que es la UI. El dominio no puede leerlo de ningún lado: se lo
 * tienen que decir.
 *
 * Lo reciben las tres funciones que miran el tablero como un todo —`isValid`,
 * `routeBetween` y `buildSequence`— y de ahí baja solo. `music.ts`, `transform.ts` e
 * `invariants.ts` no lo necesitan: una pieza y su arpegio no dependen de dónde termina el
 * tablero.
 *
 * `readonly` en los dos campos por la regla de siempre: nunca mutar lo que ya se entregó a
 * React, y esto viaja como prop.
 */
export interface Dims {
  readonly w: number;
  readonly h: number;
}

/**
 * Celdas que ocuparia `shape` si su celda de agarre cae en `(x, y)`.
 *
 * Recibe `shape` ya transformada y `anchorIndex` en vez de calcularlos: quien
 * llama tiene la forma memoizada, asi que no hay que volver a rotar en cada hover.
 * El ancla sale por indice y no por busqueda gracias al invariante del orden del
 * array (ver `transform.ts`).
 *
 * `shape` entra `readonly` justamente porque viene memoizada: mutarla seria mutar
 * un valor que React ya entrego.
 */
export function cellsAt(shape: readonly Cell[], anchorIndex: number, x: number, y: number): Cell[] {
  const [ax, ay] = shape[anchorIndex];
  const ox = x - ax;
  const oy = y - ay;
  return shape.map(([cx, cy]): Cell => [cx + ox, cy + oy]);
}

/**
 * Dentro del tablero y sin solaparse con lo ya colocado.
 *
 * **`placed` tiene que ser el tablero ENTERO y no lo que se ve.** El
 * tablero se achica con la ventana y las piezas que dejan de entrar se guardan sin
 * dibujarse; una de esas puede tener celdas adentro de la grilla nueva —«no entra entera»
 * no es «esta toda afuera»— y colocar encima dejaria dos piezas solapadas en cuanto la
 * ventana crezca. El filtro de lo visible es `cabeEn`, aca abajo; esta funcion mira todo.
 */
export function isValid(cells: Cell[], placed: readonly PlacedPiece[], dims: Dims): boolean {
  if (cells.some(([x, y]) => x < 0 || y < 0 || x >= dims.w || y >= dims.h)) return false;
  for (const p of placed) {
    const set = new Set(p.cells.map(([x, y]) => `${x},${y}`));
    if (cells.some(([x, y]) => set.has(`${x},${y}`))) return false;
  }
  return true;
}

/**
 * Si la pieza entra ENTERA en un tablero de `dims`.
 *
 * Es el otro lado del parrafo de `isValid`, y hace falta porque el tablero
 * cambia de tamano con la ventana: la pieza que deja de entrar no se borra —el repo no
 * tiene deshacer, y arrastrar el borde de una ventana no es un gesto de edicion— sino que
 * se guarda entera y deja de dibujarse, de sonar y de recibir clicks, y vuelve igual
 * cuando hay lugar otra vez.
 *
 * **Entera y no en parte**: una pieza con tres celdas adentro y dos afuera tampoco entra.
 * Media pieza pintada seria una pieza que el tablero muestra y el circuito no visita, y
 * lo que se ve y lo que suena no pueden discrepar.
 *
 * Se implementa sobre `isValid` con el tablero vacio y no repitiendo los cuatro limites:
 * «entra en el tablero» es exactamente la primera mitad de «la jugada es legal», y
 * escribirla dos veces es la forma de que un dia digan cosas distintas. Es tambien lo que
 * `mcp-server/src/tools/simulateBoard.ts` ya hacia para distinguir `fuera-del-tablero` de
 * un choque.
 *
 * Vive en un módulo y no adentro de `App.tsx` por la regla de `.claude/rules/ui.md` —el
 * shell no lleva funciones puras—: aca se testea, y ahi no podria exportarse.
 */
export function cabeEn(p: PlacedPiece, dims: Dims): boolean {
  return isValid(p.cells, [], dims);
}

/**
 * La pieza que ocupa `(x, y)`, o null.
 *
 * Recorre todas las piezas y todas sus celdas, y eso esta MEDIDO porque hacia falta
 * saber si aguantaba que el tablero se
 * dibujara al ritmo del intervalo: con las 12 piezas colocadas —el maximo, y el peor
 * caso porque no queda ninguna celda vacia que corte antes— un render entero del
 * tablero de referencia son 60 llamadas y **4,1 us** en total (p95 7,4 us), o sea
 * 0,07 us por celda y el 0,02 % de un cuadro de 16,7 ms. A 160 bpm el intervalo mide
 * 93,75 ms: aunque se la llamara una vez por celda y por intervalo, sobraria por cuatro
 * ordenes de magnitud.
 *
 * **El costo es por CELDA, asi que un tablero mas grande lo escala y no lo cambia.** El
 * tope de piezas sigue siendo 12 (`MAX_PIEZAS`), que es lo que fija el peor caso de cada
 * llamada; lo que crece es cuantas veces se llama: 390 celdas en un escritorio de
 * 1920 x 1080 son 6,5 veces las 60 de arriba, o sea ~27 us por render y el 0,16 % del
 * cuadro. Sigue sobrando por tres ordenes.
 *
 * O sea que un indice por celda no hace falta, y el que dibuja a
 * ritmo de intervalo —la cabeza lectora— igual no la usa: lee la tabla por
 * offset de `playback/route-source.ts`, y no por costo sino porque tiene que dibujar
 * la ruta que suena y no la del tablero de ahora.
 */
export function occupantAt(placed: readonly PlacedPiece[], x: number, y: number): PlacedPiece | null {
  for (const p of placed) {
    if (p.cells.some(([cx, cy]) => cx === x && cy === y)) return p;
  }
  return null;
}

/**
 * Indice de `(x, y)` dentro de `p.cells`, o `-1` si `p` no ocupa esa celda.
 *
 * Hermana de `occupantAt` y no un cambio de su firma: `occupantAt` responde QUE
 * pieza, esta responde QUE celda de esa pieza, y separarlas deja intactos a los
 * que solo necesitan lo primero.
 *
 * Existe para que la derivacion celda→nota no viva adentro de `Board.tsx`. El
 * argumento no es de costo —cinco comparaciones por celda es irrelevante, midiera el
 * tablero 60 celdas o 390— sino de cobertura: cuando se escribio,
 * la UI no tenia tests, asi que un `findIndex` ahi adentro dejaba verificado solo
 * por captura el unico paso del que depende lo que se ve, y una captura no distingue un
 * mapeo correcto de uno corrido en uno. Hoy la capa tiene tests,
 * pero la pura sigue siendo mas barata de agotar que un render.
 *
 * El indice que devuelve sirve directamente contra la forma CANONICA gracias al
 * invariante del orden del array: `cells` se construye con `cellsAt`, que es un
 * `map`, asi que la celda `k` del tablero sigue siendo la celda `k` de `SHAPES`.
 */
export function occupantCellIndex(p: PlacedPiece, x: number, y: number): number {
  return p.cells.findIndex(([cx, cy]) => cx === x && cy === y);
}
