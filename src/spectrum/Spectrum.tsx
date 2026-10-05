import { useEffect, useRef } from 'react';
import { iniciarEspectro } from './spectrum-loop.ts';

/**
 * The spectrum of the signal at the master output, drawn on a canvas.
 *
 * React mounts the <canvas> and starts and stops the loop. The drawing is imperative and
 * does NOT go through state: 60 React renders a second to paint bars would compete with the
 * render of the board and give nothing to anyone. The only thing that crosses the boundary
 * is the reading from the engine, which the loop takes on its own.
 *
 * The body of the loop is in `spectrum-loop.ts` and not here: inside this `.tsx` it could
 * not be exported, because of `react-refresh/only-export-components`, so it could not be
 * tested. The same holds for the loop of `Playhead`. What stays here is the mount, the only
 * part that belongs to the component.
 */
export default function Spectrum() {
  const ref = useRef<HTMLCanvasElement>(null);

  // The empty dependency array is intentional: the loop mounts once and reads from the
  // engine directly, so there is nothing to subscribe again when the app renders.
  useEffect(() => iniciarEspectro(ref.current), []);

  // `h-full` and not `h-24`: the spectrum lives in the signal panel, which is ONE cell
  // high, so between 73 and 180 px for different viewports. With a fixed height of 96 px,
  // at the floor the canvas plus the header ask for 132 px against the 73 px of the box,
  // and the panel takes a second row of the board. The count of the cells that each
  // floating panel covers cannot allow that.
  //
  // The `min-h-0` is not decoration: this div is a child of a `flex-col`, and a flex item
  // does not shrink below its content unless told to. Without it the canvas pushes the
  // panel and makes it higher than its cell.
  //
  // The `ResizeObserver` of `spectrum-loop.ts` draws again on a change of size, and it
  // observes this node. Because the height comes from the box, a fold, an unfold and a
  // resize of the window all cause the redraw with no extra code.
  return (
    <div className="h-full min-h-0 w-full">
      <canvas ref={ref} className="block h-full w-full rounded-xl bg-slate-900" />
    </div>
  );
}
