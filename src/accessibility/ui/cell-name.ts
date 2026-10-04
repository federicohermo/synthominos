import { EDICION } from '../../board-editing/ui/input.constants.ts';
import type { PieceKey } from '../../pieces/domain/pieces.types.ts';
import type { CellText } from '../../musical-model/ui/cell-text.types.ts';
import type { Edicion } from '../../board-editing/ui/input.types.ts';

// El ULTIMO paso, no cuantos hay: los pasos van de 0 a 4 y el nombre dice ese rango tal
// cual, sin renumerar. Es la regla que `Board.tsx` ya tiene escrita para el `#N` que
// pinta en la esquina -- "el paso va como el indice que devuelve el dominio (0..4) y sin
// renumerar: lo que se lee en la celda es exactamente lo que responden los tests y el
// `playOrder` del MCP server" -- y el nombre accesible NO puede desviarse: desde el spec
// 026 el `title` es el eco del nombre, asi que renumerar aca dejaria a la celda mostrando
// `#0` mientras el tooltip y el lector de pantalla dicen "paso 1". Dos canales diciendo
// numeros distintos del mismo dato es exactamente lo que el repo evita.
//
// Vive como constante de modulo (permitido en `components/`, a diferencia de `domain/` y
// `audio/`) para que `cellNameFor` no repita el literal sin decir por que existe.
const ULTIMO_PASO = 4;

// La coordenada dicha en voz, contada desde 1 y sin parentesis — el argumento completo
// esta en el docblock de `cellNameFor`, abajo. Vive como funcion de modulo porque la usan
// los DOS textos que salen de este archivo: el nombre de la celda y el anuncio de la
// edicion. Escrita dos veces serian dos formas de que el lector de pantalla cuente las
// filas distinto segun lo que este anunciando.
const coordenada = (x: number, y: number) => `fila ${y + 1}, columna ${x + 1}`;

/**
 * Lo que una celda OCUPADA le aporta a su nombre accesible: la pieza, si esta muteada, y
 * su `CellText` -paso y nota-.
 *
 * Ese `CellText` lo calculo `Board.tsx` para esa celda puntual, encadenando `occupantAt` +
 * `occupantCellIndex` + `cellTextFor`.
 *
 * Los tres campos viajan juntos, en un solo objeto, y no como dos parametros
 * sueltos (`occupant: PlacedPiece | null` + `cell: CellText | null`) por lo que
 * pasa si se separan: una celda ocupada SIEMPRE tiene texto -`occupantAt` ya
 * garantizo que la pieza cubre la celda, asi que `occupantCellIndex` nunca da -1-,
 * asi que "ocupada pero sin texto" no es un cuarto caso del dominio, es un cuarto
 * caso que la FIRMA inventaria por su cuenta. `cellNameFor` tendria que decidir que
 * decir ahi sin que ese estado exista nunca del otro lado, que es la misma clase de
 * problema por la que `PlacedPiece.muted` es obligatorio y no `muted?: boolean`
 * (ver su doc en `board-editing/domain/board.types.ts`): una firma mas permisiva que la
 * realidad es una rama de codigo que ningun llamador real va a ejercer, y que
 * igual hay que mantener en 100% de cobertura inventandole un test.
 */
export interface CeldaOcupada {
  readonly piece: PieceKey;
  readonly muted: boolean;
  readonly cell: CellText;
}

/**
 * El nombre accesible de una celda del tablero: lo que anuncia un lector de
 * pantalla cuando el foco entra en el `gridcell` de `Board.tsx`.
 *
 * ## Por que vive en `accessibility/ui/cell-name.ts` y no adentro de `Board.tsx`
 *
 * Mismo motivo que `cell-text.ts`, documentado ahi con el mismo detalle:
 * `react-refresh/only-export-components` prohibe que un `.tsx` exporte algo
 * ademas del componente, asi que una funcion pura escrita adentro de `Board.tsx`
 * no se puede importar desde un test y por lo tanto no se puede testear. Sacarla
 * a un `.ts` es lo unico que la deja bajo test -este archivo cubre las 96
 * orientaciones x los dos estados de muteo x la celda libre con un test de nodo,
 * sin Chromium y sin montar un solo componente.
 *
 * ## La firma: coordenada + el objeto ya armado, no `placed` de nuevo
 *
 * Recibe `x`, `y` y `CeldaOcupada | null` -lo que `Board.tsx` YA tiene calculado
 * en el punto donde hoy arma el `title`- y no `placed: PlacedPiece[]` para volver
 * a llamar `occupantAt` adentro. Repetir esa cadena aca seria la SEGUNDA copia de
 * la misma derivacion, que es exactamente el error que este repo ya saco de
 * `cellsByPlayOrder` y de `Board.tsx` (ver el doc de `cellTextFor` en
 * `cell-text.ts`): dos lugares que calculan lo mismo son dos lugares que se
 * pueden desincronizar, y el bug del `#N` reflejado vivio ahi durante un spec
 * entero sin que ningun test lo viera.
 *
 * ## El fantasma NO entra, y por que la firma alcanza para garantizarlo
 *
 * El fantasma es TRANSITORIO -depende de donde esta el cursor, no de que hay
 * colocado- y un nombre accesible que cambiara con el hover haria que el lector
 * de pantalla anunciara una celda distinta de la que realmente es: el foco no se
 * movio, pero el nombre si. El `title` de hoy si lo muestra -es un tooltip de
 * mouse, no algo que un lector de pantalla anuncie por foco- y eso se queda
 * igual; el nombre accesible no.
 *
 * La exclusion no es un `if` que el llamador tiene que acordarse de escribir: es
 * estructural. En `Board.tsx:212` el fantasma solo puebla la variable `cell`
 * (via `ghostIndex`), nunca `occ` -`occ` sale unicamente de `occupantAt(placed,
 * x, y)`, que no sabe nada del cursor-. Como `CeldaOcupada` exige los tres campos
 * juntos y `occ` es lo unico que puede dar `piece`/`muted`, no hay forma de
 * construir un `CeldaOcupada` a partir de solo el fantasma: el llamador que arme
 * el argumento con la celda del fantasma **no tiene de donde sacar el resto** sin
 * inventarlo. La celda con fantasma y sin ocupante real sigue pasando `null`, que
 * es exactamente el mismo camino que una celda libre sin fantasma -y es correcto
 * que lo sea: para el arbol de accesibilidad las dos son "todavia no hay nada
 * colocado aca".
 *
 * ## Prosa y no notacion
 *
 * `(3,2)` se lee raro -un lector de pantalla dice "parentesis, tres, coma, dos,
 * parentesis" o se lo salta entero segun el motor-, asi que fila y columna se
 * cuentan desde 1 (persona, no indice) y van en frases separadas por comas, sin
 * parentesis ni signos. Mismo idioma que el de las miniaturas en
 * `OrientationPanel.tsx` -`"F, rotación 90°, reflejada"`-: una lista de hechos
 * dicha en voz, con el estado que aplica pegado al sustantivo que modifica
 * (`"reflejada"` ahi, `"muteada"` aca) en vez de un campo aparte. La letra de la
 * pieza se dice tal cual, sin deletrearla, siguiendo el mismo precedente.
 *
 * "Libre" y no "vacía" para la celda sin ocupante: es la palabra que ya usa el
 * comentario de `Board.tsx` para la misma celda ("no se confunde con una celda
 * libre porque una celda libre no tiene texto"), y reusarla evita que el tablero
 * tenga dos nombres para el mismo estado -uno en el comentario, otro en lo que
 * anuncia el lector de pantalla-.
 *
 * El paso se dice `paso N de 4` y NO renumerado a `de 1 a 5`: el numero es el
 * indice del dominio, el mismo que la celda pinta como `#N` y el mismo que
 * responden los tests y el `playOrder` del MCP server. Desde este spec el `title`
 * es el eco del nombre, asi que renumerar aca dejaria a la celda mostrando `#0`
 * mientras el tooltip y el lector de pantalla dicen "paso 1" — dos canales
 * diciendo numeros distintos del mismo dato. El `de 4` es lo que agrega sobre el
 * `title` de hoy: sin el total, una persona que no ve el tablero no sabe si el
 * paso 4 es el ultimo o si faltan seis mas.
 */
export function cellNameFor(x: number, y: number, occupied: CeldaOcupada | null): string {
  if (!occupied) return `${coordenada(x, y)}, libre`;
  const muteo = occupied.muted ? ' muteada' : '';
  return `${coordenada(x, y)}, pieza ${occupied.piece}${muteo}, nota ${occupied.cell.note}, `
    + `paso ${occupied.cell.step} de ${ULTIMO_PASO}`;
}

/**
 * Lo que anuncia la region `aria-live` del shell despues de una edicion del tablero:
 * colocar, quitar o mutear.
 *
 * Son las tres unicas cosas que cambian el tablero.
 *
 * ## Por que sale de aca y no de una cadena escrita en `App.tsx`
 *
 * Porque el anuncio y el nombre de la celda dicen la MISMA coordenada, y escrita en dos
 * archivos son dos formas de que se desincronicen — una contando las filas desde 0 y la
 * otra desde 1, o una diciendo `(3,2)` y la otra "fila 3, columna 4". Las dos salen de
 * `coordenada`, arriba. Y por lo mismo que `cellNameFor` no vive adentro de `Board.tsx`:
 * en un `.tsx` esto no se puede exportar, o sea que no se puede testear, y lo que un
 * lector de pantalla va a decir es exactamente el tipo de decision que se rompe en
 * silencio.
 *
 * ## `edicion` es la MISMA union que decide el gesto
 *
 * Es `Edicion`, la que devuelve `accionDeClick` — no un verbo suelto. Asi el anuncio no
 * puede describir una edicion que el tablero no hace, y una quinta edicion futura da
 * error de tipo aca en vez de quedarse muda. Las cuatro ramas de `EDICION` caen en tres
 * frases: `colocar` y `colocarMuteada` comparten la suya porque lo que las separa —si la
 * pieza suena— ya lo dice `muteada`.
 *
 * ## `muteada` es el estado en el que la pieza QUEDA
 *
 * No el que tenia. Del lado del shell sale de la misma variable que se guarda en
 * `PlacedPiece.muted`, asi que el anuncio no puede prometer un muteo distinto del que el
 * tablero acaba de aplicar. `quitar` no lo dice —la pieza se fue, y lo que hace falta
 * saber es cual y de donde—, pero igual lo recibe: pedirle al llamador que decida
 * cuando el campo importa seria mover esta misma decision al shell, que es de donde este
 * archivo la vino a sacar.
 *
 * ## "con sonido" y no "desmuteada"
 *
 * Es lo que se recupera, no la deshecha de una operacion: la palabra tiene que decir en
 * que estado quedo la pieza, no que boton se apreto. Mismo criterio que "libre" arriba —
 * el nombre del estado, no el del gesto.
 */
export function anuncioDeEdicion(
  edicion: Edicion, piece: PieceKey, x: number, y: number, muteada: boolean,
): string {
  if (edicion === EDICION.quitar) return `pieza ${piece} quitada de ${coordenada(x, y)}`;
  if (edicion === EDICION.mutear) {
    return `pieza ${piece} ${muteada ? 'muteada' : 'con sonido'} en ${coordenada(x, y)}`;
  }
  return `pieza ${piece} colocada${muteada ? ' muteada' : ''} en ${coordenada(x, y)}`;
}
