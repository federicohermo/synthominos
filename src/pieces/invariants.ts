import type { Cell } from './transform.ts';
import type { PieceKey } from './pieces.ts';
import { rotate90, normalize, rotateN, reflect } from './transform.ts';
import {
  notesForRotation,
  BASE_MAP,
  CHROMATIC,
  DEFAULT_OCTAVE,
  NOTES_PER_PIECE,
  REGIMEN,
} from '../musical-model/music.ts';
import { SHAPES, ANCHOR_INDEX, CELLS_PER_PIECE } from './pieces.ts';
import type { RegimenDeRotacion } from '../musical-model/music.ts';

/**
 * Los siete chequeos del modelo.
 *
 * El espacio son las 96 combinaciones de pieza x rotacion x reflexion, pero cada
 * chequeo recorre lo que le corresponde y no las 96 por inercia: `checkArrayOrder`
 * y `checkAnchors` si —son los geometricos, y la orientacion es justo lo que
 * pueden romper—, `checkNotes` las 96 (12 piezas x 4 rotaciones x 2
 * REGIMENES; el espejo sigue afuera porque solo invierte el orden),
 * `checkShapes` las 12 formas canonicas porque rotar no cambia ni la cantidad de
 * celdas ni la conexidad, `checkDistinct` y `checkLetters` tambien las 96 —necesitan
 * las 8 orientaciones de cada forma para reducirla a su clave canonica— y `checkBaseMap`
 * el conjunto una sola vez.
 *
 * Cinco de los siete miran la FORMA de cada pieza por separado —`checkBaseMap` si cruza
 * piezas, pero por su TONICA—. Los otros dos son los unicos que salen de la pieza:
 * `checkDistinct` compara dos FORMAS a la vez, y por eso fue el unico capaz de ver que la
 * `Z` era la `N` reflejada; `checkLetters` compara cada forma contra una tabla EXTERNA,
 * y es el unico que puede ver un intercambio de dos letras entre si —que deja el conjunto
 * de las 12 claves intacto y por lo tanto pasa `checkDistinct`—.
 *
 * DEVUELVEN el resultado en vez de lanzar o asertar: asi los usa igual el test de
 * este modulo y la tool `check_invariants` del MCP server, que necesita responder
 * con el detalle y no morirse.
 *
 * Lo que cubren no es cosmetico. El primero —el orden del array— es el invariante
 * que CLAUDE.md marca como el mas peligroso del repo: romperlo descoloca las
 * piezas y desfasa los loops **sin producir ningun error visible**.
 */

/**
 * Las cuatro rotaciones que recorre `checkNotes` y `checkArrayOrder`.
 *
 * Se escriben y no se derivan de un `ROTATION_COUNT`: no hay tal constante en el repo, y
 * el numero 4 no es un parametro sino la aritmetica del cuarto de vuelta —`rotate90`
 * aplicada cuatro veces es la identidad—. Lo que si es un parametro son los REGIMENES, y
 * por eso esos salen de `Object.values(REGIMEN)` en el modulo: agregar un tercero tiene
 * que meterlo solo en el invariante, y agregar una quinta rotacion no existe.
 *
 * Los indices, y no los grados: es lo que reciben `rotateN` y `notesForRotation`.
 */
export const ROTATIONS = [0, 1, 2, 3];

/**
 * Los 12 pentominos por su letra, escritos DESDE LA DEFINICION ESTANDAR y no derivados
 * de `SHAPES`.
 *
 * Que sea una referencia EXTERNA es la unica razon por la que sirve: `checkLetters` la
 * compara contra `SHAPES`, y una tabla derivada de `SHAPES` se verificaria contra si
 * misma. Es la diferencia entre atrapar el bug de la `Z` —que era la `N` reflejada y
 * vivio desde el primer commit— y no verlo, que es lo que les paso a los cinco chequeos
 * anteriores a `checkDistinct`.
 *
 * Salen del nomenclador de Golomb/Conway, el que nombra cada pentomino por la letra a la
 * que se parece. Se copian **dibujadas** para que auditarlas no exija correr nada: cada
 * celda es `[x, y]` con `y` creciendo hacia ABAJO, o sea leyendo el dibujo de arriba
 * hacia abajo.
 *
 * ```text
 *   F      I      L      N      P      T      U      V      W      X      Y      Z
 *  .FF     I      L.     .N     PP    TTT    U.U    V..    W..    .X.    .Y     ZZ.
 *  FF.     I      L.     .N     PP    .T.    UUU    V..    WW.    XXX    YY     .Z.
 *  .F.     I      L.     NN     P.    .T.           VVV    .WW    .X.    .Y     .ZZ
 *          I      LL     N.                                              .Y
 *          I
 * ```
 *
 * La QUIRALIDAD no hace falta fijarla, y por eso no se documenta cual de los dos
 * enantiomeros es cada uno: la comparacion es por clave canonica, que colapsa las 8
 * orientaciones, asi que la `L` y la `J` —o la `N` y la `S`, o la `F` y su espejo—
 * tienen la misma clave. Es lo correcto y no una concesion: la app genera en vivo las
 * otras 7 orientaciones de cada pieza, asi que `SHAPES` guarda un representante y no una
 * forma privilegiada.
 */
export const PENTOMINOS_CANONICOS: Record<PieceKey, Cell[]> = {
  F: [[1,0],[2,0],[0,1],[1,1],[1,2]],
  I: [[0,0],[0,1],[0,2],[0,3],[0,4]],
  L: [[0,0],[0,1],[0,2],[0,3],[1,3]],
  N: [[1,0],[1,1],[0,2],[1,2],[0,3]],
  P: [[0,0],[1,0],[0,1],[1,1],[0,2]],
  T: [[0,0],[1,0],[2,0],[1,1],[1,2]],
  U: [[0,0],[2,0],[0,1],[1,1],[2,1]],
  V: [[0,0],[0,1],[0,2],[1,2],[2,2]],
  W: [[0,0],[0,1],[1,1],[1,2],[2,2]],
  X: [[1,0],[0,1],[1,1],[2,1],[1,2]],
  Y: [[1,0],[0,1],[1,1],[1,2],[1,3]],
  Z: [[0,0],[1,0],[1,1],[1,2],[2,2]],
};

export interface CheckResult {
  name: string;
  ok: boolean;
  failures: string[];
}

const PIECES = Object.keys(SHAPES) as PieceKey[];
// Los dos regimenes salen de `REGIMEN` y no se listan a mano: agregar un tercero lo
// mete solo en `checkNotes` en vez de dejarlo sin invariante que lo mire.
const REGIMENES: RegimenDeRotacion[] = Object.values(REGIMEN);

/**
 * Comparacion de celdas que no distingue `-0` de `0`.
 *
 * `rotate90` cruda niega la coordenada, asi que produce `-0` cuando vale 0, y
 * tanto `toEqual` como `deepStrictEqual` distinguen `-0` de `0`. Sumar 0 los
 * colapsa: `-0 + 0` es `+0`.
 */
const sameCell = (a: Cell, b: Cell): boolean => a[0] + 0 === b[0] + 0 && a[1] + 0 === b[1] + 0;

const result = (name: string, failures: string[]): CheckResult =>
  ({ name, ok: failures.length === 0, failures });

/** Aplica a una forma la misma cadena que la UI: `rotateN`, y despues el espejo. */
function transformShape(cells: Cell[], rotation: number, mirror: boolean): Cell[] {
  const r = rotateN(cells, rotation);
  return mirror ? reflect(r) : r;
}

/**
 * Donde deberia caer cada celda, reconstruido **celda por celda**.
 *
 * Aplica las primitivas crudas —`rotate90` k veces, la negacion del espejo— y
 * normaliza UNA sola vez al final, en vez de pasar por `rotateN`/`reflect`. Es lo
 * que le da valor al chequeo: si la funcion compuesta filtrara, ordenara o
 * reagrupara celdas, esta reconstruccion no lo haria y los indices dejarian de
 * coincidir.
 *
 * Que normalizar en cada paso o solo al final de lo mismo no es casualidad: la
 * normalizacion es una traslacion, y las traslaciones conmutan con la rotacion
 * salvo por otra traslacion, que la normalizacion final absorbe.
 */
function expectedShape(cells: Cell[], rotation: number, mirror: boolean): Cell[] {
  let raw: Cell[] = cells.map(([x, y]): Cell => [x, y]);
  for (let i = 0; i < rotation; i++) raw = rotate90(raw);
  if (mirror) raw = raw.map(([x, y]): Cell => [-x, y]);
  return normalize(raw);
}

/**
 * 1. Orden del array — la celda del indice `k` despues de transformar es la imagen
 *    de la celda `k` original.
 *
 * Se verifica reconstruyendo la transformacion **celda por celda** con la misma
 * traslacion que aplico la funcion completa: si `rotateN` filtrara, ordenara o
 * reagrupara, la celda `k` dejaria de coincidir con su imagen y el chequeo daria
 * rojo. Es la unica forma de afirmar la propiedad, porque el conjunto de celdas
 * sigue siendo el mismo aunque el orden cambie.
 */
export function checkArrayOrder(): CheckResult {
  const failures: string[] = [];
  for (const p of PIECES) {
    for (const rot of ROTATIONS) {
      for (const mirror of [false, true]) {
        const got = transformShape(SHAPES[p], rot, mirror);
        const expected = expectedShape(SHAPES[p], rot, mirror);

        for (let k = 0; k < got.length; k++) {
          if (!sameCell(got[k], expected[k])) {
            failures.push(
              `${p} rot${rot}${mirror ? ' mirror' : ''}: celda ${k} es ` +
              `(${got[k]}) y deberia ser (${expected[k]})`,
            );
          }
        }
      }
    }
  }
  return result('orden del array', failures);
}

/**
 * 2. Ancla — `ANCHOR_INDEX[p]` esta en rango y su celda transformada es la imagen
 *    del ancla original.
 *
 * Es corolario del chequeo 1, y se verifica aparte a proposito: es la propiedad de
 * la que depende que el click caiga donde el usuario apunto, porque el ancla viaja
 * como INDICE y se resuelve contra `PlacedPiece.cells`.
 */
export function checkAnchors(): CheckResult {
  const failures: string[] = [];
  for (const p of PIECES) {
    const idx = ANCHOR_INDEX[p];
    if (!Number.isInteger(idx) || idx < 0 || idx >= SHAPES[p].length) {
      failures.push(`${p}: ANCHOR_INDEX ${idx} fuera de [0, ${SHAPES[p].length})`);
      continue;
    }
    for (const rot of ROTATIONS) {
      for (const mirror of [false, true]) {
        const got = transformShape(SHAPES[p], rot, mirror)[idx];
        const expected = expectedShape(SHAPES[p], rot, mirror)[idx];

        if (!sameCell(got, expected)) {
          failures.push(
            `${p} rot${rot}${mirror ? ' mirror' : ''}: el ancla quedo en ` +
            `(${got}) y deberia estar en (${expected})`,
          );
        }
      }
    }
  }
  return result('ancla', failures);
}

/** 3. Formas — 5 celdas, sin repetidas, conexas por lados. */
export function checkShapes(): CheckResult {
  const failures: string[] = [];
  for (const p of PIECES) {
    const cells = SHAPES[p];
    if (cells.length !== CELLS_PER_PIECE) {
      failures.push(`${p}: tiene ${cells.length} celdas y deberia tener ${CELLS_PER_PIECE}`);
    }

    const keys = cells.map(([x, y]) => `${x},${y}`);
    if (new Set(keys).size !== keys.length) failures.push(`${p}: tiene celdas repetidas`);

    if (!isConnected(cells)) failures.push(`${p}: no es conexa por lados`);
  }
  return result('formas', failures);
}

/** Recorrido en anchura por vecindad de 4: las diagonales no conectan un pentomino. */
function isConnected(cells: Cell[]): boolean {
  if (cells.length === 0) return true;
  const keys = new Set(cells.map(([x, y]) => `${x},${y}`));
  const seen = new Set<string>([`${cells[0][0]},${cells[0][1]}`]);
  const queue: Cell[] = [cells[0]];

  while (queue.length > 0) {
    // El `!` va con su motivo, que es la regla del repo: la condicion
    // del `while` de arriba ya garantiza la cola no vacia y TypeScript no puede
    // relacionar `length` con lo que devuelve `shift()`. La otra salida —un `if (!c)
    // continue`— seria una rama inalcanzable, o sea una linea sin cubrir contra el
    // umbral 100.
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (keys.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push([x + dx, y + dy]);
      }
    }
  }
  return seen.size === keys.size;
}

/** 4. `BASE_MAP` — biyectiva sobre las 12 clases de altura. */
export function checkBaseMap(): CheckResult {
  const failures: string[] = [];
  const pcs = PIECES.map(p => BASE_MAP[p]);

  if (pcs.length !== CHROMATIC.length) {
    failures.push(`hay ${pcs.length} piezas para ${CHROMATIC.length} clases de altura`);
  }
  if (new Set(pcs).size !== pcs.length) failures.push('dos piezas comparten tonica');
  for (const p of PIECES) {
    const pc = BASE_MAP[p];
    if (!Number.isInteger(pc) || pc < 0 || pc >= CHROMATIC.length) {
      failures.push(`${p}: tonica ${pc} fuera de [0, ${CHROMATIC.length})`);
    }
  }
  return result('BASE_MAP', failures);
}

/**
 * 5. Notas — 5 distintas ANTES del retrogrado, tantas como celdas tiene una pieza, y
 *    en el orden que su REGIMEN garantiza.
 *
 * Lo del medio vivio un tiempo solo en un comentario: desde que
 * `degreeByCellIndex` empareja las dos listas por indice, `NOTES_PER_PIECE` y
 * `CELLS_PER_PIECE` pasaron de coincidir a TENER que coincidir. Sin este chequeo
 * una formula de 4 notas con `NOTES_PER_PIECE = 4` pasaba los cinco invariantes
 * que habia entonces —hoy son siete— y todos los tests, y la celda de grado 4
 * renderizaba `undefinedNaN` —
 * `midiName(undefined)` no explota, devuelve basura.
 *
 * ## Por que el chequeo de orden esta PARTIDO por regimen
 *
 * Con un solo regimen este chequeo exigia ascendente estricto sobre las 48 combinaciones, y
 * eso resulto ser una propiedad de `escala` y no del modelo: las cuatro formulas son
 * crecientes, pero correr el arpegio ciclicamente mete un descenso por diseno. Medido,
 * el ascendente estricto falla en **36 de las 48** combinaciones de `orden`, asi que
 * extenderlo entero a las 96 dejaria `check_invariants` en rojo POR DISENO — y un
 * invariante que falla por diseno se termina apagando entero, que es peor que no
 * tenerlo.
 *
 * En `orden` el chequeo equivalente y mas fuerte es que el arpegio SEA una permutacion
 * ciclica del de rotacion 0: implica lo mismo que implicaba el ascendente —las cinco
 * notas, ninguna repetida— y ata ademas el corrimiento, que es lo que este regimen
 * introduce. Sigue atrapando el caso que el invariante existe para atrapar: un
 * corrimiento mal escrito que deja un hueco y lo pinta como `undefinedNaN`.
 *
 * Lo que vale en los dos —`length` y "sin repetidas"— se queda compartido.
 */
export function checkNotes(): CheckResult {
  const failures: string[] = [];
  // Los dos son literales (`5`), asi que TypeScript sabe que la comparacion es falsa y
  // adentro del `if` los estrecha a `never`. El chequeo NO sobra —existe para el dia en
  // que alguien cambie uno de los dos, que es cuando el modelo se rompe sin ruido— pero
  // interpolar un `never` es lo unico que `restrict-template-expressions` no perdona, con
  // razon: dice que ese texto no se puede producir nunca. Leerlos por una variable
  // `number` devuelve el `if` a ser una comparacion de numeros y el mensaje a ser
  // alcanzable.
  const notas: number = NOTES_PER_PIECE;
  const celdas: number = CELLS_PER_PIECE;
  if (notas !== celdas) {
    failures.push(
      `NOTES_PER_PIECE (${notas}) y CELLS_PER_PIECE (${celdas}) ` +
      'tienen que ser iguales: cada celda dispara su nota',
    );
  }
  for (const p of PIECES) {
    for (const regimen of REGIMENES) {
      // El arpegio de rotacion 0, que en `orden` es la referencia del corrimiento. Se
      // pide una vez por pieza y no una por rotacion: es el mismo en las cuatro.
      const referencia = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 0, regimen);

      // D2, y NO es redundante con el corrimiento de abajo: ese chequeo es RELATIVO a la
      // rotacion 0, asi que un corrimiento uniforme —`rot + 1` en vez de `rot`— mueve la
      // referencia junto con el resto y pasa invisible. Medido: la mutacion `(j + rot + 1)`
      // en `notesForRotation` deja `checkNotes` en verde sin este ancla. Lo que lo fija es
      // que la rotacion 0 de `orden` sea la pentatonica mayor de la tonica, o sea la de
      // `escala` — que es ademas la propiedad que hace auditable comparar los dos.
      if (regimen === REGIMEN.orden) {
        const enEscala = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 0, REGIMEN.escala);
        if (referencia.join() !== enEscala.join()) {
          failures.push(
            `${p} rot0: los dos regimenes tienen que dar lo mismo a rotacion 0 ` +
            `(escala ${enEscala.join(',')} vs orden ${referencia.join(',')})`,
          );
        }
      }

      for (const rot of ROTATIONS) {
        const ns = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, regimen);
        if (ns.length !== NOTES_PER_PIECE) {
          failures.push(`${p} rot${rot} [${regimen}]: ${ns.length} notas y deberian ser ${NOTES_PER_PIECE}`);
        }
        if (new Set(ns).size !== ns.length) failures.push(`${p} rot${rot} [${regimen}]: tiene notas repetidas`);

        if (regimen === REGIMEN.escala) {
          for (let i = 1; i < ns.length; i++) {
            if (ns[i] <= ns[i - 1]) {
              failures.push(`${p} rot${rot} [${regimen}]: la nota ${i} (${ns[i]}) no supera a la anterior (${ns[i - 1]})`);
            }
          }
        } else {
          // Se BUSCA el desplazamiento en vez de darlo por sabido, y despues se lo
          // compara contra `rot`: asi el chequeo verifica las dos cosas por separado
          // —que sea una permutacion ciclica, y que el corrimiento sea el pedido— en
          // vez de recalcular el arpegio y compararlo consigo mismo, que no verifica
          // nada.
          const desplazamiento = referencia.indexOf(ns[0]);
          if (desplazamiento < 0) {
            failures.push(`${p} rot${rot} [${regimen}]: arranca en ${ns[0]}, que no esta en el arpegio de rotacion 0`);
          } else {
            for (let i = 0; i < ns.length; i++) {
              const esperada = referencia[(desplazamiento + i) % referencia.length];
              if (ns[i] !== esperada) {
                failures.push(`${p} rot${rot} [${regimen}]: la nota ${i} (${ns[i]}) rompe la permutacion ciclica, deberia ser ${esperada}`);
              }
            }
            const pedido = rot % referencia.length;
            if (desplazamiento !== pedido) {
              failures.push(`${p} rot${rot} [${regimen}]: corrido ${desplazamiento} posiciones y deberian ser ${pedido}`);
            }
          }
        }
      }
    }
  }
  return result('notas', failures);
}

/**
 * Clave canonica de una forma: la menor de sus 8 orientaciones, serializada.
 *
 * Ordena las celdas antes de unirlas porque sus dos consumidores —`checkDistinct` y
 * `checkLetters`— miran el CONJUNTO y no el orden —de ese se ocupa `checkArrayOrder`—,
 * y suma 0 a cada coordenada por lo mismo que `sameCell`: `rotate90` produce `-0`, y
 * `-0` no serializa igual que `0`.
 *
 * Sigue sin exportarse a proposito: los dos chequeos que la usan viven en este modulo,
 * y una segunda copia de esta logica afuera se desincronizaria.
 */
function canonicalKey(cells: Cell[]): string {
  const variantes: string[] = [];
  for (const rot of ROTATIONS) {
    for (const mirror of [false, true]) {
      const t = transformShape(cells, rot, mirror);
      variantes.push(t.map(([x, y]) => `${x + 0},${y + 0}`).sort().join(' '));
    }
  }
  return variantes.sort()[0];
}

/**
 * 6. Piezas distintas — las 12 formas son 12 pentominos DISTINTOS, hasta rotacion y
 *    reflexion.
 *
 * Existe porque su ausencia costo un bug que vivio desde el primer commit: la `Z`
 * era `[[0,1],[1,1],[1,0],[2,0],[3,0]]`, o sea la `N` reflejada. Pasaba `checkShapes`
 * —cinco celdas, sin repetir, conexa— y pasaba los otros cuatro, porque ninguno compara
 * dos FORMAS: el unico que cruza piezas es `checkBaseMap`, y las cruza por su tonica,
 * que la `Z` y la `N` tienen distinta. El tablero tenia once pentominos y uno repetido,
 * y lo unico que lo delataba era mirar el dibujo.
 *
 * Se compara por clave canonica y no por pares: son 12 claves contra 66 pares, y sobre
 * todo el mensaje sale nombrando a la OTRA pieza, que es el dato que hace falta para
 * arreglarlo.
 */
export function checkDistinct(): CheckResult {
  const failures: string[] = [];
  const porClave = new Map<string, PieceKey>();

  for (const p of PIECES) {
    const clave = canonicalKey(SHAPES[p]);
    const previa = porClave.get(clave);
    if (previa === undefined) porClave.set(clave, p);
    else failures.push(`${p}: es la misma forma que ${previa} rotada o reflejada`);
  }
  return result('piezas distintas', failures);
}

/**
 * 7. Letras — cada forma es el pentomino QUE SU LETRA DICE, y no solo una distinta de
 *    las otras once.
 *
 * Es el agujero que el seguimiento del 036 dejo anotado al cerrar `checkDistinct`: una
 * `L` que fuera una `J` pasa, y un INTERCAMBIO de dos letras entre si tambien —el
 * conjunto de las 12 claves no cambia, asi que `checkDistinct` no tiene de que
 * quejarse—. Medido intercambiando `L` con `Y` en `SHAPES`: `checkDistinct` queda en
 * verde con 0 fallos y este chequeo reporta 2.
 *
 * No lo tapa la vista tampoco: la letra es lo que le da a la pieza su tonica via
 * `BASE_MAP`, asi que dos letras cruzadas suenan cruzadas, y el unico sintoma es que la
 * pieza que se ve como `L` toca la nota de la `Y`.
 *
 * Se compara contra `PENTOMINOS_CANONICOS`, que esta escrita desde el nomenclador
 * estandar: si la tabla saliera de `SHAPES`, el chequeo se verificaria contra si mismo.
 * Y se compara con `canonicalKey` en vez de con una segunda copia de esa logica, que se
 * desincronizaria — que es exactamente la familia de bug que este archivo persigue. La
 * degeneracion de `canonicalKey` no es un punto ciego compartido: una clave que
 * colapsara formas distintas deja este chequeo en verde pero pone a `checkDistinct` en
 * rojo, porque las 12 pasarian a compartir clave.
 */
export function checkLetters(): CheckResult {
  const failures: string[] = [];
  for (const p of PIECES) {
    const esperada = canonicalKey(PENTOMINOS_CANONICOS[p]);
    const tiene = canonicalKey(SHAPES[p]);
    if (tiene !== esperada) {
      // El mensaje nombra la letra que la forma SI es cuando esa letra existe: es el
      // dato que convierte «la Z esta mal» en «la Z es la N», que fue el bug real.
      const enRealidad = PIECES.find(otra => canonicalKey(PENTOMINOS_CANONICOS[otra]) === tiene);
      failures.push(
        `${p}: no es el pentomino ${p}, ` +
        (enRealidad === undefined ? 'ni ningun otro de los 12' : `es el ${enRealidad}`),
      );
    }
  }
  return result('letras', failures);
}

/** Los siete de una. Es lo que consume la tool `check_invariants`. */
export function checkAll(): CheckResult[] {
  return [
    checkArrayOrder(), checkAnchors(), checkShapes(), checkBaseMap(), checkNotes(),
    checkDistinct(), checkLetters(),
  ];
}
