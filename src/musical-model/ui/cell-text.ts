import { degreeByCellIndex, playOrderByCellIndex, notesForRotation, midiName } from '../domain/music.ts';
import { SHAPES } from '../../pieces/domain/pieces.constants.ts';
import { BASE_MAP, DEFAULT_OCTAVE } from '../domain/music.constants.ts';
import type { PieceKey } from '../../pieces/domain/pieces.types.ts';
import type { RegimenDeRotacion } from '../domain/music.types.ts';
import type { CellText } from './cell-text.types.ts';

// El memo de `cellTextFor`, explicado en su doc: 192 entradas como maximo desde el spec
// 017 —96 orientaciones x 2 regimenes—, y una por orientacion en vez de una por render.
// Modulo y no componente a proposito.
const memo = new Map<string, readonly CellText[]>();

/**
 * Que dice cada celda de una orientacion: su nota y su paso, POR INDICE sobre la forma
 * canonica.
 *
 * El elemento `k` corresponde a `SHAPES[piece][k]`, y por lo tanto a la celda `k` de una
 * pieza ya rotada, reflejada y trasladada.
 *
 * ## Por que es un modulo y no una funcion adentro de `Board.tsx`
 *
 * Porque es donde vivio el bug. El `#N` de la celda se derivaba del GRADO, que es la
 * respuesta correcta a "que nota tiene esta" y la equivocada a "cuando suena esta":
 * en las 48 orientaciones reflejadas la cabeza lectora entraba por el `#4` y contaba
 * hacia atras. Adentro de un `.tsx` esa derivacion no se podia testear —
 * `react-refresh/only-export-components` le prohibe al archivo exportar algo que no
 * sea el componente—, asi que el unico test posible era el de las puras del dominio,
 * que estaban bien: `playOrderByCellIndex` puede ser perfecta y el componente pedirle
 * igual el otro numero. Es el mismo movimiento con el que el dominio salio de
 * `App.tsx`, y la misma razon por la que `route-source.ts` no vive en `Playhead.tsx`.
 *
 * ## Las dos parejas, y por que son dos llamadas al dominio y no una
 *
 * - El PASO decide el NUMERO: `playOrderByCellIndex(forma, mirror)`.
 * - El GRADO decide la NOTA: `notesForRotation(...)[grado]`, el arpegio ASCENDENTE.
 *
 * Cruzarlas compila y suena espejado. `arp` es el ascendente, asi que `arp[paso]` da
 * la nota reflejada en toda pieza con `mirror`; la otra mezcla —numerar por grado—
 * es exactamente el bug que este modulo existe para dejar bajo test.
 *
 * ## El memo
 *
 * `degreeByCellIndex` ordena, hay una llamada por celda y por render —eran 60 cuando se
 * escribio y hoy son hasta 390 en un escritorio, o sea que el memo cuenta
 * mas— y hay un render por movimiento del cursor. El dominio es CERRADO y chico —12 piezas x 4 rotaciones x 2
 * reflexiones x 2 regimenes son 192 entradas—, asi que el memo vive en el modulo y no
 * adentro del componente: asi sobrevive al render en vez de rearmarse en cada uno. No
 * es estado de la app —no lo puede observar nadie, y para la misma entrada devuelve
 * siempre lo mismo—, es el mismo argumento con el que `palette.constants.ts` guarda
 * `fg` en vez de recalcular la luminancia.
 *
 * La REFLEXION entra en la clave. Sin ella la primera orientacion renderizada le
 * quedaria pegada a la otra: el fantasma prometeria una numeracion y la pieza
 * colocada mostraria la inversa.
 *
 * Y el REGIMEN tambien, por la misma razon y con una consecuencia peor:
 * este `Map` es de modulo, sobrevive al render y NO lo mira ningun linter —las
 * dep arrays de los `useMemo` de `App.tsx` al menos las ve `exhaustive-deps`—. Sin el
 * regimen en la clave, cambiarlo re-derivaria el audio y dejaria las celdas mostrando
 * las notas del regimen anterior PARA SIEMPRE, que es AC7 verde en el audio y falso en
 * la pantalla.
 */
export function cellTextFor(piece: PieceKey, rotation: number, mirror: boolean, regimen: RegimenDeRotacion): readonly CellText[] {
  const key = `${piece}${rotation}${mirror}${regimen}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const arp = notesForRotation(BASE_MAP[piece], DEFAULT_OCTAVE, rotation, regimen);
  const pasos = playOrderByCellIndex(SHAPES[piece], mirror);
  const fresh: readonly CellText[] = degreeByCellIndex(SHAPES[piece])
    .map((degree, k) => ({ step: pasos[k], note: midiName(arp[degree]) }));
  memo.set(key, fresh);
  return fresh;
}
