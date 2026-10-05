import { readSpectrum } from '../playback/engine.ts';
import { binsToBars } from './spectrum-bars.ts';

export const BAR_COUNT = 48;

/** In CSS px. */
export const GAP = 2;

/** In CSS px. */
export const MIN_BAR = 2;

export const IDLE_TEXT = 'En reposo — el audio arranca con el primer click';

export function drawBars(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  bars: Float32Array,
  fill: string | CanvasGradient,
): void {
  g.clearRect(0, 0, w, h);
  const slot = w / bars.length;
  const bw = Math.max(1, slot - GAP);
  g.fillStyle = fill;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i] <= 0) continue;
    const bh = Math.max(MIN_BAR, bars[i] * h);
    g.fillRect(i * slot, h - bh, bw, bh);
  }
}

export function drawIdle(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const slot = w / BAR_COUNT;
  const bw = Math.max(1, slot - GAP);
  g.fillStyle = 'rgba(148,163,184,0.12)';
  for (let i = 0; i < BAR_COUNT; i++) g.fillRect(i * slot, 0, bw, h);

  g.fillStyle = 'rgba(148,163,184,0.9)';
  g.font = '12px ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(IDLE_TEXT, w / 2, h / 2);
}

const SIN_ESPECTRO = (): void => {};

export function iniciarEspectro(canvas: HTMLCanvasElement | null): () => void {
  if (!canvas) return SIN_ESPECTRO;
  const g = canvas.getContext('2d');
  if (!g) return SIN_ESPECTRO;

  let w = 0;
  let h = 0;
  let fill: string | CanvasGradient = '#34d399';

  let dibujado = '';

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const grad = g.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, '#059669');
    grad.addColorStop(1, '#5eead4');
    fill = grad;
    // A change of width or height erases the canvas.
    dibujado = '';
  };

  // The container and not the canvas: a size change of the canvas inside the callback can
  // feed back into the observer.
  const box = canvas.parentElement ?? canvas;
  const ro = new ResizeObserver(resize);
  ro.observe(box);

  // A `ResizeObserver` does not see a change of `devicePixelRatio`. The media query matches
  // one value, so each change builds it again.
  let dprQuery: MediaQueryList | null = null;
  const onDprChange = () => { resize(); watchDpr(); };
  const watchDpr = () => {
    dprQuery?.removeEventListener('change', onDprChange);
    dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprQuery.addEventListener('change', onDprChange);
  };

  resize();
  watchDpr();

  let raf = 0;
  const draw = () => {
    const bins = readSpectrum();
    if (bins) {
      drawBars(g, w, h, binsToBars(bins, BAR_COUNT), fill);
      dibujado = 'barras';
    } else if (dibujado !== 'reposo') {
      drawIdle(g, w, h);
      dibujado = 'reposo';
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    dprQuery?.removeEventListener('change', onDprChange);
  };
}
