import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { CELL_PX_OBJETIVO } from '../../board-fit/layout.constants.ts';
import { MARCA } from '../route.constants.ts';
import type { Marca, CeldaPorEstrenar } from '../route.types.ts';

/**
 * La cabeza lectora y el velo, dibujados a mano sobre la grilla.
 *
 * Las dos fuentes van mockeadas —el par de rutas y el offset del motor— porque lo que
 * este archivo hace es TRADUCIR esos tres valores a pixeles: no calcula caminos ni
 * distancias (D5, AC4 del 010). Con el motor real habria que arrancar un reloj y esperar
 * a que la cabeza llegue sola a la celda que se quiere afirmar, que es medir el
 * scheduler otra vez y no lo que este modulo decide.
 *
 * El bucle vive en `playhead-loop.ts` desde este spec, y no es un detalle de este test:
 * mientras estuvo adentro del `useEffect` de un `.tsx` no se podia exportar
 * —`react-refresh/only-export-components`— y por lo tanto no se podia llamar. Es el
 * mismo movimiento con el que el 005 saco el dominio de `App.tsx`.
 *
 * ## Las posiciones se leen COMPUTADAS, no como la cadena escrita
 *
 * El bucle escribe `calc(var(--cell) * n)` y no un producto en pixeles,
 * asi que comparar contra la cadena literal ataria el test a la SINTAXIS en vez de a la
 * posicion. Lo que se afirma es donde queda la cabeza, que es lo que el modulo decide.
 *
 * Y el test tiene que poner `--cell`: `Playhead` se monta solo, sin el contenedor raiz que
 * la cuelga en la app. Sin ella, un `calc()` con una custom property indefinida es una
 * declaracion invalida y el computado sale vacio.
 */

/** Pone `--cell` sobre el contenedor del render, como hace el shell sobre su raiz. */
const conCelda = (container: HTMLElement, px = CELL_PX_OBJETIVO) => {
  container.style.setProperty('--cell', `${px}px`);
  return container;
};
const fuente = vi.hoisted(() => ({
  marcas: [] as (Marca | null)[],
  velo: [] as CeldaPorEstrenar[],
  offset: null as number | null,
}));

vi.mock('../route-source.ts', () => ({
  rutaActiva: () => fuente.marcas,
  velo: () => fuente.velo,
}));
vi.mock('../engine.ts', () => ({
  playheadOffset: () => fuente.offset,
}));

const Playhead = (await import('../Playhead.tsx')).default;
const { iniciarCabeza, borde } = await import('../playhead-loop.ts');
const { NOTA } = await import('../playhead.constants.ts');

/** Dos cuadros: el bucle lee, dibuja y vuelve a agendar en el mismo `draw`. */
const cuadro = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

const nota = (x: number, y: number): Marca => ({ cell: [x, y], kind: MARCA.nota });

beforeEach(() => {
  fuente.marcas = [];
  fuente.velo = [];
  fuente.offset = null;
});

/** Los dos contenedores que monta React: el del velo primero, la cabeza despues. */
const capas = (container: HTMLElement) =>
  [...container.querySelectorAll(':scope > div')] as HTMLElement[];

describe('Playhead — el montaje', () => {
  it('monta dos capas, las dos en z-10 y sin robar el click', async () => {
    const { container } = await render(<Playhead />);
    const [capa, cabeza] = capas(container);

    // El `z-10` es lo que hace que la capa se pinte ENCIMA de las celdas: las baldosas
    // de `Board` son `relative`, o sea posicionadas, y la grilla viene DESPUES en el
    // DOM. Sin z-index la capa queda debajo de todas — y como hasta la celda vacia
    // tiene fondo opaco, queda directamente invisible. Se lee computado y no del
    // `className` a proposito: sin la hoja de estilos cargada esto seria `auto`.
    expect(getComputedStyle(capa).zIndex).toBe('10');
    expect(getComputedStyle(cabeza).zIndex).toBe('10');

    // Van ENCIMA de las celdas, asi que no pueden quedarse con el click de colocar.
    expect(getComputedStyle(capa).pointerEvents).toBe('none');
    expect(getComputedStyle(cabeza).pointerEvents).toBe('none');

    // Y el velo va ANTES que la cabeza: asi una celda que todavia no se estreno igual se
    // resalta cuando le toca, que es el mismo cuadro en que deja de estar tapada.
    expect(capa.compareDocumentPosition(cabeza) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('AC-PLY-029 — arranca oculta: sin reloj no hay nada que marcar', async () => {
    const { container } = await render(<Playhead />);
    const [, cabeza] = capas(container);
    // Montarla visible en (0,0) senalaria una celda que no suena hasta el primer cuadro.
    expect(cabeza.style.display).toBe('none');
  });
});

describe('Playhead — la cabeza', () => {
  it('AC-FIT-018 AC-PLY-030 — salta a la celda del offset, en celdas de `--cell`', async () => {
    fuente.marcas = [nota(3, 2)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    conCelda(container);
    await cuadro();

    const [, cabeza] = capas(container);
    expect(cabeza.style.display).toBe('block');
    // Salta y no se desliza: el instrumento esta cuantizado a la grilla de intervalos.
    const en = (px: number) => {
      conCelda(container, px);
      return getComputedStyle(cabeza).transform;
    };
    expect(en(CELL_PX_OBJETIVO)).toBe(`matrix(1, 0, 0, 1, ${3 * CELL_PX_OBJETIVO}, ${2 * CELL_PX_OBJETIVO})`);
    // Y sigue a `--cell` sin que el bucle vuelva a escribir nada, que es lo que hace que la
    // cabeza quede alineada mientras se arrastra el borde de la ventana (AC6).
    expect(en(180)).toBe(`matrix(1, 0, 0, 1, ${3 * 180}, ${2 * 180})`);
  });

  it('AC-PLY-032 — los tres kinds tienen tres bordes distintos, y el click no pinta afuera', async () => {
    // Nota fuerte, cruce intermedio, click tenue: si dos de los tres se vieran igual, el
    // recorrido mentiria sobre cual de las tres cosas paso.
    const sombraDe = async (kind: Marca['kind']) => {
      fuente.marcas = [{ cell: [1, 1], kind }];
      fuente.offset = 0;
      const { container, unmount } = await render(<Playhead />);
      await cuadro();
      const resalte = capas(container)[1].firstElementChild as HTMLElement;
      const s = resalte.style.boxShadow;
      await unmount();
      return s;
    };

    const deNota = await sombraDe(MARCA.nota);
    const deCruce = await sombraDe(MARCA.cruce);
    const deClick = await sombraDe(MARCA.click);

    expect(new Set([deNota, deCruce, deClick]).size).toBe(3);

    // El click engorda solo hacia adentro: se lee como un roce, y su borde no lleva la
    // segunda sombra. Se cuentan las SOMBRAS y no las comas: el navegador serializa el
    // color como `rgb(15, 23, 42)`, que trae dos comas propias.
    const sombras = (s: string) => s.split(/,(?![^(]*\))/).length;
    expect(sombras(deClick)).toBe(1);
    expect(sombras(deNota)).toBe(2);
    expect(sombras(deCruce)).toBe(2);
  });

  it('se esconde cuando no hay offset, y cuando el offset cae fuera de la tabla', async () => {
    fuente.marcas = [nota(0, 0)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    await cuadro();
    const [, cabeza] = capas(container);
    expect(cabeza.style.display).toBe('block');

    // En pausa: el motor contesta null y la cabeza desaparece.
    fuente.offset = null;
    await cuadro();
    expect(cabeza.style.display).toBe('none');

    // Y un offset sin marca —un silencio del recorrido— tampoco dibuja nada.
    fuente.offset = 7;
    await cuadro();
    expect(cabeza.style.display).toBe('none');
  });

  it('AC-PLY-030 — no reescribe el DOM cuando la celda no cambio', async () => {
    // La clave de lo ULTIMO escrito es lo que baja de 60 escrituras por segundo a entre
    // 4 y 11, y lo que hace que en pausa el loop no toque el DOM ni una vez.
    fuente.marcas = [nota(2, 2), nota(2, 2)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    await cuadro();

    const [, cabeza] = capas(container);
    const escrituras = vi.spyOn(cabeza.style, 'setProperty');
    fuente.offset = 1;   // otra marca, MISMA celda y mismo kind
    await cuadro();
    await cuadro();
    expect(escrituras).not.toHaveBeenCalled();
    escrituras.mockRestore();
  });
});

describe('Playhead — el velo', () => {
  const tapada = (id: string, x: number, y: number, offset: number | null): CeldaPorEstrenar =>
    ({ id, cell: [x, y], offset });

  it('crea una tapa por celda, posicionada sobre su celda', async () => {
    fuente.velo = [tapada('F', 1, 0, 3), tapada('F', 2, 0, 4)];
    const { container } = await render(<Playhead />);
    await cuadro();

    conCelda(container);
    const [capa] = capas(container);
    const tapas = [...capa.children] as HTMLElement[];
    expect(tapas.length).toBe(2);
    const cs = () => getComputedStyle(tapas[0]);
    expect(cs().left).toBe(`${1 * CELL_PX_OBJETIVO}px`);
    expect(cs().top).toBe('0px');
    expect(cs().width).toBe(`${CELL_PX_OBJETIVO}px`);
    // El aire del velo es la MISMA razon que el de la baldosa: si se desalinearan, el velo
    // dejaria de cubrir la celda exacta, que es lo unico que esas medidas garantizan.
    conCelda(container, 180);
    expect(cs().left).toBe(`${1 * 180}px`);
    expect(cs().width).toBe('180px');
    expect(parseFloat(cs().paddingTop) / 180).toBeCloseTo(2 / CELL_PX_OBJETIVO, 3);
  });

  it('AC-PLY-034 — una celda se destapa cuando la cabeza la PISA, no cuando arranca el ciclo', async () => {
    // Es lo unico que hace visible que el orden de reproduccion no es el de colocacion.
    fuente.velo = [tapada('F', 1, 0, 3)];
    fuente.marcas = [nota(0, 0), nota(1, 0), nota(2, 0), nota(1, 0)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    await cuadro();

    const tapa = capas(container)[0].firstElementChild as HTMLElement;
    expect(tapa.style.display).not.toBe('none');

    fuente.offset = 2;   // todavia no llego
    await cuadro();
    expect(tapa.style.display).not.toBe('none');

    fuente.offset = 3;   // le toco
    await cuadro();
    expect(tapa.style.display).toBe('none');
  });

  it('AC-PLY-034 — el `>=` cubre el cuadro perdido: la pestana oculta no deja la celda tapada', async () => {
    fuente.velo = [tapada('F', 1, 0, 2)];
    fuente.marcas = [nota(0, 0), nota(1, 0), nota(2, 0), nota(3, 0), nota(4, 0)];
    fuente.offset = 4;   // se salteo el 2 entero
    const { container } = await render(<Playhead />);
    await cuadro();

    const tapa = capas(container)[0].firstElementChild as HTMLElement;
    // Con igualdad estricta quedaria tapada hasta la vuelta siguiente.
    expect(tapa.style.display).toBe('none');
  });

  it('AC-PLY-034 — una pieza encolada, sin offset, se destapa entera en el swap', async () => {
    // No hay instante que esperar: todavia no entro al ciclo.
    fuente.velo = [tapada('L', 5, 5, null)];
    fuente.marcas = [nota(5, 5)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    await cuadro();

    const capa = capas(container)[0];
    expect((capa.firstElementChild as HTMLElement).style.display).not.toBe('none');

    // El swap: `velo()` devuelve otro array y la tapa desaparece con el.
    fuente.velo = [];
    await cuadro();
    expect(capa.children.length).toBe(0);
  });

  it('rearmar el velo NO vuelve a tapar lo que ya se estreno', async () => {
    // Sin esto, colocar una segunda pieza rearmaria el velo y volveria a tapar celdas
    // que ya se habian estrenado — que es por lo que el estreno se recuerda en el loop y
    // no en `route-source`.
    fuente.velo = [tapada('F', 1, 0, 0)];
    fuente.marcas = [nota(1, 0)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    await cuadro();

    const capa = capas(container)[0];
    expect((capa.firstElementChild as HTMLElement).style.display).toBe('none');

    // La cabeza se corre ANTES de rearmar, y eso no es decorado: con la cabeza todavia
    // parada en la celda, el bucle de estreno la vuelve a destapar en el mismo cuadro y
    // el test pasaria aunque el rearmado no recordara nada. Lo verifico un pase de
    // mutacion — borrar la linea de `estrenadas` sobrevivia sin este paso.
    fuente.offset = null;
    await cuadro();

    // Entra otra pieza: el velo se rearma con las dos.
    fuente.velo = [tapada('F', 1, 0, 0), tapada('L', 8, 4, 6)];
    await cuadro();
    const tapas = [...capa.children] as HTMLElement[];
    expect(tapas.length).toBe(2);
    expect(tapas[0].style.display).toBe('none');      // la ya estrenada sigue destapada
    expect(tapas[1].style.display).not.toBe('none');  // la nueva, tapada
  });

  it('al desmontar vacia la capa y frena el bucle', async () => {
    fuente.velo = [tapada('F', 1, 0, 3)];
    const { container, unmount } = await render(<Playhead />);
    await cuadro();
    const capa = capas(container)[0];
    expect(capa.children.length).toBe(1);

    await unmount();
    expect(capa.children.length).toBe(0);
  });
});

describe('iniciarCabeza — el guardia de los nodos', () => {
  it('sin nodos no arranca nada, y su limpieza no explota', () => {
    // La firma admite `null` porque eso es lo que tiene un `ref.current` recien montado.
    // Con el bucle adentro del componente este camino no lo podia ejercer nadie: React
    // asigna los refs ANTES de correr los efectos, asi que los tres estan siempre.
    for (const nodos of [
      [null, null, null],
      [document.createElement('div'), null, null],
      [document.createElement('div'), document.createElement('div'), null],
    ] as [HTMLElement | null, HTMLElement | null, HTMLElement | null][]) {
      const limpiar = iniciarCabeza(...nodos);
      expect(() => limpiar()).not.toThrow();
    }
  });

  it('`borde` arma la sombra desde los dos numeros del escalon', () => {
    expect(borde(NOTA)).toContain(`inset 0 0 0 ${NOTA.dentro}px`);
    expect(borde({ dentro: 2, fuera: 0 })).not.toContain(',');
  });
});
