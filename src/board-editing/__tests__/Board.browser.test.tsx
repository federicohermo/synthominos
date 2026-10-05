import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import Board from '../Board.tsx';
import {
  CELL_PX_OBJETIVO,
  ANILLO_FOCO_CLARO_RAZON,
  ANILLO_FOCO_OSCURO_RAZON,
} from '../../board-fit/grid-fit.ts';
import { GRID_DEFAULT, cellsAt } from '../placement.ts';
import { SHAPES, ANCHOR_INDEX } from '../../pieces/pieces.ts';
import { REGIMEN } from '../../musical-model/music.ts';
import { rotateN } from '../../pieces/transform.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { PlacedPiece } from '../placement.ts';
import type { Cell } from '../../pieces/transform.ts';

/**
 * El tablero: 60 celdas, cinco tonos y un `title` por celda.
 *
 * Lo que se verifica es la jerarquia de canales que el archivo argumenta —**el color de
 * pieza es IDENTIDAD y pierde contra cualquier ESTADO**— y las dos mediciones de layout
 * que sostiene un comentario: que la grilla mida `GRID_W × --cell` y que eso no empuje
 * scroll horizontal ni al tablero ni a la PAGINA cuando gana el piso.
 *
 * Las dos ultimas necesitan un navegador con viewport: en jsdom no hay ni layout ni
 * scroll, asi que la afirmacion «no empuja scroll a la pagina» seria trivialmente cierta
 * y no verificaria nada.
 *
 * ## `--cell` la escribe el test, y eso es parte de lo que verifica
 *
 * El tamano de celda no es una constante: viaja por una custom property
 * que `use-grid.ts` cuelga del contenedor RAIZ de la app. `Board` se monta solo aca, sin
 * ese contenedor, asi que sin un `--cell` puesto `repeat(10, var(--cell))` es invalido y la
 * grilla colapsa a una columna. Escribirla sobre el nodo que monta el test es lo que ademas
 * verifica la HERENCIA: si alguna medida de la baldosa dejara de leer `--cell`, dejaria de
 * seguir a este valor y las aserciones de abajo lo dirian.
 */

/** Pone `--cell` sobre el contenedor del render, como hace el shell sobre su raiz. */
const conCelda = (container: HTMLElement, px: number) => {
  container.style.setProperty('--cell', `${px}px`);
  return container;
};
// Estos tests dibujan el tablero de REFERENCIA: sus numeros —las 60 celdas, el ancho de
// la grilla, la celda (9,5)— describen ese tamano. Que el tablero real salga del viewport
// lo cubre `grid-fit.test.ts`, y que el componente dibuje lo que le digan, el test de AC1
// de mas abajo, que lo renderiza con tres tamanos distintos.
const { w: GRID_W, h: GRID_H } = GRID_DEFAULT;

const colocar = (piece: PieceKey, x: number, y: number, muted = false): PlacedPiece => ({
  id: piece,
  piece,
  rotation: 0,
  mirror: false,
  cells: cellsAt(rotateN(SHAPES[piece], 0), ANCHOR_INDEX[piece], x, y),
  muted,
});

type Props = Parameters<typeof Board>[0];

const props = (over: Partial<Props> = {}): Props => ({
  dims: GRID_DEFAULT,
  placed: [],
  previewCells: [],
  previewValid: true,
  hover: null,
  selected: 'F',
  rotation: 0,
  mirror: false,
  regimen: REGIMEN.escala,
  onCellClick: vi.fn(),
  onCellEnter: vi.fn(),
  onMouseLeave: vi.fn(),
  focoEnTablero: false,
  onFoco: vi.fn(),
  hoverEdita: false,
  onContextMenu: vi.fn(),
  boardRef: { current: null },
  ...over,
});

/**
 * Las 60 celdas exteriores, en orden de indice: `i = y * GRID_W + x`.
 *
 * Por ROL y no por estructura: la grilla dejo de ser 60 hijos planos y
 * paso a ser seis `role="row"` de diez, asi que `div.grid > div` devuelve las seis filas.
 * El rol ademas sobrevive a que alguien vuelva a mover el `gridTemplateColumns` de nivel,
 * que es exactamente el cambio que rompio este selector.
 */
const celdas = (container: HTMLElement) =>
  [...container.querySelectorAll('[role="gridcell"]')] as HTMLElement[];

const enIndice = (container: HTMLElement, x: number, y: number) => celdas(container)[y * GRID_W + x];
/** La baldosa de adentro, que es la que lleva el tono y el color. */
const baldosa = (celda: HTMLElement) => celda.firstElementChild as HTMLElement;

describe('Board', () => {
  it('AC-FIT-013 — son GRID_W × GRID_H celdas, y cada una mide lo que dice `--cell`', async () => {
    const { container } = await render(<Board {...props()} />);
    expect(celdas(container).length).toBe(GRID_W * GRID_H);

    // Al piso y al techo: la celda sigue al valor, que es lo que la custom property promete y lo
    // que una constante no podia decir.
    for (const px of [CELL_PX_OBJETIVO, 180]) {
      conCelda(container, px);
      const c = enIndice(container, 0, 0).getBoundingClientRect();
      expect(Math.round(c.width), `${px}`).toBe(px);
      expect(Math.round(c.height), `${px}`).toBe(px);
    }
  });

  it('AC-FIT-014 AC-FIT-015 — las medidas de la baldosa son RAZONES: al techo dan las mismas que al piso', async () => {
    // No solo las dos fuentes. De la reserva, el aire, el redondeo y la posicion del `#N`
    // depende que la baldosa «se lea como una ficha y no como un casillero»: si crecieran
    // solo las letras, a celda 180 la nota quedaria apretada contra un aire de 2 px.
    const { container } = await render(<Board {...props({ placed: [colocar('F', 3, 2)] })} />);
    const razones = (px: number) => {
      conCelda(container, px);
      const celda = enIndice(container, 3, 2);
      const tile = baldosa(celda);
      const paso = tile.querySelector('span')!;
      const cs = getComputedStyle(celda);
      const ct = getComputedStyle(tile);
      const cp = getComputedStyle(paso);
      return {
        aire: parseFloat(cs.paddingTop) / px,
        radio: parseFloat(ct.borderTopLeftRadius) / px,
        reserva: parseFloat(ct.paddingBottom) / px,
        nota: parseFloat(ct.fontSize) / px,
        pasoTamano: parseFloat(cp.fontSize) / px,
        pasoAbajo: parseFloat(cp.bottom) / px,
      };
    };

    const alPiso = razones(CELL_PX_OBJETIVO);
    const alTecho = razones(180);
    // Que el layout exista: en jsdom todo esto seria 0 y las dos serian iguales por vacias.
    expect(alPiso.nota).toBeGreaterThan(0);
    for (const clave of Object.keys(alPiso) as (keyof typeof alPiso)[]) {
      // La tolerancia es de ±0,5 px sobre la celda mas chica, que es el redondeo del
      // navegador y no una holgura de criterio.
      expect(alTecho[clave], clave).toBeCloseTo(alPiso[clave], 2);
    }
    // Y al piso los px son los de siempre, que es AC4: la nota a 19 y el `#N` a 13.
    expect(alPiso.nota * CELL_PX_OBJETIVO).toBeCloseTo(19, 0);
    expect(alPiso.pasoTamano * CELL_PX_OBJETIVO).toBeCloseTo(13, 0);
  });

  it('AC-FIT-016 — el borde de 1 px NO escala, y sigue separando al techo', async () => {
    // Es el unico numero fijo que sobrevive: un filete es un delimitador y no un elemento
    // tipografico, y en `calc()` daria fracciones que el navegador redondea distinto por
    // arista — sobre 60 celdas adyacentes, un enrejado irregular.
    const { container } = await render(<Board {...props({ placed: [colocar('F', 3, 2)] })} />);
    for (const px of [CELL_PX_OBJETIVO, 180]) {
      conCelda(container, px);
      const ancho = getComputedStyle(baldosa(enIndice(container, 3, 2))).borderTopWidth;
      expect(ancho, `${px}`).toBe('1px');
    }
  });

  it('AC-FIT-009 — la grilla mide lo que dicen `dims` y `--cell`, y nada scrollea', async () => {
    // Lo que este test llego a verificar era lo contrario: que el tablero
    // SCROLLEARA cuando no entraba, para no achicar la celda. Hoy no puede no entrar
    // —`grillaPara` elige `cols` y `rows` contra la caja, asi que `cols * cell <= vw`— y
    // lo que hay que fijar es que no quede una sola forma de scrollear: ni el tablero, ni
    // la pagina, ni con la ventana chica.
    await page.viewport(375, 800);
    try {
      // Tres tableros bien distintos, incluido uno mas ancho que el viewport de 375 px si
      // la celda no se hubiera achicado: el componente dibuja lo que le dicen.
      for (const dims of [GRID_DEFAULT, { w: 5, h: 9 }, { w: 26, h: 15 }]) {
        const { container, unmount } = await render(<Board {...props({ dims })} />);
        const cell = Math.min(375 / dims.w, 800 / dims.h);
        conCelda(container, cell);
        const grilla = container.querySelector('[role="grid"]')!;
        expect(Math.round(grilla.getBoundingClientRect().width), `${dims.w}x${dims.h}`)
          .toBe(Math.round(dims.w * cell));
        expect(container.querySelectorAll('[role="gridcell"]').length).toBe(dims.w * dims.h);

        // Ni el tablero scrollea —no hay contenedor que pueda—…
        const caja = container.querySelector('div.relative')!;
        expect(caja.scrollWidth, `${dims.w}x${dims.h}`).toBeLessThanOrEqual(caja.clientWidth + 1);
        // …ni la pagina.
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
          document.documentElement.clientWidth + 1,
        );
        await unmount();
      }
    } finally {
      await page.viewport(800, 600);
    }
  });

  it('la celda ocupada lleva el color de SU pieza, inline', async () => {
    const { container } = await render(<Board {...props({ placed: [colocar('F', 2, 2)] })} />);
    const ocupada = colocar('F', 2, 2).cells[0];
    const b = baldosa(enIndice(container, ocupada[0], ocupada[1]));

    // Inline y no una clase: Tailwind escanea el fuente, asi que un `bg-[...]`
    // interpolado desde `PIECE_COLOR` no se generaria.
    expect(b.style.background).not.toBe('');
    expect(b.style.color).not.toBe('');
    expect(b.className).toContain('shadow-sm');
  });

  it('AC-BRD-012 — la pieza MUTEADA cae al blanco y conserva su nota y su #N', async () => {
    // El canal es la AUSENCIA de color, y no uno de los dos obvios: el color es
    // identidad de pieza y la opacidad la usa `Playhead` para el velo del estreno.
    const [x, y] = colocar('F', 2, 2).cells[0];
    const { container } = await render(<Board {...props({ placed: [colocar('F', 2, 2, true)] })} />);
    const celda = enIndice(container, x, y);
    const b = baldosa(celda);

    expect(b.className).toContain('bg-white');
    expect(b.style.background).toBe('');
    // No se confunde con una celda libre porque una libre no tiene texto.
    expect(b.textContent).not.toBe('');
    expect(b.querySelector('span')!.textContent).toMatch(/^#\d$/);
    // La coordenada sale del propio `cells[0]`, que NO es el ancla: el ancla es la
    // celda de agarre y `cells[0]` es la primera del array, dos cosas distintas.
    expect(celda.getAttribute('title')).toMatch(new RegExp(`^\\(${x},${y}\\) · .+ · paso \\d$`));
  });

  it('AC-BRD-013 — el choque contra una pieza colocada gana sobre el color', async () => {
    // El color de pieza es IDENTIDAD y pierde contra cualquier ESTADO.
    const pieza = colocar('F', 2, 2);
    const [x, y] = pieza.cells[0];
    const { container } = await render(
      <Board {...props({ placed: [pieza], previewCells: [[x, y] as Cell], previewValid: false })} />,
    );
    const b = baldosa(enIndice(container, x, y));
    expect(b.className).toContain('bg-rose-500');
    expect(b.style.background).toBe('');
  });

  it('AC-BRD-013 — el fantasma es gris cuando entra y rosa cuando no', async () => {
    const gris = await render(<Board {...props({ previewCells: [[5, 5] as Cell], previewValid: true })} />);
    expect(baldosa(enIndice(gris.container, 5, 5)).className).toContain('bg-slate-300');
    await gris.unmount();

    const rosa = await render(<Board {...props({ previewCells: [[5, 5] as Cell], previewValid: false })} />);
    // El rosa es el unico canal que dice "aca no entra" ademas del cursor.
    expect(baldosa(enIndice(rosa.container, 5, 5)).className).toContain('bg-rose-300');
  });

  it('una celda libre no tiene texto, y su title dice solo la coordenada', async () => {
    const { container } = await render(<Board {...props()} />);
    const celda = enIndice(container, 7, 4);
    expect(baldosa(celda).textContent).toBe('');
    expect(celda.getAttribute('title')).toBe('(7,4)');
  });

  it('el fantasma promete la nota que la pieza va a decir, con el regimen que baja', async () => {
    // Es la mitad visible de AC7 del 017: el mismo `regimen` gobierna las dos llamadas a
    // `cellTextFor`, la de la pieza colocada y la del fantasma.
    const celdasF = colocar('F', 2, 2).cells;
    const escala = await render(
      <Board {...props({ previewCells: celdasF, regimen: REGIMEN.escala })} />,
    );
    const notaEscala = enIndice(escala.container, celdasF[0][0], celdasF[0][1]).getAttribute('title');
    await escala.unmount();

    const orden = await render(
      <Board {...props({ previewCells: celdasF, regimen: REGIMEN.orden, rotation: 1 })} />,
    );
    const notaOrden = enIndice(orden.container, celdasF[0][0], celdasF[0][1]).getAttribute('title');

    expect(notaEscala).toMatch(/paso \d$/);
    expect(notaOrden).not.toBe(notaEscala);
  });

  it('el click entrega la celda y el altKey, que es lo que distingue mutear de colocar', async () => {
    const onCellClick = vi.fn();
    const { container } = await render(<Board {...props({ onCellClick })} />);

    enIndice(container, 3, 1).click();
    expect(onCellClick).toHaveBeenLastCalledWith(3, 1, false);

    enIndice(container, 3, 1).dispatchEvent(
      new MouseEvent('click', { bubbles: true, altKey: true }),
    );
    expect(onCellClick).toHaveBeenLastCalledWith(3, 1, true);
  });

  it('el hover entra y sale, y el boton derecho llega al handler', async () => {
    const onCellEnter = vi.fn();
    const onMouseLeave = vi.fn();
    const onContextMenu = vi.fn();
    const { container } = await render(
      <Board {...props({ onCellEnter, onMouseLeave, onContextMenu })} />,
    );

    enIndice(container, 4, 2).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.waitFor(() => expect(onCellEnter).toHaveBeenCalledWith([4, 2]));

    container.querySelector('[role="grid"]')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    await vi.waitFor(() => expect(onMouseLeave).toHaveBeenCalled());

    // `contextmenu` NO esta entre los tres eventos que React registra pasivos, asi que
    // el boton derecho si puede ir por prop.
    container.querySelector('div.relative')!
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    expect(onContextMenu).toHaveBeenCalled();
  });

  it('AC-BRD-015 — el cursor dice "aca no entra" salvo donde el click EDITA', async () => {
    // Sobre una celda propia la jugada de colocar es invalida —la pieza se choca consigo
    // misma— pero el click no coloca, borra. Sin `hoverEdita` el cursor diria lo
    // contrario de lo que pasa justo donde el gesto es destructivo.
    const base = { previewValid: false, hover: [2, 2] as Cell };

    const prohibido = await render(<Board {...props({ ...base, hoverEdita: false })} />);
    expect(enIndice(prohibido.container, 0, 0).className).toContain('cursor-not-allowed');
    await prohibido.unmount();

    const edita = await render(<Board {...props({ ...base, hoverEdita: true })} />);
    expect(enIndice(edita.container, 0, 0).className).toContain('cursor-pointer');
    await edita.unmount();

    // Y sin hover no hay jugada que prohibir.
    const sinHover = await render(<Board {...props({ previewValid: false, hover: null })} />);
    expect(enIndice(sinHover.container, 0, 0).className).toContain('cursor-pointer');
  });

  it('el ref del tablero queda colgado del nodo que scrollea, que es donde engancha la rueda', async () => {
    const boardRef: { current: HTMLDivElement | null } = { current: null };
    const { container } = await render(<Board {...props({ boardRef })} />);
    expect(boardRef.current).toBe(container.querySelector('div.relative'));
  });
});

/**
 * El teclado: el tablero es UNA parada de tabulacion, adentro se mueve con las
 * flechas, y las cuatro acciones salen de la misma pura que el click.
 *
 * Necesita navegador de verdad y no jsdom por lo mismo que las mediciones de arriba: lo
 * que se verifica es DONDE quedo el foco del DOM despues de una tecla, y que el anillo no
 * agrande la region scrolleable. Las dos cosas son layout y foco reales.
 */
const tecla = (el: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
  const evento = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(evento);
  return evento;
};

describe('Board — el teclado y el foco', () => {
  it('AC-ACC-012 — es un `grid` de seis filas por diez celdas, con UNA sola parada de tabulacion', async () => {
    // Filas de verdad y no `display: contents`: `role="grid"` exige `role="row"`, y la
    // tecnica del envoltorio transparente tiene historial de SACAR el nodo del arbol de
    // accesibilidad en varios navegadores — o sea fallar en silencio, justo en lo que este
    // spec viene a arreglar.
    const { container } = await render(<Board {...props()} />);
    const grilla = container.querySelector('[role="grid"]')!;
    const filas = [...grilla.querySelectorAll('[role="row"]')];
    expect(filas.length).toBe(GRID_H);
    for (const fila of filas) expect(fila.querySelectorAll('[role="gridcell"]').length).toBe(GRID_W);

    // Sesenta paradas convertirian la tarjeta en una trampa de salida: lo que venga detras
    // del tablero quedaria a sesenta pulsaciones, ida y vuelta.
    expect(celdas(container).filter(c => c.tabIndex === 0).length).toBe(1);
  });

  it('AC-ACC-014 — el `0` arranca en la primera celda y viaja con el cursor', async () => {
    // Con el cursor apagado el ancla es la (0,0), para que `Tab` siga teniendo por donde
    // entrar; con cursor, el `0` esta donde esta el cursor.
    const sinCursor = await render(<Board {...props()} />);
    expect(enIndice(sinCursor.container, 0, 0).tabIndex).toBe(0);
    await sinCursor.unmount();

    const conCursor = await render(<Board {...props({ hover: [4, 2] as Cell })} />);
    expect(enIndice(conCursor.container, 4, 2).tabIndex).toBe(0);
    expect(enIndice(conCursor.container, 0, 0).tabIndex).toBe(-1);
  });

  it('AC-ACC-015 — las flechas mueven el foco una celda y frenan el default, sin salirse de la grilla', async () => {
    const { container } = await render(<Board {...props({ hover: [0, 0] as Cell })} />);
    const origen = enIndice(container, 0, 0);
    origen.focus();

    // Sin `preventDefault` la flecha scrollea la pagina Y el `overflow-x-auto` del tablero.
    expect(tecla(origen, 'ArrowRight').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(enIndice(container, 1, 0));
    tecla(enIndice(container, 1, 0), 'ArrowDown');
    expect(document.activeElement).toBe(enIndice(container, 1, 1));
    tecla(enIndice(container, 1, 1), 'ArrowLeft');
    expect(document.activeElement).toBe(enIndice(container, 0, 1));
    tecla(enIndice(container, 0, 1), 'ArrowUp');
    expect(document.activeElement).toBe(origen);

    // En el borde la flecha no se sale: deja el foco donde estaba, y frena el default
    // igual —el scroll que hay que evitar es el mismo.
    expect(tecla(origen, 'ArrowUp').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(origen);
    tecla(origen, 'ArrowLeft');
    expect(document.activeElement).toBe(origen);

    const ultima = enIndice(container, GRID_W - 1, GRID_H - 1);
    ultima.focus();
    tecla(ultima, 'ArrowRight');
    expect(document.activeElement).toBe(ultima);
    tecla(ultima, 'ArrowDown');
    expect(document.activeElement).toBe(ultima);
  });

  it('`Home` y `End` van a los extremos de SU fila, no del tablero', async () => {
    const { container } = await render(<Board {...props()} />);
    const media = enIndice(container, 5, 3);
    media.focus();

    tecla(media, 'End');
    expect(document.activeElement).toBe(enIndice(container, GRID_W - 1, 3));
    tecla(enIndice(container, GRID_W - 1, 3), 'Home');
    expect(document.activeElement).toBe(enIndice(container, 0, 3));
  });

  it('AC-ACC-018 — una tecla que no es del tablero no frena nada ni mueve el foco', async () => {
    // `Shift` y `Ctrl` siguen rotando y reflejando con una celda enfocada: el tablero se
    // queda la barra, el `Enter` y las flechas, y deja pasar todo lo demas.
    const { container } = await render(<Board {...props()} />);
    const celda = enIndice(container, 2, 2);
    celda.focus();
    expect(tecla(celda, 'Shift').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(celda);
  });

  it('AC-ACC-019 — `Enter` y `Espacio` hacen lo que el click, y con `Alt` lo que `Alt`+click', async () => {
    // Las cuatro salen de `accionDeClick` porque las cuatro entran por el MISMO
    // `onCellClick` que el `onClick`: la regla no se escribe una segunda vez.
    const onCellClick = vi.fn();
    const { container } = await render(<Board {...props({ onCellClick })} />);
    const celda = enIndice(container, 3, 1);

    tecla(celda, 'Enter');
    expect(onCellClick).toHaveBeenLastCalledWith(3, 1, false);
    tecla(celda, ' ');
    expect(onCellClick).toHaveBeenLastCalledWith(3, 1, false);
    tecla(celda, 'Enter', { altKey: true });
    expect(onCellClick).toHaveBeenLastCalledWith(3, 1, true);
    tecla(celda, ' ', { altKey: true });
    expect(onCellClick).toHaveBeenLastCalledWith(3, 1, true);
  });

  it('AC-ACC-021 — el foco entra a una celda y sale del tablero, y saltar entre celdas NO es salir', async () => {
    const onFoco = vi.fn();
    const { container } = await render(<Board {...props({ onFoco })} />);
    const celda = enIndice(container, 2, 4);
    celda.focus();
    await vi.waitFor(() => expect(onFoco).toHaveBeenLastCalledWith([2, 4]));

    // Mover el foco es siempre un `blur` seguido de un `focus`: sin la pregunta por
    // `relatedTarget`, cada flecha apagaria el cursor a mitad de camino.
    onFoco.mockClear();
    tecla(celda, 'ArrowRight');
    await vi.waitFor(() => expect(onFoco).toHaveBeenLastCalledWith([3, 4]));
    expect(onFoco).not.toHaveBeenCalledWith(null);

    // Y salir del tablero si lo apaga, que es lo que hace hoy el `onMouseLeave`.
    onFoco.mockClear();
    enIndice(container, 3, 4).blur();
    await vi.waitFor(() => expect(onFoco).toHaveBeenLastCalledWith(null));
  });

  it('AC-ACC-022 — con el tablero enfocado el mouse queda INERTE, y sin foco escribe el cursor', async () => {
    // AC16 del otro lado: mientras el foco esta adentro, manda el foco. Sin foco el mouse
    // escribe el cursor como siempre.
    const onCellEnter = vi.fn();
    const sinFoco = await render(<Board {...props({ onCellEnter })} />);
    enIndice(sinFoco.container, 4, 2).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.waitFor(() => expect(onCellEnter).toHaveBeenCalledWith([4, 2]));
    await sinFoco.unmount();

    // La version que ARRASTRABA el foco con el mouse se escribio y se cayo medida: el
    // `mouseenter` no lo dispara solo mover el mouse, tambien lo dispara cualquier scroll
    // —el navegador recalcula que hay bajo el puntero quieto—, asi que cada `.focus()` de
    // una flecha que scrollea devolvia el foco a la celda de abajo del mouse. Se afirman
    // las dos mitades: que el cursor no se mueve Y que el foco no se va a ninguna parte.
    onCellEnter.mockClear();
    const conFoco = await render(<Board {...props({ onCellEnter, focoEnTablero: true, hover: [0, 0] as Cell })} />);
    const ancla = enIndice(conFoco.container, 0, 0);
    ancla.focus();
    enIndice(conFoco.container, 4, 2).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    expect(onCellEnter).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(ancla);
  });

  it('AC-ACC-024 AC-FIT-017 — el anillo es de TECLADO: se pinta con el foco adentro y no bajo el mouse', async () => {
    // Dos propiedades y no una: un `outline` de CSS tiene un solo color, y abajo puede
    // haber el `#FFFF00` de la `V` o el `#0000FF` de la `W`.
    const conMouse = await render(<Board {...props({ hover: [4, 2] as Cell })} />);
    expect(enIndice(conMouse.container, 4, 2).style.outline).toBe('');
    expect(enIndice(conMouse.container, 4, 2).style.boxShadow).toBe('');
    await conMouse.unmount();

    const conFoco = await render(<Board {...props({ hover: [4, 2] as Cell, focoEnTablero: true })} />);
    const enfocada = enIndice(conFoco.container, 4, 2);
    expect(enfocada.style.outline).toContain('calc(');
    // El anillo es una RAZON de la celda, asi que se lee el COMPUTADO y
    // no la cadena escrita: comparar el literal ataria el test a la sintaxis del `calc()`
    // en vez de a lo que el anillo mide. Se verifica al TECHO, que es donde el bug vive: con
    // los dos anchos clavados en 2 px, a celda 180 el aire mide 4,93 y las dos bandas caen
    // adentro de el — la clara deja de pisar la baldosa y el anillo queda de un solo tono.
    conCelda(conFoco.container, 180);
    const cs = getComputedStyle(enfocada);
    // Chromium redondea `outline-width` y `outline-offset` a pixeles ENTEROS, asi que se
    // comparan contra el par floor/ceil y no con una igualdad: 4,93 computa a 4. Lo que
    // importa es que hayan CRECIDO con la celda —a 73 valian 2 y -4— y no el decimal.
    const entre = (valor: number, exacto: number) => {
      expect(valor).toBeGreaterThanOrEqual(Math.floor(exacto));
      expect(valor).toBeLessThanOrEqual(Math.ceil(exacto));
    };
    entre(parseFloat(cs.outlineWidth), 180 * ANILLO_FOCO_CLARO_RAZON);
    entre(parseFloat(cs.outlineOffset), -180 * (ANILLO_FOCO_OSCURO_RAZON + ANILLO_FOCO_CLARO_RAZON));
    expect(parseFloat(cs.outlineWidth)).toBeGreaterThan(2);
    expect(cs.boxShadow).toContain('inset');
    // Una sola celda con anillo, como una sola con `tabIndex={0}`.
    expect(celdas(conFoco.container).filter(c => c.style.outline !== '').length).toBe(1);
  });

  it('AC-ACC-025 — el anillo NO agranda la region scrolleable, que es lo que `scale` haria', async () => {
    // La medicion que el repo ya pago para la cabeza lectora: `scale` cuenta para el
    // overflow scrolleable y hace aparecer las dos barras. `outline` y `box-shadow` son
    // ink overflow, y dibujados hacia adentro ni siquiera asoman de la caja.
    // Se corre a celda 180 —mucho mas grande que la real— porque es donde el anillo es mas
    // grande: las dos bandas miden 4,93 px cada una en vez de 2. Que la app no dibuje
    // celdas de 180 px no le saca sentido: lo que se verifica es que el anillo no asome de
    // la caja a NINGUN tamano.
    const esquina = [GRID_W - 1, GRID_H - 1] as Cell;
    const sinFoco = await render(<Board {...props({ hover: esquina })} />);
    conCelda(sinFoco.container, 180);
    const antes = sinFoco.container.querySelector('div.relative')!;
    const medida = [antes.scrollWidth, antes.scrollHeight];
    await sinFoco.unmount();

    const conFoco = await render(<Board {...props({ hover: esquina, focoEnTablero: true })} />);
    conCelda(conFoco.container, 180);
    const despues = conFoco.container.querySelector('div.relative')!;
    expect([despues.scrollWidth, despues.scrollHeight]).toEqual(medida);
  });

  it('AC-ACC-026 — cada celda tiene nombre accesible, y el fantasma NO lo cambia', async () => {
    // El `title` deja de ser el unico texto y pasa a ser el eco del nombre: lo que anuncia
    // el lector de pantalla es el `aria-label`, con la coordenada en prosa y el total del
    // paso, que es lo que el `title` no dice.
    const pieza = colocar('F', 2, 2, true);
    const [x, y] = pieza.cells[0];
    const { container } = await render(
      <Board {...props({ placed: [pieza], previewCells: [[7, 4] as Cell] })} />,
    );
    const nombre = enIndice(container, x, y).getAttribute('aria-label')!;
    expect(nombre).toMatch(
      new RegExp(`^fila ${y + 1}, columna ${x + 1}, pieza F muteada, nota .+, paso \\d de 4$`),
    );
    // Y el `title` es el ECO: la misma nota y el mismo paso, sin renumerar, en el canal del
    // mouse. Si alguno de los dos derivara por su cuenta, esta comparacion se rompe.
    const [, nota, paso] = enIndice(container, x, y).getAttribute('title')!.split(' · ');
    expect(nombre).toContain(`nota ${nota},`);
    expect(nombre).toContain(`${paso} de 4`);

    // La celda del fantasma tiene nota y paso pintados, y su nombre dice "libre": el
    // nombre no puede cambiar con el cursor, porque el foco no se movio.
    expect(baldosa(enIndice(container, 7, 4)).textContent).not.toBe('');
    expect(enIndice(container, 7, 4).getAttribute('aria-label')).toBe('fila 5, columna 8, libre');
  });
});
