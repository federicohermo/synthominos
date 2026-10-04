import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import OrientationPanel from '../OrientationPanel.tsx';
import { MINI_BOX, MINI_CELL_PX } from '../../../board-fit/ui/layout.constants.ts';
import { PIECE_COLOR } from '../../../pieces/ui/palette.constants.ts';
import { SHAPES } from '../../../pieces/domain/pieces.constants.ts';
import { REGIMEN } from '../../../musical-model/domain/music.constants.ts';
import { ORIENTACIONES_INICIALES } from '../../../pieces/ui/orientation.constants.ts';
import type { PieceKey } from '../../../pieces/domain/pieces.types.ts';
import type { PropsDeOrientacion } from '../panel.types.ts';
import type { MemoriaDeOrientacion, Orientacion } from '../../../pieces/ui/orientation.types.ts';

/**
 * Las doce miniaturas.
 *
 * Lo que se verifica es lo que el archivo ARGUMENTA con mediciones y hasta hoy sostenia
 * solo un comentario: que la caja de 5×5 sea FIJA —o sea que rotar no mueva un pixel de
 * la grilla— y que el borde de las celdas se INVIERTA con el estado del boton, que es
 * una decision de contraste medida contra los dos fondos y no una eleccion estetica.
 *
 * Las dos necesitan layout de verdad: la primera se mide con `getBoundingClientRect` y
 * la segunda con `getComputedStyle`, y en jsdom las dos devuelven ceros y valores
 * iniciales.
 */
const PIEZAS = Object.keys(SHAPES) as PieceKey[];

/** Las doce en cero con las ranuras que el test quiera pisar. */
const memoria = (pisadas: Partial<MemoriaDeOrientacion> = {}): MemoriaDeOrientacion =>
  ({ ...ORIENTACIONES_INICIALES, ...pisadas });

/** Las doce en la MISMA orientacion, que es lo que el panel hacia con una global. */
const todas = (o: Orientacion): MemoriaDeOrientacion =>
  Object.fromEntries(PIEZAS.map(p => [p, o])) as MemoriaDeOrientacion;

const orientacion = (over: Partial<PropsDeOrientacion> = {}): PropsDeOrientacion => ({
  selected: 'F',
  // `rotation`/`mirror` sueltos salieron de `PropsDeOrientacion`: el panel
  // necesita las DOCE, porque cada miniatura se dibuja en la suya. `onRotate` y `onMirror`
  // se habian ido con el 019, que borro los botones que los llamaban.
  //
  // Lo que NO cambia son las aserciones de nombre —`F, rotación 90°, reflejada` y
  // `Z, rotación 180°`—: siguen verificando que el `aria-label` no se degrado al formato
  // visible cuando paso a consumir la pura de `orientation-text.ts`.
  orientaciones: ORIENTACIONES_INICIALES,
  regimen: REGIMEN.escala,
  noteSet: [60, 62, 64, 67, 69],
  onSelect: vi.fn(),
  onRegimen: vi.fn(),
  onResetOrientacion: vi.fn(),
  ...over,
});

describe('OrientationPanel', () => {
  it('AC-PNL-013 — son las doce, cada una con su letra', async () => {
    const { container } = await render(<OrientationPanel orientacion={orientacion()} />);
    const botones = container.querySelectorAll('button');
    expect(botones.length).toBe(PIEZAS.length);
    for (const key of PIEZAS) {
      expect(container.textContent).toContain(key);
    }
  });

  it('AC-ACC-009 — el nombre accesible dice la orientacion ACTUAL, no la canonica', async () => {
    // La miniatura muestra como esta puesta la pieza, asi que el lector de pantalla
    // tiene que decir lo mismo que el ojo ve.
    const a = await render(<OrientationPanel orientacion={orientacion({
      orientaciones: memoria({ F: { rotation: 1, mirror: true } }),
    })} />);
    await expect.element(page.getByRole('button', { name: 'F, rotación 90°, reflejada' })).toBeVisible();
    await a.unmount();

    await render(<OrientationPanel orientacion={orientacion({
      orientaciones: memoria({ Z: { rotation: 2, mirror: false } }),
    })} />);
    await expect.element(page.getByRole('button', { name: 'Z, rotación 180°' })).toBeVisible();
  });

  it('AC-ACC-009 AC-PNL-032 — cada miniatura dice y dibuja SU orientacion, no la de la pieza en la mano', async () => {
    // AC4. Doce orientaciones distintas de una: si el panel siguiera leyendo un solo par
    // para las doce, once de estos nombres saldrian mal.
    const distintas = Object.fromEntries(
      PIEZAS.map((p, i) => [p, { rotation: (i % 4) as 0 | 1 | 2 | 3, mirror: i % 2 === 1 }]),
    ) as MemoriaDeOrientacion;
    const { container } = await render(
      <OrientationPanel orientacion={orientacion({ orientaciones: distintas })} />,
    );
    for (const [i, key] of PIEZAS.entries()) {
      const boton = [...container.querySelectorAll('button')]
        .find(b => b.getAttribute('aria-label')!.startsWith(`${key},`))!;
      const grados = (i % 4) * 90;
      const esperado = `${key}, rotación ${grados}°${i % 2 === 1 ? ', reflejada' : ''}`;
      expect(boton.getAttribute('aria-label'), key).toBe(esperado);
    }
  });

  it('AC-PNL-032 — rotar UNA pieza deja las otras once exactamente como estaban', async () => {
    // AC3, el criterio que le da nombre al spec: hasta el 019 rotar movia 11 de las 12
    // miniaturas. Se comparan los nombres Y las celdas pintadas, que es lo que atrapa el
    // caso «el `aria-label` sigue a su ranura pero el dibujo sigue a otra».
    const huella = (c: HTMLElement) => [...c.querySelectorAll('button')].map(b => ({
      nombre: b.getAttribute('aria-label'),
      celdas: [...b.querySelectorAll('div.grid > div')]
        .map((d, i) => ((d as HTMLElement).style.background !== '' ? i : -1))
        .filter(i => i >= 0).join(','),
    }));

    const antes = await render(<OrientationPanel orientacion={orientacion()} />);
    const base = huella(antes.container);
    await antes.unmount();

    const { container } = await render(<OrientationPanel orientacion={orientacion({
      orientaciones: memoria({ L: { rotation: 3, mirror: true } }),
    })} />);
    const ahora = huella(container);

    for (const [i, key] of PIEZAS.entries()) {
      if (key === 'L') {
        expect(ahora[i], 'la L tiene que haber cambiado').not.toEqual(base[i]);
      } else {
        expect(ahora[i], key).toEqual(base[i]);
      }
    }
  });

  it('AC-PNL-013 — rotar NO mueve un pixel de la grilla, que es para lo que la caja es fija', async () => {
    // El bug que la caja fija existe para evitar: con pistas automaticas la `I` sola
    // pasa de 5 celdas de ancho a 1 al rotar y hace saltar la fila entera. Se mide el
    // ancho de CADA boton en las cuatro rotaciones y los dos espejos.
    const medir = async (orientaciones: MemoriaDeOrientacion) => {
      const { container, unmount } = await render(
        <OrientationPanel orientacion={orientacion({ orientaciones })} />,
      );
      const anchos = [...container.querySelectorAll('button')]
        .map(b => Math.round(b.getBoundingClientRect().width));
      const altos = [...container.querySelectorAll('button')]
        .map(b => Math.round(b.getBoundingClientRect().height));
      await unmount();
      return { anchos, altos };
    };

    const base = await medir(todas({ rotation: 0, mirror: false }));
    // Que el layout exista de verdad: en jsdom esto seria 0 y el test pasaria vacio.
    expect(base.anchos[0]).toBeGreaterThan(0);

    for (const rotation of [1, 2, 3] as const) {
      for (const mirror of [false, true]) {
        const { anchos, altos } = await medir(todas({ rotation, mirror }));
        expect(anchos, `rot${rotation}${mirror ? ' mirror' : ''}`).toEqual(base.anchos);
        expect(altos, `rot${rotation}${mirror ? ' mirror' : ''}`).toEqual(base.altos);
      }
    }

    // AC12: con las doce en orientaciones DISTINTAS tampoco se mueve, que es
    // el caso que hasta este spec no podia existir. Las ocho combinaciones repartidas
    // entre doce botones incluyen a la `I` acostada al lado de la `I` parada… salvo que
    // hay una sola `I`, asi que el peor caso real es cada pieza en su peor forma a la vez.
    const distintas = Object.fromEntries(
      PIEZAS.map((p, i) => [p, { rotation: (i % 4) as 0 | 1 | 2 | 3, mirror: i % 2 === 1 }]),
    ) as MemoriaDeOrientacion;
    const mezcla = await medir(distintas);
    expect(mezcla.anchos, 'doce orientaciones distintas').toEqual(base.anchos);
    expect(mezcla.altos, 'doce orientaciones distintas').toEqual(base.altos);
  });

  it('AC-PNL-013 — la caja mide 5 × MINI_CELL_PX, y no lo que ocupe la pieza', async () => {
    // Se afirma el TAMANO y no solo la cantidad de pistas: con `min-content` las cinco
    // pistas siguen existiendo pero colapsan a cero, y el test de "rotar no mueve nada"
    // sigue pasando porque colapsan todas igual. Lo verifico un pase de mutacion — ese
    // cambio sobrevivia sin esta linea.
    const { container } = await render(<OrientationPanel orientacion={orientacion()} />);
    for (const boton of container.querySelectorAll('button')) {
      const caja = boton.querySelector('div.grid')!;
      // 25 celdas dibujadas, llenas o no: es lo que hace que el tamano no dependa de
      // que celdas esten ocupadas.
      expect(caja.children.length).toBe(MINI_BOX * MINI_BOX);

      const pistas = getComputedStyle(caja).gridTemplateColumns.split(' ');
      expect(pistas.length).toBe(MINI_BOX);
      for (const p of pistas) expect(Math.round(parseFloat(p))).toBe(MINI_CELL_PX);
      expect(Math.round(caja.getBoundingClientRect().width)).toBe(MINI_BOX * MINI_CELL_PX);
    }
  });

  it('AC-PNL-014 — la forma se pinta del color de la pieza, y el fondo del boton NO', async () => {
    // El fondo del boton es el canal de "seleccionada": pintarlo del color de pieza
    // dejaria a la paleta sin decir cual esta activa.
    const { container } = await render(<OrientationPanel orientacion={orientacion({ selected: 'F' })} />);
    const boton = container.querySelector('button')!;
    const llenas = [...boton.querySelectorAll('div.grid > div')]
      .filter(d => (d as HTMLElement).style.background !== '');

    expect(llenas.length).toBe(SHAPES.F.length);
    expect(getComputedStyle(boton).backgroundColor).not.toBe(PIECE_COLOR.F.bg);
  });

  it('AC-PNL-014 — el borde se INVIERTE con el estado, y los dos colores son distintos', async () => {
    // No es cosmetica: en cada estado falla un conjunto DISJUNTO de piezas contra el
    // piso 3:1 de WCAG 1.4.11, y un solo color no cubre los dos fondos.
    const bordeDe = async (selected: PieceKey, mira: PieceKey) => {
      const { container, unmount } = await render(
        <OrientationPanel orientacion={orientacion({ selected })} />,
      );
      const boton = [...container.querySelectorAll('button')]
        .find(b => b.getAttribute('aria-label')!.startsWith(`${mira},`))!;
      const llena = [...boton.querySelectorAll('div.grid > div')]
        .find(d => (d as HTMLElement).style.background !== '')!;
      const color = getComputedStyle(llena).borderTopColor;
      await unmount();
      return color;
    };

    const seleccionada = await bordeDe('F', 'F');
    const suelta = await bordeDe('Z', 'F');
    expect(seleccionada).not.toBe(suelta);
    // Y las dos son un borde de verdad, no `none`: sin la hoja de estilos cargada las
    // dos darian el mismo valor inicial y el test pasaria sin verificar nada.
    expect(seleccionada).not.toBe('');
    expect(suelta).not.toBe('');
  });

  it('AC-PNL-015 — el click entrega la pieza que se apreto', async () => {
    const onSelect = vi.fn();
    await render(<OrientationPanel orientacion={orientacion({ onSelect })} />);
    await page.getByRole('button', { name: 'W, rotación 0°' }).click();
    expect(onSelect).toHaveBeenCalledWith('W');
  });

  it('AC-ACC-008 — las doce declaran aria-pressed y exactamente una esta en true', async () => {
    // El fondo del boton es "el canal de seleccionada" (comentario de arriba), y hasta
    // ahora era el UNICO: sin `aria-pressed` esa informacion no llegaba al arbol de
    // accesibilidad. Se cuentan los doce y no solo el seleccionado, porque una asercion
    // que mire uno solo dejaria pasar el caso "se lo puse a uno solo".
    const { container, unmount } = await render(
      <OrientationPanel orientacion={orientacion({ selected: 'F' })} />,
    );
    const botones = [...container.querySelectorAll('button')];
    expect(botones.length).toBe(PIEZAS.length);
    for (const boton of botones) {
      expect(boton.getAttribute('aria-pressed')).not.toBeNull();
    }
    const presionados = botones.filter(b => b.getAttribute('aria-pressed') === 'true');
    expect(presionados.length).toBe(1);
    await expect.element(page.getByRole('button', { name: /^F,/, pressed: true })).toBeVisible();
    await unmount();

    // Y que siga al estado: con otro `selected`, el `true` se mueve.
    const { container: otro, unmount: unmountOtro } = await render(
      <OrientationPanel orientacion={orientacion({ selected: 'W' })} />,
    );
    const botonesOtro = [...otro.querySelectorAll('button')];
    const presionadosOtro = botonesOtro.filter(b => b.getAttribute('aria-pressed') === 'true');
    expect(presionadosOtro.length).toBe(1);
    await expect.element(page.getByRole('button', { name: /^W,/, pressed: true })).toBeVisible();
    await unmountOtro();
  });
});
