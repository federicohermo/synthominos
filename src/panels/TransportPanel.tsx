import { TEMPO_MIN, TEMPO_MAX } from '../playback/scheduler.ts';

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
  return (
    <div className="mt-4 border-t pt-3 space-y-2">
      {/* The row wraps: at the floor the dock is 146 px wide, and the three do not fit in one line. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <span id="tempo-etiqueta" className="font-medium">Tempo</span>
        {/* Without `aria-valuetext`, a `range` announces its bare number, and the instrument has two units. */}
        <input
          type="range"
          min={TEMPO_MIN}
          max={TEMPO_MAX}
          value={tempo}
          onChange={e=>onTempo(Number(e.target.value))}
          aria-labelledby="tempo-etiqueta"
          aria-valuetext={`${tempo} bpm`}
          className="w-full min-w-0 order-last"
        />
        <span className="tabular-nums text-right whitespace-nowrap">{tempo} <span className="text-slate-500">bpm</span></span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playing? 'Pausa':'Reproducir'}
          title={playing? 'Pausa':'Reproducir'}
          className={`px-3 py-1 rounded text-white ${playing? 'bg-slate-900 hover:bg-slate-800':'bg-emerald-600 hover:bg-emerald-700'}`}
        >{playing? '⏸':'▶'}</button>
        <button
          type="button"
          onClick={onToggleClicks}
          aria-label="Recorrido en el vacío"
          title="Recorrido en el vacío"
          aria-pressed={clicks}
          className={`px-3 py-1 rounded flex items-center ${clicks?'bg-slate-900 text-white':'bg-slate-100 hover:bg-slate-200'}`}
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
          className="ml-auto px-3 py-1 rounded bg-slate-200 hover:bg-slate-300"
        >↺</button>
      </div>
    </div>
  );
}
