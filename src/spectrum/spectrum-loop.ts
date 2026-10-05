import { readSpectrum } from '../playback/engine.ts';
import { binsToBars } from './spectrum-bars.ts';

/**
 * The drawing of the spectrum: the loop that `Spectrum.tsx` starts from its `useEffect`.
 *
 * It is in a `.ts` by the same rule as `playhead-loop.ts`:
 * `react-refresh/only-export-components` forbids a `.tsx` to export anything but the
 * component. Inside the component this code could not be exported, so it could not be
 * tested.
 *
 * The drawing is imperative and does NOT go through state: 60 React renders a second to
 * paint bars would compete with the render of the board and give nothing to anyone. The
 * only thing that crosses the boundary is the reading from the engine, which the loop
 * takes on its own.
 */

/** The fixed values of the drawing of the spectrum. */

/** The bars drawn. Fewer than the 128 bins: grouped, they read without visual noise. */
export const BAR_COUNT = 48;

/** The gap between bars, in CSS px. */
export const GAP = 2;

/** The minimum height of a bar with signal: below this the bar cannot be seen. */
export const MIN_BAR = 2;

/** What the canvas says when there is no signal to draw. */
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

/**
 * The idle state: every lane as a dim column, and a text that says it.
 *
 * A flat line at the bottom of the canvas is ambiguous: it reads the same as "the audio is
 * broken". So the state with no signal is drawn in a different way on purpose.
 */
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

/** What `iniciarEspectro` returns when there is no canvas or no 2D context. */
const SIN_ESPECTRO = (): void => {};

/**
 * Starts the drawing loop on the canvas and returns its cleanup.
 *
 * The canvas comes as a parameter and can be `null`, as a `ref.current` is before the mount.
 * Its 2D context can be `null` too: `getContext('2d')` returns null when the browser cannot
 * give one. Because this is a function, a test reaches each of the two guards with one call.
 */
export function iniciarEspectro(canvas: HTMLCanvasElement | null): () => void {
  if (!canvas) return SIN_ESPECTRO;
  const g = canvas.getContext('2d');
  if (!g) return SIN_ESPECTRO;

  // The size in CSS px: the canvas draws in these units, and the drawing surface is
  // separate, scaled by the pixel density.
  let w = 0;
  let h = 0;
  let fill: string | CanvasGradient = '#34d399';

  // The key of the LAST thing drawn, not a boolean: the same shape as `dibujado` in
  // `playhead-loop.ts`, for the same reason. A comparison of strings avoids a comparison of
  // tuples, and the empty string means that nothing is drawn. Without this guard,
  // `drawIdle` repeats 55 canvas operations on each frame (one `clearRect`, 48 `fillRect`,
  // five style assignments and one `fillText`) to paint the same image: 3300 a second
  // while there is no audio. A boolean "the idle state is drawn" is not enough: the key
  // must also tell the change from signal to idle (readSpectrum returns null again when the
  // context is suspended, not only before the first click), and a bare boolean would
  // confuse that change with "idle to idle".
  let dibujado = '';

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    // Without this transform the canvas draws in physical px, and on a screen of high
    // pixel density all is drawn at a scale of 1/dpr, or blurred if CSS stretches it.
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The gradient depends on the height, so it is built again when the height changes and
    // not on each frame.
    const grad = g.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, '#059669');
    grad.addColorStop(1, '#5eead4');
    fill = grad;
    // A resize clears the canvas (a change of width or height erases it). So the key is
    // invalidated to force the next `drawIdle` although the idle state did not change.
    // Otherwise the canvas would stay blank until a signal comes.
    dibujado = '';
  };

  // It observes the container and not the canvas: a change of the width or height of the
  // canvas inside the callback itself can feed back into the observer.
  const box = canvas.parentElement ?? canvas;
  const ro = new ResizeObserver(resize);
  ro.observe(box);

  // The ResizeObserver does NOT cover the pixel density: a window dragged to a monitor of
  // another density changes devicePixelRatio and not one CSS pixel. So the observer does
  // not fire, and the canvas keeps the drawing surface of the earlier screen, which looks
  // blurred, until the next resize. The media query fires exactly when devicePixelRatio
  // stops having the value it had, so it must be built again with the new value each time.
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
      // No key here: the bars change value on each frame with signal, which is the whole
      // point of the spectrum. What IS recorded is that the last thing drawn was bars, so
      // that the change from signal to idle is detected.
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
