import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import TransportPanel from '../TransportPanel.tsx';
import { TEMPO_MIN, TEMPO_MAX } from '../../playback/engine.ts';
import type { PropsDeTransporte } from '../TransportPanel.tsx';

/**
 * El transporte es presentacional y de tres controles, asi que lo que hay para
 * verificar no es que renderice sino las dos cosas que su docblock ARGUMENTA:
 *
 * 1. **el icono ES el estado** — lo que se ve es lo que pasa al apretar, y el color
 *    lo repite; y
 * 2. el boton se queda sin nombre accesible al sacarle el texto, asi que el
 *    `aria-label` no es decoracion: es el unico nombre que tiene.
 *
 * Las dos son afirmaciones sobre el DOM que se produce, y ninguna la mira nadie hoy.
 */
const transporte = (over: Partial<PropsDeTransporte> = {}): PropsDeTransporte => ({
  tempo: 110,
  playing: false,
  // `clicks` y `onToggleClicks` SI los lee este componente: el
  // interruptor del recorrido dejo de vivir en la tarjeta y bajo a esta fila, como
  // metronomo solo-icono. Hasta entonces eran dos campos que llegaban y se descartaban.
  clicks: false,
  onToggleClicks: vi.fn(),
  onTempo: vi.fn(),
  onTogglePlay: vi.fn(),
  onReset: vi.fn(),
  ...over,
});

describe('TransportPanel', () => {
  it('AC-PLY-001 — en pausa: el boton ofrece reproducir, y lo dice con el glifo y con el nombre', async () => {
    const onTogglePlay = vi.fn();
    await render(<TransportPanel transporte={transporte({ onTogglePlay })} />);

    const boton = page.getByRole('button', { name: 'Reproducir' });
    await expect.element(boton).toHaveTextContent('▶');
    // El verde es lo que un transporte pide leer como "apreta esto para que suene", y
    // NO el `bg-slate-100` de lo apagado: al lado tiene a Reset y quedarian
    // indistinguibles.
    await expect.element(boton).toHaveClass(/bg-emerald-600/);

    await boton.click();
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('AC-PLY-001 — corriendo: el mismo boton ofrece pausar, con el idioma de lo activo', async () => {
    await render(<TransportPanel transporte={transporte({ playing: true })} />);

    const boton = page.getByRole('button', { name: 'Pausa' });
    await expect.element(boton).toHaveTextContent('⏸');
    // `bg-slate-900 text-white` es el mismo idioma con el que la tarjeta marca lo
    // activo en Rotacion y Reflexion, aplicado al mismo concepto.
    await expect.element(boton).toHaveClass(/bg-slate-900/);

    // Y el `title` dice lo mismo que el nombre accesible: el puntero y el lector no
    // pueden contar dos historias distintas del mismo boton.
    expect(boton.element().getAttribute('title')).toBe('Pausa');
  });

  it('el tempo viaja como numero, no como el string del input', async () => {
    const onTempo = vi.fn();
    await render(<TransportPanel transporte={transporte({ onTempo })} />);

    const slider = page.getByRole('slider');
    expect(slider.element().getAttribute('min')).toBe(String(TEMPO_MIN));
    expect(slider.element().getAttribute('max')).toBe(String(TEMPO_MAX));

    await slider.fill('128');
    expect(onTempo).toHaveBeenCalledWith(128);
    // Lo que importa del `Number`: un `'128'` que llegue como string se propaga a
    // `setBpm` y de ahi a la aritmetica del scheduler.
    expect(typeof onTempo.mock.calls[0][0]).toBe('number');
  });

  it('el numero lleva su unidad, que desde el 008 no es redundante', async () => {
    // El instrumento maneja bpm e intervalos: "110" a secas es ambiguo.
    const { container } = await render(<TransportPanel transporte={transporte({ tempo: 96 })} />);
    expect(container.textContent).toContain('96');
    expect(container.textContent).toContain('bpm');
  });

  it('AC-ACC-003 AC-PNL-026 — el reset dice `↺` y su nombre accesible dice las DOS cosas que hace', async () => {
    // El boton perdio la palabra `Reset`, que era todo su nombre
    // accesible: un glifo no lo es. El nombre nuevo nombra las dos mitades porque las dos
    // pasan —vacia el tablero y frena el transporte—, y el `title` dice exactamente lo
    // mismo: el puntero y el lector no pueden contar dos historias del mismo boton.
    const onReset = vi.fn();
    const onTogglePlay = vi.fn();
    await render(<TransportPanel transporte={transporte({ onReset, onTogglePlay })} />);

    const boton = page.getByRole('button', { name: /^Vaciar el tablero y frenar el transporte$/ });
    await expect.element(boton).toHaveTextContent('↺');
    expect(boton.element().getAttribute('title')).toBe('Vaciar el tablero y frenar el transporte');
    // Y ningun boton se llama `Reset`: es la contraparte falsable del renombre.
    expect(page.getByRole('button', { name: /^Reset$/ }).elements()).toHaveLength(0);

    await boton.click();
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onTogglePlay).not.toHaveBeenCalled();
  });

  it('AC-ACC-005 AC-PNL-026 — el metronomo es solo-icono, se llama por lo que alterna y lo anuncia con aria-pressed', async () => {
    // La asercion que el 019 le saca a `PiecePalette` y que llega ACA en vez de
    // desaparecer. El componente es presentacional, asi que `aria-pressed` sigue a la
    // prop: se compara entre dos renders y no clickeando y esperando que se actualice
    // solo, que pasaria siempre.
    const onToggleClicks = vi.fn();
    const apagado = await render(
      <TransportPanel transporte={transporte({ clicks: false, onToggleClicks })} />,
    );
    const boton = page.getByRole('button', { name: /^Recorrido en el vacío$/, pressed: false });
    await expect.element(boton).toBeInTheDocument();
    // Explicito, y no solo por `pressed: false`: un boton SIN `aria-pressed` tambien
    // empareja con `pressed: false`, asi que esa consulta sola pasaria con el atributo
    // borrado — y el estado quedaria dicho por el color y por nada mas.
    expect(boton.element().getAttribute('aria-pressed')).toBe('false');
    expect(boton.element().getAttribute('title')).toBe('Recorrido en el vacío');
    // Solo-icono de verdad: el nombre sale del `aria-label` porque el boton no tiene
    // texto, y el SVG esta oculto al arbol para que no se anuncie ademas de la etiqueta.
    expect(boton.element().textContent).toBe('');
    expect(boton.element().querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');

    await boton.click();
    expect(onToggleClicks).toHaveBeenCalledTimes(1);
    await apagado.unmount();

    await render(<TransportPanel transporte={transporte({ clicks: true })} />);
    const encendido = page.getByRole('button', { name: /^Recorrido en el vacío$/, pressed: true });
    await expect.element(encendido).toBeInTheDocument();
    // Encendido usa el `bg-slate-900` con el que la tarjeta marca lo activo: es el mismo
    // idioma que usaban las dos filas que este spec borro.
    await expect.element(encendido).toHaveClass(/bg-slate-900/);
  });

  // Primer test del repo que pregunta por el arbol de accesibilidad en vez de por la
  // estructura del DOM: `getByRole('slider', { name })` solo encuentra el control si el
  // nombre accesible se resolvio de verdad (via `aria-labelledby`), asi que verifica la
  // decision D2 del spec —nombre desde el span visible, sin duplicarlo en `aria-label`—
  // y no solo "el atributo esta escrito". El nombre va anclado con regex porque
  // `getByRole` empareja por SUBCADENA, que es el mismo tropiezo que
  // `PiecePalette.browser.test.tsx:93-94` ya dejo anotado.
  it('AC-ACC-004 — el slider de Tempo tiene nombre accesible "Tempo" y anuncia su valor con la unidad', async () => {
    await render(<TransportPanel transporte={transporte({ tempo: 110 })} />);

    const slider = page.getByRole('slider', { name: /^Tempo$/ });
    await expect.element(slider).toBeInTheDocument();
    expect(slider.element().getAttribute('aria-valuetext')).toBe('110 bpm');
    // El nombre viene de `aria-labelledby`, no de un `aria-label` duplicado: si alguien
    // reintroduce un `aria-label` con el mismo texto, esta aserción lo caza aunque el
    // nombre accesible siga siendo "Tempo".
    expect(slider.element().getAttribute('aria-label')).toBeNull();
  });

  it('AC-ACC-004 — aria-valuetext sigue al tempo: mismo numero que pinta el span visible, con su unidad', async () => {
    await render(<TransportPanel transporte={transporte({ tempo: 96 })} />);

    const slider = page.getByRole('slider', { name: /^Tempo$/ });
    expect(slider.element().getAttribute('aria-valuetext')).toBe('96 bpm');
  });
});
