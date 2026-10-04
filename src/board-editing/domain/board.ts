import type { Cell } from '../../pieces/domain/transform.types.ts';
import type { PlacedPiece, Dims } from './board.types.ts';

/**
 * The rules of the board: where a piece lands, and whether a move is legal.
 *
 * Every function receives everything as a parameter instead of closing over state. That is
 * what makes them testable, and what spares the MCP server a second copy of the placement
 * rule. The route between two cells belongs to the circuit: `circuit/domain/routing.ts`.
 *
 * **That includes the size of the board.** This file imports no dimension: the dimensions
 * arrive as `Dims` because they come from the viewport, and only `ui/` sees the viewport.
 */

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
 * Vive en `domain/` y no adentro de `App.tsx` por la regla de `.claude/rules/ui.md` —el
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
 * offset de `playback/ui/route-source.ts`, y no por costo sino porque tiene que dibujar
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
 * `ui/` no tenia tests, asi que un `findIndex` ahi adentro dejaba verificado solo
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
