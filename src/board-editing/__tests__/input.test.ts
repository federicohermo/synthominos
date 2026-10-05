import { describe, it, expect } from 'vitest';
import {
  rotacionPorRueda,
  siguienteRotacion,
  accionDeTecla,
  frenaElDefault,
  abreTapLimpio,
  reflejaElContextMenu,
  accionDeClick,
  esLaPiezaEnLaMano,
  piezaDeTecla,
  ACCION,
  EDICION,
} from '../input.ts';
import { ROTACION } from '../../pieces/orientation.ts';
import type { Rotacion } from '../../pieces/orientation.ts';
import { SHAPES } from '../../pieces/pieces.ts';
import type { EventoDeTecla } from '../input.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { PlacedPiece } from '../placement.ts';

/**
 * Las decisiones de los cinco gestos y del sexto que agregó el 018 —la letra que elige
 * la pieza—.
 *
 * Lo que NO está acá es el cableado
 * —que `board-editing/use-input.ts` mire bien el `e.target`, que el `preventDefault` frene el scroll de
 * verdad—: eso queda en las tareas `[M]` del navegador, porque el repo no monta
 * componentes y no tiene jsdom.
 */

/** Un evento de tecla con todo apagado: cada test enciende solo lo que mide. */
const tecla = (p: Partial<EventoDeTecla> & Pick<EventoDeTecla, 'key' | 'tipo'>): EventoDeTecla => ({
  repeat: false, targetEsControl: false, targetEsCelda: false, tapLimpio: true,
  ctrlKey: false, metaKey: false, altKey: false, ...p,
});

/** Las doce letras, tomadas de `SHAPES` y no escritas a mano: la fuente es la misma que la pura. */
const LETRAS = Object.keys(SHAPES) as PieceKey[];

describe('la rueda rota en los dos sentidos, con vuelta cíclica', () => {
  it('AC-BRD-022 — abajo suma 90° y arriba resta 90°', () => {
    expect(rotacionPorRueda(0, 120)).toBe(1);
    expect(rotacionPorRueda(1, -120)).toBe(0);
  });

  it('AC-BRD-022 AC-PCS-011 — da la vuelta en los dos bordes', () => {
    expect(rotacionPorRueda(3, 120)).toBe(0);
    // El caso que el `+ 4` existe para atajar: en JS `-1 % 4` es `-1`, y `rotateN`
    // no tiene una rotación -1.
    expect(rotacionPorRueda(0, -120)).toBe(3);
  });

  it('AC-BRD-022 — un deltaY de 0 no rota', () => {
    // Llega de verdad: un scroll horizontal puro deja `deltaY` en 0, y girar ahí
    // sería rotar sin que nadie lo pida.
    expect(rotacionPorRueda(2, 0)).toBe(2);
  });

  it('recorre el ciclo de cuatro y vuelve al punto de partida', () => {
    // El acumulador va tipado como `Rotacion`: si la pura dejara de
    // garantizar el rango, esta linea deja de compilar antes de que el test corra.
    let r: Rotacion = ROTACION.cero;
    for (let i = 0; i < 4; i++) r = rotacionPorRueda(r, 120);
    expect(r).toBe(ROTACION.cero);
  });

  it('AC-PCS-012 — `siguienteRotacion` es la rueda hacia abajo, y da la vuelta en el borde', () => {
    // El gesto de `Shift` del 013. Delega en `rotacionPorRueda` en vez de repetir el
    // `% 4`, que es la aritmetica que hasta el 020 vivia ademas inline en `App.tsx` — la
    // copia de alla no tenia el `+ 4` que evita el resto negativo.
    expect([0, 1, 2, 3].map(r => siguienteRotacion(r as Rotacion))).toEqual([1, 2, 3, 0]);
  });
});

describe('el auto-repeat no acumula', () => {
  it('con `repeat: true` ninguna tecla produce acción', () => {
    // Sin esta guarda, apoyar el meñique en Shift —que es lo que uno hace para
    // escribir— giraría la pieza a la cadencia de repetición del sistema.
    for (const key of ['Shift', 'Control', ' ']) {
      expect(accionDeTecla(tecla({ key, tipo: 'keydown', repeat: true }))).toBeNull();
      expect(accionDeTecla(tecla({ key, tipo: 'keyup', repeat: true }))).toBeNull();
    }
  });
});

describe('los modificadores actúan al soltar, y solo con el tap limpio', () => {
  it('AC-BRD-024 — el `keydown` del modificador no produce acción', () => {
    // Es la mitad de la guarda que evita que `Ctrl`+C dé vuelta la reflexión: todos
    // los atajos del navegador empiezan con el `keydown` del modificador.
    expect(accionDeTecla(tecla({ key: 'Shift', tipo: 'keydown' }))).toBeNull();
    expect(accionDeTecla(tecla({ key: 'Control', tipo: 'keydown' }))).toBeNull();
  });

  it('AC-BRD-024 — el `keyup` con el tap limpio sí', () => {
    expect(accionDeTecla(tecla({ key: 'Shift', tipo: 'keyup' }))).toBe(ACCION.rotar);
    expect(accionDeTecla(tecla({ key: 'Control', tipo: 'keyup' }))).toBe(ACCION.reflejar);
  });

  it('AC-BRD-024 — el `keyup` con el tap sucio no', () => {
    // El tap lo ensucian otra tecla (`Ctrl`+C) y la rueda (`Ctrl`+rueda, que es el
    // zoom). La suciedad la pone el cableado, así que este test es lo único que fija
    // la regla de qué hacer con ella.
    expect(accionDeTecla(tecla({ key: 'Shift', tipo: 'keyup', tapLimpio: false }))).toBeNull();
    expect(accionDeTecla(tecla({ key: 'Control', tipo: 'keyup', tapLimpio: false }))).toBeNull();
  });
});

describe('la barra espaciadora', () => {
  it('AC-BRD-028 — alterna el transporte en el `keydown` y no en el `keyup`', () => {
    // En `keydown` y no en `keyup` porque es donde el navegador scrollea: es el único
    // momento en que el `preventDefault` sirve de algo.
    expect(accionDeTecla(tecla({ key: ' ', tipo: 'keydown' }))).toBe(ACCION.transporte);
    expect(accionDeTecla(tecla({ key: ' ', tipo: 'keyup' }))).toBeNull();
  });

  it('AC-BRD-029 — con el foco sobre un control no produce acción', () => {
    // AC8: con Play enfocado, la barra lo activa por la vía nativa. Si además el
    // handler global contestara, el transporte alternaría dos veces en el mismo gesto
    // y el instrumento no arrancaría.
    expect(accionDeTecla(tecla({ key: ' ', tipo: 'keydown', targetEsControl: true }))).toBeNull();
  });

  it('AC-BRD-029 — la guarda del control también apaga a los modificadores', () => {
    // Escribir en el slider de tempo con Shift no tiene por qué rotar la pieza.
    expect(accionDeTecla(tecla({ key: 'Shift', tipo: 'keyup', targetEsControl: true }))).toBeNull();
    expect(accionDeTecla(tecla({ key: 'Control', tipo: 'keyup', targetEsControl: true }))).toBeNull();
  });
});

describe('el foco sobre una celda apaga la barra y NADA MÁS', () => {
  /*
   * LAS SEIS FILAS DE ESTA TABLA SON EL CRITERIO, Y JUNTAS. Por separado no dicen nada:
   * lo que se decide no es «la celda apaga la barra» sino «la celda apaga la
   * barra y nada más». Escrita como tests sueltos, borrar el de `Shift` por redundante
   * dejaría el archivo en verde mientras la app pierde los dos atajos del 013 — que es
   * exactamente el bug de ensanchar `targetEsControl` en vez de agregar `targetEsCelda`:
   * una línea más corta que apaga los tres atajos para arreglar uno.
   *
   * La asimetría entera, en una sola vista:
   *
   * | key                   | targetEsControl | targetEsCelda | esperado          |
   * |-----------------------|-----------------|---------------|-------------------|
   * | `' '` (keydown)       | false           | false         | ACCION.transporte |
   * | `' '` (keydown)       | false           | TRUE          | null              |
   * | `' '` (keydown)       | true            | false         | null              |
   * | `'Shift'` (keyup)     | false           | TRUE          | ACCION.rotar      |
   * | `'Control'` (keyup)   | false           | TRUE          | ACCION.reflejar   |
   * | las doce letras       | false           | TRUE          | null, y no por la celda |
   */
  const tabla = [
    ['la barra con el foco fuera del tablero alterna el transporte',
      tecla({ key: ' ', tipo: 'keydown' }), ACCION.transporte],
    ['AC5 — con una CELDA enfocada, la barra no alterna el transporte',
      tecla({ key: ' ', tipo: 'keydown', targetEsCelda: true }), null],
    ['AC5 — con un CONTROL enfocado tampoco, como antes del 026',
      tecla({ key: ' ', tipo: 'keydown', targetEsControl: true }), null],
    ['AC6 — con una celda enfocada, `Shift` SIGUE rotando',
      tecla({ key: 'Shift', tipo: 'keyup', targetEsCelda: true }), ACCION.rotar],
    ['AC6 — con una celda enfocada, `Ctrl` SIGUE reflejando',
      tecla({ key: 'Control', tipo: 'keyup', targetEsCelda: true }), ACCION.reflejar],
  ] as const;

  it('la tabla de la asimetría, que es el AC entero', () => {
    for (const [que, evento, esperado] of tabla) expect(accionDeTecla(evento), que).toBe(esperado);
  });

  it('las doce letras siguen llegando al shell con una celda enfocada', () => {
    // Hoy ninguna letra hace nada, así que las doce dan `null` en las dos columnas. Lo que
    // el test afirma NO es el `null` —sería redundante con «las teclas que no son
    // nuestras»— sino que `targetEsCelda` NO ES EL MOTIVO: la celda enfocada da el mismo
    // resultado que el foco afuera. Es la promesa que heredan las
    // letras que seleccionan pieza —`targetEsCelda` apaga la barra, el `Enter` y las flechas, y
    // nada más—, y por eso se escribe comparando las dos columnas y no contra `null`: el
    // día en que una letra haga algo, esta fila sigue diciendo la verdad sin tocarse.
    for (const letra of Object.keys(SHAPES) as PieceKey[]) {
      for (const key of [letra, letra.toLowerCase()]) {
        const enElTablero = accionDeTecla(tecla({ key, tipo: 'keydown', targetEsCelda: true }));
        const afuera = accionDeTecla(tecla({ key, tipo: 'keydown' }));
        expect(enElTablero, key).toBe(afuera);
      }
    }
  });
});

describe('frenar el default es otra pregunta que producir una acción', () => {
  it('AC-BRD-028 — la barra repetida NO alterna el transporte pero SÍ frena el scroll', () => {
    // Es el caso que separa a las dos funciones, y el que las tenía fundidas dejaba
    // roto: con `preventDefault` atado a «hay acción», un tap un poco largo de la barra
    // arrancaba el transporte una vez y después scrolleaba la página a la cadencia de
    // repetición del sistema, porque cada `keydown` repetido trae su propio default.
    const repetida = tecla({ key: ' ', tipo: 'keydown', repeat: true });
    expect(accionDeTecla(repetida)).toBeNull();
    expect(frenaElDefault(repetida)).toBe(true);
  });

  it('AC-BRD-028 — la barra del primer `keydown` frena el default', () => {
    expect(frenaElDefault(tecla({ key: ' ', tipo: 'keydown' }))).toBe(true);
  });

  it('con una CELDA enfocada la barra sigue frenando el default, aunque ya no haya acción', () => {
    // La otra mitad de la asimetría del 026, y la que es fácil de perder al copiar la
    // guarda de `targetEsControl`: la barra deja de alternar el transporte —la maneja el
    // tablero— pero su default sigue siendo scrollear la página, y hay que frenarlo lo
    // maneje quien lo maneje. Sin esta línea, el mismo golpe que coloca la pieza se lleva
    // el tablero fuera de la pantalla.
    const enLaCelda = tecla({ key: ' ', tipo: 'keydown', targetEsCelda: true });
    expect(accionDeTecla(enLaCelda)).toBeNull();
    expect(frenaElDefault(enLaCelda)).toBe(true);
  });

  it('AC-BRD-029 — con el foco sobre un control no frena nada', () => {
    // D4: el evento es del navegador ENTERO y no a medias, o la barra dejaría de
    // activar el botón que tiene el foco.
    expect(frenaElDefault(tecla({ key: ' ', tipo: 'keydown', targetEsControl: true }))).toBe(false);
  });

  it('el `keyup` de la barra y los modificadores no frenan nada', () => {
    // Ninguno de los tres tiene un default que valga la pena frenar: la barra scrollea
    // en `keydown`, y `Shift` y `Control` sueltos no hacen nada en el navegador.
    expect(frenaElDefault(tecla({ key: ' ', tipo: 'keyup' }))).toBe(false);
    for (const key of ['Shift', 'Control']) {
      expect(frenaElDefault(tecla({ key, tipo: 'keydown' })), key).toBe(false);
      expect(frenaElDefault(tecla({ key, tipo: 'keyup' })), key).toBe(false);
    }
  });

  it('una tecla que no es nuestra tampoco', () => {
    for (const key of ['a', 'Enter', 'Alt', 'ArrowDown', 'PageDown']) {
      expect(frenaElDefault(tecla({ key, tipo: 'keydown' })), key).toBe(false);
    }
  });
});

describe('qué keydown abre un tap limpio', () => {
  /** Un `keydown` sin modificadores encendidos salvo los que el test pide. */
  const bajar = (key: string, mods: Partial<Record<'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey', boolean>> = {}) =>
    abreTapLimpio({
      key,
      shiftKey: key === 'Shift', ctrlKey: key === 'Control',
      altKey: false, metaKey: false,
      ...mods,
    });

  it('AC-BRD-025 — un modificador solo lo abre', () => {
    expect(bajar('Shift')).toBe(true);
    expect(bajar('Control')).toBe(true);
  });

  it('AC-BRD-025 — cualquier otra tecla lo ensucia', () => {
    for (const key of ['a', ' ', 'Alt', 'Enter']) expect(bajar(key), key).toBe(false);
  });

  it('AC-BRD-025 — un modificador con OTRO ya abajo no lo abre', () => {
    // El agujero que la regla del spec —"arranca en true con el keydown del
    // modificador"— deja abierto: `Ctrl`+`Shift` son dos keydown de modificador
    // seguidos y ninguna tercera tecla que ensucie el tap. Es el atajo con el que
    // Windows cambia de distribución de teclado, así que sin esto la pieza rotaría y
    // se reflejaría sola al soltarlo.
    expect(bajar('Shift', { ctrlKey: true })).toBe(false);
    expect(bajar('Control', { shiftKey: true })).toBe(false);
  });

  it('AC-BRD-025 — `Alt` y `Meta` abajo también lo ensucian', () => {
    // `Alt` lo reserva el muteo y `Meta` es el modificador de los
    // atajos de macOS: los dos son gestos de otro dueño.
    expect(bajar('Control', { altKey: true })).toBe(false);
    expect(bajar('Shift', { metaKey: true })).toBe(false);
  });
});

describe('las teclas que no son nuestras', () => {
  it('AC-BRD-020 — no producen acción', () => {
    // Este barrido es load-bearing y no una lista cualquiera: la `'a'`
    // pasa a decir que `A` NO es un pentominó, así que si algún día `SHAPES` ganara una
    // entrada `A` este test es el que lo grita.
    for (const key of ['a', 'Enter', 'Alt', 'ArrowUp', 'Escape']) {
      expect(accionDeTecla(tecla({ key, tipo: 'keydown' })), key).toBeNull();
      expect(accionDeTecla(tecla({ key, tipo: 'keyup' })), key).toBeNull();
    }
    // `Alt` está en la lista a propósito: el 013 lo declaró reservado y el 014 lo usa
    // como modificador del CLICK, no como tecla suelta. Si algún día empieza a hacer
    // algo por su cuenta, este test lo dice.
  });
});

describe('`Ctrl`+click en macOS es el click derecho', () => {
  /*
   * Este es el único criterio que NO se puede ver a ojo desde Windows, que
   * es donde se desarrolla el repo: acá `Ctrl`+click es un click común y las dos filas
   * de la tabla no se cruzan nunca. En macOS el sistema lo traduce a `contextmenu` con
   * `ctrlKey: true`, y sin la guarda el `keyup` de `Ctrl` alterna la reflexión y este
   * handler la deshace — neto cero, o sea que la reflexión no respondería nunca ahí.
   *
   * Si alguien borra este test por "redundante", el bug vuelve y vuelve mudo.
   */
  it('AC-BRD-026 — un `contextmenu` con `ctrlKey: true` no refleja', () => {
    expect(reflejaElContextMenu({ ctrlKey: true })).toBe(false);
  });

  it('AC-BRD-026 — un click derecho de verdad sí', () => {
    expect(reflejaElContextMenu({ ctrlKey: false })).toBe(true);
  });
});

/**
 * El click sobre una celda.
 *
 * La llave de toda la edición es que la pieza que
 * está en la mano sea la misma que la del tablero: sin esa condición, cualquier click mal
 * apuntado borraría.
 */
const pieza = (id: string, piece: PieceKey, muted = false): PlacedPiece =>
  ({ id, piece, rotation: 0, mirror: false, cells: [], muted });

describe('el click sobre la pieza que está en la mano la quita', () => {
  it('con la misma pieza seleccionada, quitar', () => {
    expect(accionDeClick(pieza('1', 'N'), 'N', false)).toBe(EDICION.quitar);
  });

  it('AC-BRD-007 — la decisión se toma sobre la celda CLICKEADA, así que con dos `N` se edita la tocada', () => {
    // `occupantAt` devuelve la pieza que cubre esa celda, y esta pura recibe esa. Que la
    // regla no sea "hay alguna N en el tablero" es lo que hace que con dos colocadas se
    // edite la que se tocó — el id viaja en el ocupante y el llamador filtra por él.
    const primera = pieza('1', 'N');
    const segunda = pieza('2', 'N');
    expect(accionDeClick(primera, 'N', false)).toBe(EDICION.quitar);
    expect(accionDeClick(segunda, 'N', false)).toBe(EDICION.quitar);
    expect(primera.id).not.toBe(segunda.id);
  });
});

describe('el click sobre OTRA pieza no hace nada', () => {
  it('AC-BRD-009 — sin Alt y con Alt, ninguna de las dos edita', () => {
    // Es el comportamiento de antes del spec: `isValid` rechazaba el solape y el handler
    // volvía. La regla NO puede ser "la jugada es inválida", porque eso también es cierto
    // acá y acá no tiene que pasar nada.
    expect(accionDeClick(pieza('1', 'L'), 'N', false)).toBeNull();
    expect(accionDeClick(pieza('1', 'L'), 'N', true)).toBeNull();
  });
});

describe('`Alt`+click sobre la pieza en la mano alterna el muteo', () => {
  it('AC-BRD-010 — mutea la que suena y desmutea la muteada: es un toggle, no un set', () => {
    // La pura devuelve la misma acción en los dos casos porque el toggle es del llamador:
    // la decisión es "alterná esta", y cuál es el valor nuevo lo sabe la pieza.
    expect(accionDeClick(pieza('1', 'N'), 'N', true)).toBe(EDICION.mutear);
    expect(accionDeClick(pieza('1', 'N', true), 'N', true)).toBe(EDICION.mutear);
  });
});

describe('`Alt`+click sobre una celda vacía coloca ya muteada', () => {
  it('AC-BRD-006 — sin Alt coloca normal, con Alt coloca muteada', () => {
    expect(accionDeClick(null, 'N', false)).toBe(EDICION.colocar);
    expect(accionDeClick(null, 'N', true)).toBe(EDICION.colocarMuteada);
  });

  it('AC-BRD-006 — las dos son acciones distintas, y esa es la única razón por la que se separan', () => {
    // Editan el tablero igual; lo que cambia es el arpegio de cortesía, que la muteada no
    // dispara. Si fueran la misma acción, esa condición tendría que vivir como un `if`
    // suelto en el shell mirando el `altKey` una segunda vez.
    expect(EDICION.colocar).not.toBe(EDICION.colocarMuteada);
  });
});

describe('la llave de la edición, sola', () => {
  it('`esLaPiezaEnLaMano` es falsa sin ocupante y con ocupante de otro tipo', () => {
    expect(esLaPiezaEnLaMano(null, 'N')).toBe(false);
    expect(esLaPiezaEnLaMano(pieza('1', 'L'), 'N')).toBe(false);
    expect(esLaPiezaEnLaMano(pieza('1', 'N'), 'N')).toBe(true);
  });

  it('AC-BRD-008 — no mira el muteo: una pieza muteada se puede quitar igual', () => {
    expect(esLaPiezaEnLaMano(pieza('1', 'N', true), 'N')).toBe(true);
    expect(accionDeClick(pieza('1', 'N', true), 'N', false)).toBe(EDICION.quitar);
  });
});

describe('la letra elige su pieza, en minúscula y en mayúscula', () => {
  it('AC-BRD-017 — las doce letras seleccionan, en los dos casos', () => {
    expect(LETRAS.length).toBe(12);
    for (const letra of LETRAS) {
      for (const key of [letra.toLowerCase(), letra]) {
        expect(accionDeTecla(tecla({ key, tipo: 'keydown' })), key).toBe(ACCION.seleccionar);
        expect(piezaDeTecla(key), key).toBe(letra);
      }
    }
  });

  it('AC-BRD-020 — `piezaDeTecla` devuelve `null` para lo que no es pentominó', () => {
    for (const key of ['A', 'a', '1', 'Enter', 'ArrowUp', '']) {
      expect(piezaDeTecla(key), key).toBeNull();
    }
    // `in` mira la cadena de prototipos, así que contra un objeto literal contesta `true`
    // para las claves de `Object.prototype`. Acá no llega ninguna porque el `toUpperCase`
    // va primero y `'TOSTRING'` no es una de ellas — pero el día que el estrechamiento se
    // escriba de otra forma, esta línea es la que lo dice.
    for (const key of ['toString', 'constructor', 'valueOf']) {
      expect(piezaDeTecla(key), key).toBeNull();
    }
  });
});

describe('un modificador le devuelve la letra al navegador', () => {
  it('AC-BRD-018 — con `ctrlKey`, `metaKey` o `altKey` la letra no selecciona', () => {
    // `Ctrl`+`F` (buscar), `Ctrl`+`P` (imprimir) y `Ctrl`+`V` (pegar) son tres atajos que
    // el navegador se queda enteros, y las tres letras son pentominós.
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(accionDeTecla(tecla({ key: 'f', tipo: 'keydown', [mod]: true })), mod).toBeNull();
    }
  });

  it('AC-BRD-018 — el `keyup` de una letra tampoco selecciona, aunque llegue sin modificadores', () => {
    // El `Ctrl`+`V` que suelta el `Ctrl` primero: el `keyup` de la `V` llega con
    // `ctrlKey: false` y pasaría la guarda de arriba. La decisión es del `keydown`.
    expect(accionDeTecla(tecla({ key: 'v', tipo: 'keyup' }))).toBeNull();
    expect(accionDeTecla(tecla({ key: 'V', tipo: 'keyup', ctrlKey: true }))).toBeNull();
  });
});

describe('AC-BRD-019 — lo que la letra NO hace', () => {
  it('con el foco sobre un control del panel no selecciona', () => {
    expect(accionDeTecla(tecla({ key: 'f', tipo: 'keydown', targetEsControl: true }))).toBeNull();
  });

  it('con auto-repeat no selecciona', () => {
    // Mantener la letra apretada no tiene que repetir la selección: es idempotente, pero
    // salir antes deja el gesto donde el spec lo puso, en un solo `keydown`.
    expect(accionDeTecla(tecla({ key: 'f', tipo: 'keydown', repeat: true }))).toBeNull();
  });

  it('ninguna letra frena el default', () => {
    // Una letra suelta no tiene default que frenar; frenarlo sería quitarle al navegador
    // un evento que no es nuestro.
    for (const letra of LETRAS) {
      expect(frenaElDefault(tecla({ key: letra.toLowerCase(), tipo: 'keydown' })), letra).toBe(false);
      expect(frenaElDefault(tecla({ key: letra, tipo: 'keyup' })), letra).toBe(false);
    }
  });

  it('repetir la misma letra pide la misma acción y nada más', () => {
    const dos = [1, 2].map(() => accionDeTecla(tecla({ key: 'f', tipo: 'keydown' })));
    expect(dos).toEqual([ACCION.seleccionar, ACCION.seleccionar]);
  });
});

describe('la letra ensucia el tap, así que `Shift`+`f` no rota al soltar', () => {
  it('AC-BRD-025 — `abreTapLimpio` es falso para una letra', () => {
    // Caracterización: hoy sale gratis —sólo `Shift` y `Control` abren tap— y el test
    // existe para que siga saliendo gratis.
    expect(abreTapLimpio({ key: 'f', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false })).toBe(false);
    expect(abreTapLimpio({ key: 'F', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false })).toBe(false);
  });
});

describe('con una celda enfocada la letra IGUAL selecciona', () => {
  it('AC-BRD-021 — `targetEsCelda` no entra en la rama de las letras, y sí en la de la barra', () => {
    // La asimetría es la decisión del 026 puesta a prueba desde el otro lado: esa guarda
    // apaga la barra y sólo la barra.
    expect(accionDeTecla(tecla({ key: 'f', tipo: 'keydown', targetEsCelda: true }))).toBe(ACCION.seleccionar);
    expect(accionDeTecla(tecla({ key: ' ', tipo: 'keydown', targetEsCelda: true }))).toBeNull();
  });
});

describe('los tres gestos del 013 no cambian', () => {
  it('AC-BRD-028 — la barra sigue alternando el transporte con `Ctrl`, `Alt` o `Meta` abajo', () => {
    // La guarda de modificadores es DE LA RAMA DE LAS LETRAS. Subida al tope de la
    // función también alcanzaría a la barra, y eso lo pediría cero ACs.
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(accionDeTecla(tecla({ key: ' ', tipo: 'keydown', [mod]: true })), mod).toBe(ACCION.transporte);
    }
  });

  it('AC-BRD-024 — `Shift` y `Control` siguen rotando y reflejando con el tap limpio', () => {
    expect(accionDeTecla(tecla({ key: 'Shift', tipo: 'keyup' }))).toBe(ACCION.rotar);
    expect(accionDeTecla(tecla({ key: 'Control', tipo: 'keyup' }))).toBe(ACCION.reflejar);
  });
});
