import { describe, it, expect, vi, afterEach } from 'vitest';
import { HIT, TICK_MS } from '../scheduler.ts';
import { DEFAULT_BPM, MASTER_GAIN, FFT_SIZE } from '../engine.ts';
import type { Sequence } from '../scheduler.ts';

/**
 * El motor, contra Web Audio de VERDAD.
 *
 * Es la unica de las cuatro partes de `audio/` que no se podia testear: `voice`,
 * `scheduler` y `playhead` reciben el contexto por parametro y corren contra un
 * `OfflineAudioContext` de `node-web-audio-api`, pero este modulo **es** el que crea
 * el singleton —`new AudioContext()` a nivel de modulo— y ademas agenda con
 * `window.setInterval`. Ninguna de las dos cosas existe en `environment: 'node'`, y
 * por eso 107 statements —el 25 % del hueco de coverage de `src/`— estuvieron en cero
 * hasta este spec. No es UI: es el reloj, la reconciliacion del loop y el despacho a
 * sonido, o sea de lo que depende que algo suene a tiempo.
 *
 * ## Todo el estado es de MODULO, asi que cada caso reimporta
 *
 * `ctx`, `master`, `analyser`, `active`, `pending`, `clock`, `timer`, `bpm`,
 * `clicksAudible` y `cycleGen` viven en el modulo. Un test que arranca el reloj se lo
 * deja andando al siguiente, y uno que crea el `AudioContext` impide que el de la
 * rama del `catch` lo cree de nuevo —`audio()` devuelve el que ya hay—. Con
 * `vi.resetModules()` + `await import()` cada caso ve un motor recien cargado, y el
 * orden de los tests deja de ser parte del oraculo.
 */
type Engine = typeof import('../engine.ts');

/**
 * Un motor recien cargado, con su estado de modulo en cero.
 *
 * **`vi.resetModules()` no sirve aca, y costo dos tests descubrirlo.** En
 * `environment: 'node'` limpia el registro de modulos de vitest y el `await import()`
 * siguiente devuelve una instancia nueva; en el navegador los modulos los registra el
 * propio motor de ESM por URL, y eso no se puede vaciar. El `ctx` del test anterior
 * sobrevive, `audio()` devuelve el que ya hay, y la rama del `catch` —que necesita que
 * el contexto NO exista todavia— nunca se alcanza.
 *
 * Lo que si funciona es cambiarle la URL: `?fresh=N` es otro modulo para el navegador,
 * asi que Vite lo sirve de nuevo y sus `let` arrancan en su valor inicial. Es la unica
 * forma de aislar un singleton de modulo en browser mode.
 */
let n = 0;
const abiertos: Engine[] = [];

async function motor(): Promise<Engine> {
  const e = await (import(/* @vite-ignore */ `../engine.ts?fresh=${++n}`) as Promise<Engine>);
  abiertos.push(e);
  return e;
}

/** Alias historico: hoy todo motor se registra para limpieza. */
const conReloj = motor;

afterEach(async () => {
  for (const e of abiertos.splice(0)) {
    // El `setInterval` sobrevive al modulo: el que viene no conoce el timer del que se
    // fue, asi que sin esto queda un `tick` cada 25 ms contra un contexto que ya nadie
    // mira, y eso ensucia los tests siguientes.
    e.stopClock();
    // Y el AudioContext hay que cerrarlo: Chromium topea la cantidad de contextos por
    // documento, y con un modulo nuevo por test se llega enseguida. Cerrar uno ya
    // cerrado tira, asi que el `catch` no es pereza.
    try { await e.audio()?.close(); } catch { /* ya estaba cerrado */ }
  }
  vi.unstubAllGlobals();
});

/** Espera de reloj real: el motor agenda contra `currentTime`, que no se puede fingir. */
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Espera a que la cabeza tenga una posición que dibujar, **sondeando en vez de dormir**.
 *
 * ## El reloj de pared y el reloj de audio no son el mismo reloj
 *
 * `playheadOffset()` contesta un número recién cuando `ctx.currentTime` pasa
 * `clock.origin`, y `origin` lo fija `startClock` en `currentTime + CLOCK_START_DELAY`.
 * O sea que la condición vive en el **reloj del AudioContext**, que lo mueve el hilo de
 * render — no `setTimeout`.
 *
 * Los tres sitios que llaman acá —cinco casos, contando el `it.each` de `outputLatency`—
 * dormían `CLOCK_START_DELAY * 1000 + TICK_MS * 4` ms de pared y afirmaban después: o
 * sea traducían una condición del reloj de audio a una espera del de pared. Con los
 * cuatro nodos de `verify` compitiendo por CPU esa traducción se rompe, y está medido
 * acá: **150 ms de pared, 50,7 ms de audio** —el hilo de render hambreado va a un
 * tercio— con el contexto en `running` y la secuencia ya puesta. Sumale que
 * `outputLatency` mide 40 ms en este Chromium y se resta antes de comparar: del margen
 * nominal de 100 ms quedaban 60, y de reloj de audio ni eso.
 *
 * El rojo no decía nada de eso: decía `expected null not to be null` sobre un motor que
 * estaba funcionando perfecto. Es el mismo modo de falla que el bucle de reintento de
 * «null mientras `origin` todavía es futuro» ya documenta treinta líneas más abajo, y la
 * respuesta es la misma: **cortar por reloj de pared, pero afirmar sobre la condición**.
 *
 * No afloja lo que se afirma. Lo que se pide sigue siendo un offset no nulo, entero y en
 * rango; lo único que deja de exigirse es que aparezca dentro de UNA siesta fija. El
 * techo es generoso a propósito —el presupuesto real son ~150 ms— porque acá no se está
 * midiendo cuánto tarda: para eso están los presupuestos del 009, que además se saltean
 * en la CI justamente porque el runner no es una máquina medible.
 */
async function esperarCabeza(e: Engine, limiteMs = 4000): Promise<number | null> {
  const hasta = performance.now() + limiteMs;
  let off = e.playheadOffset();
  while (off === null && performance.now() < hasta) {
    await esperar(TICK_MS);
    off = e.playheadOffset();
  }
  return off;
}

/**
 * Un ciclo con las tres clases de evento, escrito a mano y no derivado del dominio.
 *
 * A mano porque el override de eslint le prohibe a `audio/` ver `domain/` —tambien en
 * sus tests— y porque lo que se verifica aca es el DESPACHO de cada clase, no de donde
 * salio: `A4` con altura, un cruce con altura y un click mudo, que son las tres ramas
 * del `for` de `tick()`.
 */
const CICLO: Sequence = {
  steps: [{ offset: 0, notes: [69, 71] }],
  clicks: [{ offset: 2, note: 76 }, { offset: 3 }],
  length: 8,
};

describe('audio() — el singleton y su grafo', () => {
  it('crea el contexto una sola vez y lo devuelve siempre', async () => {
    const e = await motor();
    const c = e.audio();
    expect(c).not.toBeNull();
    // La segunda llamada NO construye un grafo nuevo: si lo hiciera, cada arpegio
    // colgaria de un master distinto y el analizador miraria una mezcla parcial.
    expect(e.audio()).toBe(c);
  });

  it('el analizador va ENTRE el master y el destino, con la config del repo', async () => {
    const e = await motor();
    const c = e.audio()!;
    // Se afirma lo que `readSpectrum` necesita para responder algo util: el analizador
    // existe, tiene el tamano de FFT del repo, y hay tantos bins como la mitad.
    e.playNotes([69]);
    const bins = e.readSpectrum();
    expect(bins).not.toBeNull();
    expect(bins!.length).toBe(FFT_SIZE / 2);
    expect(c.state).toBe('running');
    expect(MASTER_GAIN).toBeGreaterThan(0);
  });

  it('AC-PLY-004 — sin Web Audio devuelve null y avisa, en vez de romper la app', async () => {
    // La app «queda usable pero muda», que es lo que promete el docblock. Se verifica
    // porque es una promesa sobre un navegador que no tenemos, y la unica forma de
    // saber que se cumple es fabricarlo.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('sin Web Audio'); } });

    const e = await motor();
    expect(e.audio()).toBeNull();
    expect(warn).toHaveBeenCalled();

    // Y cada llamador lo chequea: ninguna de las tres puertas de sonido explota.
    expect(() => e.playNotes([69])).not.toThrow();
    expect(() => e.playNow([69])).not.toThrow();
    expect(() => e.startClock()).not.toThrow();
    expect(e.clockRunning()).toBe(false);
    expect(e.readSpectrum()).toBeNull();
    expect(e.playheadOffset()).toBeNull();

    warn.mockRestore();
  });

  it('AC-PLY-004 — el fallo avisa UNA vez y no una por click', async () => {
    // Sin la marca de «ya fallo», cada llamada reintenta el constructor: y las llamadas
    // vienen del usuario tocando el instrumento, asi que la consola se llenaba a razon
    // de un warning por click. Se cuenta el warn y no se mira `audio()`, porque lo que
    // cambio no es la respuesta —siempre fue null— sino cuantas veces se intenta.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('sin Web Audio'); } });

    const e = await motor();
    expect(e.audio()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);

    // Las tres puertas de sonido mas una consulta directa: cuatro intentos mas.
    e.playNotes([69]);
    e.playNow([69]);
    e.startClock();
    expect(e.audio()).toBeNull();

    expect(warn, 'la marca latchea: el segundo intento ya no llega al constructor').toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('readSpectrum() — el buffer reusado', () => {
  it('AC-SPC-003 — devuelve null mientras no haya senal que mirar', async () => {
    const e = await motor();
    // Sin contexto todavia: `readSpectrum` NO lo crea, a proposito — su llamador es un
    // loop de dibujo y crearlo ahi seria hacerlo sin gesto del usuario.
    expect(e.readSpectrum()).toBeNull();
  });

  it('AC-SPC-004 — es el MISMO array entre llamadas, que es lo que su docblock advierte', async () => {
    const e = await motor();
    e.audio();
    const a = e.readSpectrum();
    const b = e.readSpectrum();
    expect(a).not.toBeNull();
    // Identidad y no contenido: quien lo guarde va a verlo cambiar por debajo. La
    // alternativa —alocar 60 veces por segundo— es la que el modulo rechaza.
    expect(b).toBe(a);
  });
});

describe('playNotes / playNow', () => {
  it('playNotes agenda sin reanudar: no es un gesto del usuario', async () => {
    const e = await motor();
    const c = e.audio()!;
    const antes = c.currentTime;
    e.playNotes([69, 71, 72, 74, 76]);
    // Lo observable sin oir: no explota, no para el contexto y el reloj sigue corriendo.
    expect(c.state).toBe('running');
    expect(c.currentTime).toBeGreaterThanOrEqual(antes);
  });

  it('playNow reanuda si esta suspendido, que es su unica diferencia', async () => {
    const e = await motor();
    const c = e.audio()!;
    await c.suspend();
    expect(c.state).toBe('suspended');

    e.playNow([69]);
    await vi.waitFor(() => expect(c.state).toBe('running'));
  });

  it('y con el contexto ya corriendo no lo toca', async () => {
    // El caso normal: el gesto del usuario que reanuda es el PRIMERO, y desde ahi
    // `playNow` es `playNotes` con una pregunta de mas.
    const e = await motor();
    const c = e.audio()!;
    expect(c.state).toBe('running');
    const reanudar = vi.spyOn(c, 'resume');

    e.playNow([69, 71]);
    expect(reanudar).not.toHaveBeenCalled();
    expect(c.state).toBe('running');
    reanudar.mockRestore();
  });

  it('con un arpegio vacio no agenda nada y tampoco falla', async () => {
    const e = await motor();
    e.audio();
    expect(() => e.playNotes([])).not.toThrow();
  });
});

describe('los accesores del motor', () => {
  it('sequenceInfo separa clicks de cruces, que es para lo que existe', async () => {
    const e = await motor();
    // Antes del primer ciclo la ACTIVA esta vacia: `setSequence` encola, no pone en
    // vigencia. Preguntarle al motor que agendo y que conteste lo pendiente seria peor
    // que no tener la funcion.
    e.setSequence(CICLO);
    expect(e.sequenceInfo()).toEqual({ steps: 0, clicks: 0, crosses: 0, length: 0 });
  });

  it('setBpm cambia el tempo del motor sin tocar el reloj', async () => {
    const e = await motor();
    expect(e.clockRunning()).toBe(false);
    e.setBpm(DEFAULT_BPM * 2);
    e.setClicksAudible(true);
    // No hay getter, y eso es correcto: el bpm se observa en el espaciado. Lo que se
    // afirma aca es que ponerlo no arranca ni para nada.
    expect(e.clockRunning()).toBe(false);
  });

  it('cycleGeneration arranca en 0 y no se resetea al parar', async () => {
    const e = await conReloj();
    expect(e.cycleGeneration()).toBe(0);
    e.setSequence(CICLO);
    e.startClock();
    await vi.waitFor(() => expect(e.cycleGeneration()).toBeGreaterThan(0), { timeout: 2000 });
    const g = e.cycleGeneration();
    e.stopClock();
    // Pausar no cambia que ciclo esta en vigencia: resetear haria creer a la UI que
    // hubo un swap que no hubo.
    expect(e.cycleGeneration()).toBe(g);
  });
});

describe('el reloj', () => {
  it('startClock es idempotente y stopClock tambien', async () => {
    // Se cuentan los `setInterval` y no solo `clockRunning()`: con la guarda borrada el
    // reloj SIGUE diciendo que corre —porque `timer` no es null— y lo que queda roto es
    // un segundo timer huerfano que agenda cada onset dos veces contra el mismo
    // `scheduledUntil`. Un pase de mutacion lo confirmo: sin este conteo, borrar
    // `if (timer !== null) return` dejaba el test en verde.
    const intervalos = vi.spyOn(window, 'setInterval');
    const e = await conReloj();

    e.startClock();
    expect(e.clockRunning()).toBe(true);
    expect(intervalos).toHaveBeenCalledTimes(1);

    e.startClock();
    expect(e.clockRunning()).toBe(true);
    expect(intervalos, 'la segunda llamada no puede abrir un segundo timer').toHaveBeenCalledTimes(1);

    const limpiados = vi.spyOn(window, 'clearInterval');
    e.stopClock();
    expect(e.clockRunning()).toBe(false);
    expect(limpiados).toHaveBeenCalledTimes(1);

    e.stopClock();
    expect(e.clockRunning()).toBe(false);
    expect(limpiados, 'parar dos veces no limpia dos veces').toHaveBeenCalledTimes(1);

    intervalos.mockRestore();
    limpiados.mockRestore();
  });

  it('reanuda el contexto suspendido al arrancar', async () => {
    const e = await conReloj();
    const c = e.audio()!;
    await c.suspend();
    e.startClock();
    await vi.waitFor(() => expect(c.state).toBe('running'));
    expect(e.clockRunning()).toBe(true);
  });

  it('AC-PLY-015 — el primer arranque pone en vigencia la pendiente y cuenta el swap', async () => {
    const e = await conReloj();
    e.setSequence(CICLO);
    e.setClicksAudible(true);
    e.startClock();

    // El primer arranque pasa por la rama de `vigente.length <= 0` de `collectWindow`,
    // y que ESA tambien suba el contador es lo que hace que la cabeza aparezca en el
    // primer ciclo y no recien en el segundo.
    await vi.waitFor(() => expect(e.sequenceInfo().length).toBe(CICLO.length), { timeout: 2000 });
    expect(e.cycleGeneration()).toBeGreaterThan(0);
    expect(e.sequenceInfo()).toEqual({
      steps: 1,
      clicks: 1,   // el `{ offset: 3 }` sin nota
      crosses: 1,  // el `{ offset: 2, note: 76 }`
      length: CICLO.length,
    });
  });

  it('AC-PLY-021 — con los clicks apagados el ciclo sigue igual: es mezcla, no modelo', async () => {
    const e = await conReloj();
    e.setSequence(CICLO);
    e.setClicksAudible(false);
    e.startClock();

    await vi.waitFor(() => expect(e.sequenceInfo().length).toBe(CICLO.length), { timeout: 2000 });

    // El ciclo entero, para que el despacho llegue al click MUDO del offset 3 con el
    // interruptor apagado: es la rama que se apaga, y apagarla no puede acortar nada.
    let maximo = -1;
    for (let i = 0; i < 80 && maximo < CICLO.length - 1; i++) {
      const off = e.playheadOffset();
      if (off !== null) maximo = Math.max(maximo, off);
      await esperar(20);
    }
    expect(maximo).toBeGreaterThanOrEqual(CICLO.length - 1);

    // Los clicks siguen en la secuencia y `collectHits` los sigue emitiendo: lo unico
    // que cambia es que `tick()` no los cablea a sonido.
    expect(e.sequenceInfo().clicks).toBe(1);
    expect(e.sequenceInfo().length).toBe(CICLO.length);
  });
});

describe('playheadOffset()', () => {
  it('AC-PLY-029 — null en pausa, aunque el contexto exista', async () => {
    const e = await motor();
    e.audio();
    expect(e.playheadOffset()).toBeNull();
  });

  it('AC-PLY-029 — null con el reloj andando y la secuencia vacia', async () => {
    const e = await conReloj();
    e.startClock();
    expect(e.playheadOffset()).toBeNull();
  });

  it('AC-PLY-029 — null mientras `origin` todavia es futuro, y un numero despues', async () => {
    const e = await conReloj();
    e.setSequence(CICLO);
    e.startClock();

    // Antes del primer tick la activa sigue vacia, asi que el null sale por ahi.
    expect(e.playheadOffset()).toBeNull();

    // La ventana que interesa es la de EN MEDIO, y es angosta a proposito: el swap
    // ocurre en el primer tick (25 ms) y `origin` cae recien a los 50 ms
    // (`CLOCK_START_DELAY`). En esos ~25 ms la secuencia activa YA es la nueva pero
    // todavia no empezo a sonar, y ahi tiene que seguir contestando null. Sin ese
    // corte `offsetAt` contesta —correctamente, como funcion total— la COLA del ciclo,
    // o sea el offset MAXIMO, y ese numero destapaba de un saque las cinco celdas del
    // velo: el estreno celda por celda no se veia nunca.
    //
    // ## El muestreo cede el hilo en cada vuelta y no duerme un intervalo fijo
    //
    // La ventana va del primer tick (25 ms) a `origin` (50 ms despues), o sea ~50 ms, y
    // el swap ocurre adentro de un `setInterval`: para verlo hay que devolverle el hilo
    // al event loop, pero durmiendo 2 ms por vuelta se pierden muestras y el test
    // PARPADEA bajo instrumentacion, que es donde mas lento va todo. Con `setTimeout(0)`
    // se cede el hilo sin gastar ventana, y el corte es por reloj de pared y no por
    // cantidad de vueltas — que es lo que lo hace independiente de la velocidad de la
    // maquina.
    //
    // `vi.waitFor` no sirve: su intervalo por defecto es mas ancho que la ventana entera.
    // ## Perder la ventana REINTENTA, no da rojo
    //
    // `setTimeout(0)` lo clampea Chromium a 4 ms a partir del quinto anidamiento, asi
    // que la ventana de ~25 ms da unas seis muestras: con los cuatro nodos de `verify`
    // compitiendo por CPU, una sola pausa se la come entera y el test daria rojo sin que
    // nada este mal. Es el mismo modo de falla que este spec le saco a los presupuestos
    // del 009, y la misma razon: un rojo espurio en el nodo de convergencia entrena a
    // leer el rojo como ruido.
    //
    // El reintento NO afloja lo que se afirma. `startClock` fija
    // `clock.origin = currentTime + CLOCK_START_DELAY` y recien despues arma el timer,
    // asi que al volver —con la secuencia YA activa del intento anterior— las cuatro
    // guardas de `playheadOffset` estan en el mismo estado que en la ventana original y
    // el null sale por `now < clock.origin`, que es exactamente la que se quiere ver. Lo
    // que el reintento saca del medio es la carrera contra el primer tick, no la
    // condicion.
    let visto = false;
    for (let intento = 0; !visto && intento < 5; intento++) {
      if (intento > 0) { e.stopClock(); e.startClock(); }
      let llego = false;
      const hasta = performance.now() + 400;
      while (performance.now() < hasta && !visto && !llego) {
        if (e.sequenceInfo().length > 0) {
          if (e.playheadOffset() === null) visto = true;
          else llego = true;   // `origin` ya paso: se perdio la ventana
        }
        await esperar(0);
      }
    }
    expect(visto, 'la ventana entre el swap y `origin` tiene que observarse al menos una vez').toBe(true);

    // Y pasado `origin`, un número. Se sondea y no se duerme un fijo: la condición vive
    // en el reloj del AudioContext y no en el de pared — ver `esperarCabeza`.
    const off = await esperarCabeza(e);
    expect(off, 'pasado `origin` la cabeza tiene que tener una celda que dibujar').not.toBeNull();
    expect(off!).toBeGreaterThanOrEqual(0);
    expect(off!).toBeLessThan(CICLO.length);
  });

  it('AC-PLY-029 — null con el contexto suspendido, aunque el reloj siga andando', async () => {
    const e = await conReloj();
    e.setSequence(CICLO);
    e.startClock();
    expect(await esperarCabeza(e), 'la premisa del caso: antes de suspender había cabeza').not.toBeNull();

    const c = e.audio()!;
    await c.suspend();
    // La cabeza se apaga: lo que se dibujara ahi seria mentira.
    expect(e.playheadOffset()).toBeNull();
  });
});

describe('outputLatency — la cadena que TypeScript cree innecesaria', () => {
  /**
   * Fabrica un navegador con `outputLatency` y `baseLatency` caidos, y devuelve como
   * restaurarlos.
   *
   * `lib.dom.d.ts` los declara como `number` no opcional, pero Firefox no implementa el
   * primero y ahi llega `undefined`. El fallback existe por eso, y hasta aca no lo
   * ejercia nadie: los tests de `audio/` corren contra `node-web-audio-api`, donde estos
   * numeros no describen ninguna salida real.
   *
   * Se fabrica el navegador que falta parcheando el prototipo ANTES de que el modulo
   * cree su contexto. No se puede llamar a la funcion directo —es privada del modulo,
   * y exportarla solo para el test seria ensanchar la superficie por comodidad— asi
   * que se la observa por su efecto: `playheadOffset` resta la latencia, y con las dos
   * lecturas caidas tiene que seguir contestando un offset valido en vez de `NaN`.
   */
  function conLatencias(out: unknown, base: unknown): () => void {
    const proto = AudioContext.prototype;
    const antesOut = Object.getOwnPropertyDescriptor(proto, 'outputLatency');
    const antesBase = Object.getOwnPropertyDescriptor(proto, 'baseLatency');
    Object.defineProperty(proto, 'outputLatency', { get: () => out, configurable: true });
    Object.defineProperty(proto, 'baseLatency', { get: () => base, configurable: true });
    return () => {
      if (antesOut) Object.defineProperty(proto, 'outputLatency', antesOut);
      if (antesBase) Object.defineProperty(proto, 'baseLatency', antesBase);
    };
  }

  it.each([
    ['sin outputLatency, cae a baseLatency (el caso Firefox)', undefined, 0.01],
    ['sin ninguna de las dos, cae a 0', undefined, undefined],
    ['con un outputLatency que no es finito, tampoco lo usa', NaN, undefined],
  ])('%s', async (_caso, out, base) => {
    const restaurar = conLatencias(out, base);
    try {
      const e = await conReloj();
      e.setSequence(CICLO);
      e.startClock();

      const off = await esperarCabeza(e);
      expect(off, 'con las dos lecturas caídas la cabeza tiene que seguir contestando').not.toBeNull();
      // Lo que el fallback compra: un offset entero y en rango, no un `NaN` que
      // `Playhead.tsx` pintaria como una celda que no existe.
      expect(Number.isInteger(off!)).toBe(true);
      expect(off!).toBeGreaterThanOrEqual(0);
      expect(off!).toBeLessThan(CICLO.length);
    } finally {
      restaurar();
    }
  });
});

describe('tick() — el despacho de las tres clases', () => {
  it('AC-PLY-023 — las tres ramas del `kind` se recorren en un ciclo con las tres', async () => {
    // No hay forma de oir desde un test, asi que lo que se afirma es que el ciclo con
    // nota, cruce y click mudo corre entero y con los clicks ENCENDIDOS —que es la
    // unica rama con condicion— sin dejar el motor en un estado invalido.
    //
    // La espera es de un CICLO y no de unos ticks, y el numero sale de la aritmetica
    // del instrumento: a 110 bpm el intervalo mide `barDuration/16` = 136 ms, asi que
    // los 8 intervalos de `CICLO` duran 1,09 s. Con menos que eso el `for` alcanza la
    // nota del offset 0 pero no llega ni al cruce del 2 ni al click del 3.
    const e = await conReloj();
    e.setSequence(CICLO);
    e.setClicksAudible(true);
    e.startClock();

    await vi.waitFor(() => expect(e.sequenceInfo().steps).toBe(1), { timeout: 2000 });

    // Se sigue a la cabeza en vez de mirar `cycleGeneration`, que aca NO se mueve: el
    // contador cuenta SWAPS, y sin una pendiente nueva el ciclo se repite sin swap.
    // El offset maximo alcanzado es lo que prueba que el `for` recorrio la secuencia
    // entera —hasta pasar el cruce del offset 2 y el click del 3— y no solo su cabeza.
    let maximo = -1;
    for (let i = 0; i < 80; i++) {
      const off = e.playheadOffset();
      if (off !== null) maximo = Math.max(maximo, off);
      if (maximo >= CICLO.length - 1) break;
      await esperar(20);
    }

    expect(maximo).toBeGreaterThanOrEqual(CICLO.length - 1);
    expect(e.clockRunning()).toBe(true);
    expect(e.audio()!.state).toBe('running');
    expect(HIT.note).not.toBe(HIT.cross);
  });

  it('tick no explota si el contexto se cae debajo', async () => {
    const e = await conReloj();
    e.setSequence(CICLO);
    e.startClock();
    await esperar(TICK_MS * 2);
    await e.audio()!.close();
    // El timer sigue disparando contra un contexto cerrado hasta que alguien lo pare.
    await esperar(TICK_MS * 2);
    expect(e.clockRunning()).toBe(true);
  });

  it('AC-PLY-003 — con el grafo a medio construir, el motor NO dice que arranco', async () => {
    // Este test llego a afirmar lo contrario, y el estado que describia era
    // alcanzable de verdad: si `createGain()` falla, `audio()` cae al `catch` y devuelve
    // null PERO `ctx` ya quedaba asignado, asi que el `if (ctx) return ctx` de la
    // llamada siguiente contestaba un contexto con `master` en null. Desde ahi
    // `startClock` —que solo mira que `audio()` no sea null— arrancaba el timer,
    // `clockRunning()` pasaba a `true`, el boton decia «Pausa» y no sonaba nada: la
    // falla suave entrando por la unica puerta que el llamador no puede chequear.
    //
    // Dejo de ser alcanzable porque el `catch` ahora baja las tres referencias juntas.
    // Lo que se afirma aca es esa consecuencia y no la guarda de `tick()`: con un fallo
    // parcial el motor tiene que contestar lo MISMO que con un fallo total, o sea que
    // no arranco.
    //
    // Se hereda del AudioContext real en vez de fabricar uno de mentira: asi `state`,
    // `currentTime` y `resume` son los de verdad y lo unico distinto es lo que se
    // quiere romper.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    class SinGain extends AudioContext {
      createGain(): GainNode { throw new Error('sin gain'); }
    }
    vi.stubGlobal('AudioContext', SinGain);

    const e = await conReloj();
    expect(e.audio()).toBeNull();  // primera llamada: explota adentro del try
    expect(e.audio()).toBeNull();  // segunda: el catch dejo `ctx` en null y vuelve a entrar al try

    e.setSequence(CICLO);
    e.startClock();
    // AC3: el reloj no puede arrancar sobre un grafo roto. Si arrancara, la UI
    // preguntaria `clockRunning()` y le contestarian que si.
    expect(e.clockRunning()).toBe(false);

    // Y sigue sin arrancar despues de varios ticks: no hay timer que los dispare.
    await esperar(TICK_MS * 4);
    expect(e.clockRunning()).toBe(false);
    expect(e.sequenceInfo().steps).toBe(0);

    warn.mockRestore();
  });
});
