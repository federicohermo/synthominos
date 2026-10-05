import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { clampTempo, dragTempo, tempoKeyStep, wheelStep } from './tempo.ts';

export interface PropsDeTransporte {
  tempo: number;
  playing: boolean;
  clicks: boolean;
  onTempo: (bpm: number) => void;
  onTogglePlay: () => void;
  onToggleClicks: () => void;
  onReset: () => void;
}

export default function TransportPanel({ transporte }: { transporte: PropsDeTransporte }) {
  const { tempo, playing, clicks, onTempo, onTogglePlay, onToggleClicks, onReset } = transporte;

  // A ref and not state: nothing draws the anchor, and the drag counts from the tempo at its start.
  const drag = useRef<{ y: number; tempo: number } | null>(null);

  const onClockPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    // Where the context menu takes the `pointerup` (macOS opens it on press), a drag of another button never ends.
    if (e.button !== 0 || !e.isPrimary) return;
    drag.current = { y: e.clientY, tempo };
    // With the capture, the moves reach this button off its box: no listener on `window`, so no effect.
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onClockPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (d === null) return;
    onTempo(dragTempo(d.tempo, e.clientY - d.y));
  };

  const onClockPointerEnd = () => { drag.current = null; };

  return (
    <div className="mt-4 border-t pt-3 space-y-2">
      {/* A `<button>` and not a `div` with a role: the global keys skip only a focused button or
          input, so on a `div` each letter typed on the clock would choose a piece. */}
      <button
        type="button"
        onWheel={e => onTempo(clampTempo(tempo + wheelStep(e.deltaY)))}
        onKeyDown={e => {
          const step = tempoKeyStep(e.key);
          if (step === null) return;
          e.preventDefault();
          onTempo(clampTempo(tempo + step));
        }}
        // No `onClick`: the browser ends each drag with a `click` on this button.
        onPointerDown={onClockPointerDown}
        onPointerMove={onClockPointerMove}
        onPointerUp={onClockPointerEnd}
        onPointerCancel={onClockPointerEnd}
        aria-label={`Tempo: ${tempo} bpm`}
        title={`Tempo: ${tempo} bpm`}
        // `touch-none`: without it, a touch drag scrolls the page and sends no `pointermove`.
        className="w-full rounded-sm bg-slate-100 hover:bg-slate-200 py-0.5 text-center text-2xl leading-none tabular-nums cursor-ns-resize touch-none"
      >{tempo}</button>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playing? 'Pausa':'Reproducir'}
          title={playing? 'Pausa':'Reproducir'}
          className={`px-3 py-1 rounded-sm text-white ${playing? 'bg-slate-900 hover:bg-slate-800':'bg-emerald-600 hover:bg-emerald-700'}`}
        >{playing? '⏸':'▶'}</button>
        <button
          type="button"
          onClick={onToggleClicks}
          aria-label="Recorrido en el vacío"
          title="Recorrido en el vacío"
          aria-pressed={clicks}
          className={`px-3 py-1 rounded-sm flex items-center ${clicks?'bg-slate-900 text-white':'bg-slate-100 hover:bg-slate-200'}`}
        >
          <svg
            viewBox="0 0 16 16"
            width="1em"
            height="1em"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <path d="M6.4 1.6h3.2l3.4 12.8H3z" />
            <path d="M8 14.4 11.6 4.2" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onReset}
          aria-label="Vaciar el tablero y frenar el transporte"
          title="Vaciar el tablero y frenar el transporte"
          className="ml-auto px-3 py-1 rounded-sm bg-slate-200 hover:bg-slate-300"
        >↺</button>
      </div>
    </div>
  );
}
