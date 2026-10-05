import { useEffect, useRef } from 'react';
import { iniciarEspectro } from './spectrum-loop.ts';

export default function Spectrum() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => iniciarEspectro(ref.current), []);

  // `h-full`: the panel is one cell high, and a fixed height can ask for more than the cell.
  // `min-h-0`: without it, a flex item does not shrink below its content.
  return (
    <div className="h-full min-h-0 w-full">
      <canvas ref={ref} className="block h-full w-full rounded-xl bg-slate-900" />
    </div>
  );
}
