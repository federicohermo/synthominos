import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildSequence, cellsByPlayOrder } from '../../circuit/sequence.ts';
import { cellsAt } from '../../board-editing/placement.ts';
import { rotateN, reflect } from '../../pieces/transform.ts';
import { SHAPES, ANCHOR_INDEX, CELLS_PER_PIECE } from '../../pieces/pieces.constants.ts';
import { REGIMEN } from '../../musical-model/music.constants.ts';
import { MARCA } from '../route.constants.ts';
import type { PieceKey } from '../../pieces/pieces.types.ts';
import type { PlacedPiece } from '../../board-editing/board.types.ts';
import { GRID_DEFAULT } from '../../board-editing/board.constants.ts';

/**
 * `route-source.ts` es donde vive AC9 —que la cabeza dibuje el circuito que SUENA y no
 * el que esta encolado—.
 *
 * Es una maquina de estados con dos colas, un
 * contador ajeno y un velo que se recalcula en los dos bordes. Nada de eso lo mira
 * `pnpm verify` si no se lo testea: el modulo no tiene tipos que lo aten y su unico
 * consumidor es un loop de `requestAnimationFrame`, que no corre en los tests.
 *
 * El motor va mockeado porque la unica pieza suya que este modulo usa es
 * `cycleGeneration()`, un numero. Importar el `engine.ts` real arrastraria el
 * singleton del AudioContext para leer un contador.
 *
 * El estado es de MODULO, asi que cada test lo reimporta con `vi.resetModules()`: sin
 * eso el orden de los tests seria parte del oraculo.
 */
const motor = vi.hoisted(() => ({ generacion: 0 }));
vi.mock('../engine.ts', () => ({ cycleGeneration: () => motor.generacion }));

type RouteSource = typeof import('../route-source.ts');
let rs: RouteSource;

beforeEach(async () => {
  motor.generacion = 0;
  vi.resetModules();
  rs = await import('../route-source.ts');
});

/** La cadena de colocacion completa, igual a la de `App.tsx` y a `sequence.test.ts`. */
const colocar = (piece: PieceKey, rot: number, mirror: boolean, x: number, y: number, muted = false): PlacedPiece => {
  const base = rotateN(SHAPES[piece], rot);
  const shape = mirror ? reflect(base) : base;
  return {
    id: piece,
    piece,
    rotation: rot,
    mirror,
    cells: cellsAt(shape, ANCHOR_INDEX[piece], x, y),
    muted,
  };
};

/** Encola el tablero por el mismo camino que `playback/use-engine.ts`: una `buildSequence`, dos colas. */
const encolarTablero = (placed: readonly PlacedPiece[]): void => rs.encolar(buildSequence(placed, REGIMEN.escala, GRID_DEFAULT), placed);

/** Lo que hace el motor al cerrar un ciclo: subir el contador. */
const cerrarCiclo = (): void => { motor.generacion++; };

const clave = (c: readonly number[]): string => `${c[0]},${c[1]}`;
const claves = (cs: readonly (readonly number[])[]): Set<string> => new Set(cs.map(clave));

const UNA = [colocar('F', 0, false, 2, 2)];
const DOS = [colocar('F', 0, false, 2, 2), colocar('L', 0, true, 7, 1)];

/**
 * Un tablero cuyo recorrido cruza celdas OCUPADAS fuera del turno de su pieza —[2,1],
 * [1,2] y [1,1] de la `X`, siendo [1,1] su centro—.
 *
 * Esos cruces suenan una floritura
 * (`Click.note`, 69 = A4, 71 = B4 y 76 = E5). Verificado corriendo `buildSequence`
 * sobre este mismo tablero: son tres de sus cuatro clicks, y el cuarto cae en una celda
 * vacia.
 *
 * ## Por que cambio de tablero
 *
 * El que estaba —`X`(4,2) + `F`(3,4) + `I`(5,0)— se eligio porque la `X` era el caso
 * ESTRUCTURAL: su celda central estaba rodeada por sus cuatro brazos y era siempre una
 * de sus dos puertas, asi que entrar a ella cruzaba si o si, por mucho que subiera
 * `CROSS_COST`. Esa propiedad venia del mapeo del 007 —el centro se llevaba el grado 0—
 * y **la perdio**: con el arpegio recorriendo la pieza, la `X` entra por un
 * brazo y sale por el opuesto. Ese tablero pasa a tener CERO cruces y este test se
 * habria quedado vacio en silencio, que es exactamente contra lo que su guarda existe.
 *
 * El de ahora depende de `CROSS_COST`: rodear la `X` es posible y cuesta mas. Si alguien
 * mueve la constante, la guarda de abajo —"exactamente tres clicks traen `note`"— falla
 * en rojo en vez de dejar el test sin nada que recorrer.
 */
const CON_CRUCE = [colocar('X', 0, false, 1, 1), colocar('F', 0, false, 3, 2), colocar('N', 0, false, 2, 4)];

describe('la ruta activa es la que suena, no la encolada', () => {
  it('AC-PLY-031 — encolar no cambia lo que la cabeza dibuja: hace falta que el motor cierre el ciclo', () => {
    encolarTablero(UNA);
    expect(rs.rutaActiva()).toEqual([]);

    cerrarCiclo();
    expect(rs.rutaActiva()).not.toEqual([]);
  });

  it('AC-PLY-031 — durante la espera sigue vigente el circuito VIEJO, entero', () => {
    encolarTablero(UNA);
    cerrarCiclo();
    const vieja = [...rs.rutaActiva()];

    // Se encola un tablero distinto —otra pieza, otro circuito, otro largo— y hasta
    // el borde la cabeza tiene que seguir recorriendo el anterior.
    encolarTablero(DOS);
    expect(rs.rutaActiva()).toEqual(vieja);

    cerrarCiclo();
    const nueva = rs.rutaActiva();
    expect(nueva).not.toEqual(vieja);
    expect(nueva).toHaveLength(buildSequence(DOS, REGIMEN.escala, GRID_DEFAULT).length);
  });

  it('quitar una pieza tampoco la apaga antes de que deje de sonar', () => {
    // El cruce con `placed` queda CONGELADO junto con la ruta: si el loop mirara el
    // tablero en vivo, la pieza quitada se apagaria a mitad de ciclo.
    encolarTablero(DOS);
    cerrarCiclo();
    const conLas2 = rs.rutaActiva();
    const celdasL = claves(DOS[1].cells);
    const dibujadas = () => claves(conLas2.filter((m) => m !== null).map((m) => m.cell));
    expect([...celdasL].every((c) => dibujadas().has(c))).toBe(true);

    encolarTablero([DOS[0]]);
    expect(rs.rutaActiva()).toBe(conLas2);
    expect([...celdasL].every((c) => dibujadas().has(c))).toBe(true);
  });

  it('la generacion se sincroniza aunque no haya pendiente', () => {
    // Si un swap del motor sin contraparte aca dejara el contador atrasado, el
    // proximo encolar entraria en vigencia al cuadro siguiente en vez de esperar su
    // borde — que es justo lo que AC9 prohibe.
    cerrarCiclo();
    expect(rs.rutaActiva()).toEqual([]);

    encolarTablero(UNA);
    expect(rs.rutaActiva()).toEqual([]);   // todavia no: le falta SU borde

    cerrarCiclo();
    expect(rs.rutaActiva()).not.toEqual([]);
  });
});

describe('la tabla por offset', () => {
  it('cada offset trae la celda que suena en el, con la nota separada del click', () => {
    encolarTablero(DOS);
    cerrarCiclo();
    const marcas = rs.rutaActiva();
    const s = buildSequence(DOS, REGIMEN.escala, GRID_DEFAULT);

    // Las notas: la celda de `notes[j]` sale de la pura del dominio, no de aca.
    for (const step of s.steps) {
      const pieza = DOS.find((p) => p.id === step.pieceId);
      const celdas = cellsByPlayOrder(pieza!);
      for (let j = 0; j < celdas.length; j++) {
        expect(marcas[step.offset + j], `paso ${step.pieceId} nota ${j}`)
          .toEqual({ cell: celdas[j], kind: MARCA.nota });
      }
    }

    // Los clicks: la celda la trae la propia secuencia (D5 — la UI no calcula caminos).
    // Ninguno de `DOS` cruza una celda ocupada, asi que los 8 son click mudo (MARCA.click).
    expect(s.clicks.length).toBeGreaterThan(0);
    expect(s.clicks.every((c) => c.note === undefined)).toBe(true);
    for (const c of s.clicks) expect(marcas[c.offset]).toEqual({ cell: c.cell, kind: MARCA.click });

    // Y no hay agujeros ni sobrantes: el ciclo del recorrido esta cubierto entero.
    expect(marcas).toHaveLength(s.length);
    expect(marcas.filter((m) => m === null)).toEqual([]);
  });

  it('con una sola pieza no hay clicks que dibujar', () => {
    encolarTablero(UNA);
    cerrarCiclo();
    const marcas = rs.rutaActiva();
    // El ciclo mide 5 y el arpegio ocupa 5: el ultimo intervalo es el silencio con el
    // que el ciclo vuelve a empezar contiguo, no un click.
    expect(marcas.filter((m) => m?.kind === MARCA.click)).toEqual([]);
    expect(marcas.filter((m) => m?.kind === MARCA.nota)).toHaveLength(5);
  });

  it('un tablero vacio no deja marcas', () => {
    encolarTablero([]);
    cerrarCiclo();
    expect(rs.rutaActiva()).toEqual([]);
    expect(rs.velo()).toEqual([]);
  });

  it('un click sobre celda ocupada suena floritura y se marca MARCA.cruce', () => {
    encolarTablero(CON_CRUCE);
    cerrarCiclo();
    const marcas = rs.rutaActiva();
    const s = buildSequence(CON_CRUCE, REGIMEN.escala, GRID_DEFAULT);

    // Guarda del propio test: exactamente TRES de los clicks traen `note` (dos brazos de
    // la `X` y su centro) y el resto no. Si esto dejara de ser cierto, los dos `for` de
    // abajo podrian quedarse sin nada que recorrer y el test pasaria vacio.
    const conNota = s.clicks.filter((c) => c.note !== undefined);
    const sinNota = s.clicks.filter((c) => c.note === undefined);
    expect(conNota).toHaveLength(3);
    expect(sinNota.length).toBeGreaterThan(0);

    for (const c of conNota) expect(marcas[c.offset]).toEqual({ cell: c.cell, kind: MARCA.cruce });
    for (const c of sinNota) expect(marcas[c.offset]).toEqual({ cell: c.cell, kind: MARCA.click });
  });
});

describe('el velo de lo que todavia no sono', () => {
  it('AC-PLY-034 — la pieza encolada va sin offset, y despues del swap con el intervalo en que estrena', () => {
    encolarTablero(UNA);
    // Encolada y sin ciclo que la contenga: no hay instante que esperar, solo el swap.
    expect(rs.velo().map((e) => e.offset)).toEqual([null, null, null, null, null]);
    expect(claves(rs.velo().map((e) => e.cell))).toEqual(claves(UNA[0].cells));

    cerrarCiclo();
    rs.rutaActiva();

    // Ya entro al ciclo: ahora cada celda sabe CUANDO le toca, que es lo que hace
    // visible que el orden de reproduccion no es el de colocacion.
    const s = buildSequence(UNA, REGIMEN.escala, GRID_DEFAULT);
    const paso = s.steps[0];
    const celdas = cellsByPlayOrder(UNA[0]);
    expect(rs.velo()).toEqual(celdas.map((cell, j) => ({ id: 'F', cell, offset: paso.offset + j })));
  });

  it('AC-PLY-034 — la que ya sonaba no vuelve al velo cuando entra otra', () => {
    encolarTablero(UNA);
    cerrarCiclo();
    rs.rutaActiva();

    encolarTablero(DOS);
    cerrarCiclo();
    rs.rutaActiva();

    // Solo estrena la `L`: la `F` ya venia sonando, y volver a taparla leeria como que
    // el tablero entero arranca de nuevo en cada swap.
    expect(new Set(rs.velo().map((e) => e.id))).toEqual(new Set(['L']));
    expect(claves(rs.velo().map((e) => e.cell))).toEqual(claves(DOS[1].cells));
  });

  it('la IDENTIDAD del array es la senal de cambio, y solo cambia en los dos bordes', () => {
    // El loop de dibujo compara por referencia 60 veces por segundo: si el array se
    // recreara en cada lectura, rearmaria los nodos del velo en cada cuadro.
    encolarTablero(UNA);
    const alEncolar = rs.velo();
    expect(rs.velo()).toBe(alEncolar);
    rs.rutaActiva();                      // sin cambio de generacion no pasa nada
    expect(rs.velo()).toBe(alEncolar);

    cerrarCiclo();
    rs.rutaActiva();
    expect(rs.velo()).not.toBe(alEncolar);
  });
});

describe('la cabeza recorre la pieza muteada, con el borde del click', () => {
  const MUTEADA = [colocar('F', 0, false, 2, 2, true), colocar('L', 0, true, 7, 1)];

  it('AC-PLY-033 — sus cinco celdas siguen marcadas, pero con MARCA.click y no MARCA.nota', () => {
    // Sigue ocupando ese tiempo: la cabeza no puede saltearla, o el recorrido se leeria
    // mas corto de lo que dura. Lo que cambia es el borde, y cambia porque lo que suena
    // ahi ES un click — no es un efecto colateral de que las marcas se armen de
    // `s.clicks`, es la razon por la que armarlas de ahi es correcto.
    encolarTablero(MUTEADA);
    cerrarCiclo();
    const marcas = rs.rutaActiva();
    const celdas = cellsByPlayOrder(MUTEADA[0]);
    const s = buildSequence(MUTEADA, REGIMEN.escala, GRID_DEFAULT);

    // Sin `Step` para la pieza muteada: sus celdas entran por la rama de los clicks.
    expect(s.steps.map((st) => st.pieceId)).toEqual(['L']);
    for (let j = 0; j < celdas.length; j++) {
      expect(marcas[j], `celda ${j}`).toEqual({ cell: celdas[j], kind: MARCA.click });
    }
    // Y el ciclo sigue cubierto entero.
    expect(marcas).toHaveLength(s.length);
    expect(marcas.filter((m) => m === null)).toEqual([]);
  });

  it('AC-PLY-035 — la pieza muteada no tiene velo de estreno, y la otra si', () => {
    // Decision (a) del spec: el velo dice "esto todavia no sono", y una pieza muteada no
    // va a sonar nunca. Atenuarla hasta que le "toque" prometeria algo que no pasa, y
    // ademas la opacidad ya esta ocupada diciendo eso.
    encolarTablero(MUTEADA);
    cerrarCiclo();
    rs.rutaActiva();
    expect(new Set(rs.velo().map((e) => e.id))).toEqual(new Set(['L']));
  });
});

/**
 * El velo huerfano, y su mitad que NO hay que arreglar.
 *
 * Este modulo avanza solo cuando `cycleGeneration()` sube, y ese contador lo mueve el
 * reloj. Con el transporte parado nada avanza, pero `encolar` igual recomputa el velo
 * leyendo `activa` y `estrenando` congelados: sin el reinicio, el Reset dejaria las cinco
 * celdas de una pieza borrada dibujadas sobre un tablero vacio.
 *
 * El transporte no llega hasta aca —este modulo no sabe si el reloj corre—, asi que lo
 * unico que separa los dos tests de abajo es si hubo ORDEN explicita de volver a cero.
 * Que sea eso y no el estado del reloj es justamente la decision: `reiniciar()` lo llama
 * el Reset y nadie mas.
 */
describe('el reinicio es una orden, no una consecuencia', () => {
  it('AC-PLY-036 — tras el Reset el velo queda vacio aunque el reloj este parado', () => {
    encolarTablero(UNA);
    cerrarCiclo();
    rs.rutaActiva();
    expect(rs.velo()).toHaveLength(CELLS_PER_PIECE);

    // El orden es el del shell: `resetBoard` da la orden y el efecto de reconciliacion
    // reencola el tablero ya vacio en el render siguiente. Al reves tambien tiene que
    // dar vacio, pero este es el que ocurre.
    rs.reiniciar();
    encolarTablero([]);

    expect(rs.rutaActiva()).toEqual([]);
    expect(rs.velo()).toEqual([]);
  });

  it('el reinicio no adelanta el swap: la generacion se sincroniza, no vuelve a cero', () => {
    // Si `reiniciar()` pusiera la generacion en 0 estando el motor en 1, el proximo
    // cuadro veria una diferencia que no existe y estrenaria la pendiente FUERA del
    // borde del ciclo — la misma mentira que `cycleGen` evita no reseteandose nunca.
    encolarTablero(UNA);
    cerrarCiclo();
    rs.rutaActiva();

    rs.reiniciar();
    encolarTablero(UNA);
    expect(rs.rutaActiva()).toEqual([]);   // todavia no: le falta SU borde

    cerrarCiclo();
    expect(rs.rutaActiva()).not.toEqual([]);
    // Y estrena entera: despues del reinicio nada "ya venia sonando".
    expect(new Set(rs.velo().map((e) => e.id))).toEqual(new Set(['F']));
  });

  it('AC-PLY-037 — quitar la ultima pieza NO reinicia nada: el ciclo activo termina (D5 del 009)', () => {
    encolarTablero(UNA);
    cerrarCiclo();
    const sonando = rs.rutaActiva();
    expect(sonando).toHaveLength(buildSequence(UNA, REGIMEN.escala, GRID_DEFAULT).length);

    // Quitar es una EDICION del tablero: no hay orden de volver a cero, asi que hasta el
    // borde la cabeza sigue recorriendo lo que suena y el velo sigue diciendo que a esas
    // celdas todavia no les toco. Limpiar aca seria apagar una pieza que sigue sonando.
    encolarTablero([]);
    expect(rs.rutaActiva()).toBe(sonando);
    expect(claves(rs.velo().map((e) => e.cell))).toEqual(claves(UNA[0].cells));

    // Recien el cierre del ciclo la apaga, y ahi si el velo se vacia solo.
    cerrarCiclo();
    expect(rs.rutaActiva()).toEqual([]);
    expect(rs.velo()).toEqual([]);
  });
});

/**
 * El unico camino por el que `construir` puede recibir un paso sin pieza, y el unico por
 * el que `porPieza` puede no tener una entrada que `ids` si tiene.
 *
 * Su comentario en el fuente dice «no puede pasar», y con el shell de hoy es cierto: el
 * `useMemo` deriva la secuencia de `placed` y el hook entrega las dos juntas en el mismo
 * efecto. Pero la guarda no es decorativa y su comportamiento esta ELEGIDO —«el silencio
 * es preferible a la mentira, porque una celda equivocada se lee como que el modelo esta
 * mal»—, asi que la eleccion se verifica en vez de darse por buena: se llama a `encolar`
 * con las dos cosas desfasadas, que es exactamente lo que un refactor del shell podria
 * producir sin avisar.
 *
 * Los tres caminos que abre son el mismo desfasaje visto desde tres lugares: el `continue`
 * de `construir`, y los dos `?? []` de `recomputarVelo` —uno del lado de lo pendiente y
 * otro del lado de lo activo, porque el velo se recalcula en los dos bordes—.
 */
describe('un paso cuya pieza no esta en el tablero', () => {
  it('queda a oscuras en vez de dibujar una celda inventada, y no arrastra al resto', () => {
    // La secuencia conoce a las dos piezas; el tablero que se entrega, a una sola.
    const seq = buildSequence(DOS, REGIMEN.escala, GRID_DEFAULT);
    const pasoF = seq.steps.find((st) => st.pieceId === 'F')!;
    const pasoL = seq.steps.find((st) => st.pieceId === 'L')!;
    rs.encolar(seq, [DOS[0]]);

    // Borde 1 — el velo de lo ENCOLADO no inventa celdas para la pieza ausente.
    expect(rs.velo().some((e) => e.id === 'L')).toBe(false);
    expect(rs.velo().some((e) => e.id === 'F')).toBe(true);

    cerrarCiclo();
    const marcas = rs.rutaActiva();

    // Los cinco offsets de la pieza que falta quedan en null: la cabeza los cruza a
    // oscuras. Es el silencio del docblock, y es observable.
    for (let j = 0; j < CELLS_PER_PIECE; j++) {
      expect(marcas[pasoL.offset + j], `offset ${pasoL.offset + j}`).toBeNull();
    }
    // Y la pieza que si estaba se dibuja entera: el desfasaje no la contagia.
    for (let j = 0; j < CELLS_PER_PIECE; j++) {
      expect(marcas[pasoF.offset + j]?.kind, `offset ${pasoF.offset + j}`).toBe(MARCA.nota);
    }

    // Borde 2 — despues del swap, la pieza ausente entra a `estrenando` porque `ids` la
    // lista, y aun asi no aporta una sola celda al velo.
    expect(new Set(rs.velo().map((e) => e.id))).toEqual(new Set(['F']));
  });
});
