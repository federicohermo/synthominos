import { midiName, CHROMATIC, BASE_MAP, REGIMEN } from '../musical-model/music.ts';
import { textoDeOrientacion } from './orientation-text.ts';
import OrientationPanel from './OrientationPanel.tsx';
import TransportPanel from './TransportPanel.tsx';
import type { PropsDeOrientacion } from './OrientationPanel.tsx';
import type { PropsDeTransporte } from './TransportPanel.tsx';

interface Props {
  orientacion: PropsDeOrientacion;
  transporte: PropsDeTransporte;
  abierto: boolean;
  onToggle: () => void;
}

export default function PiecePalette({ orientacion, transporte, abierto, onToggle }: Props) {
  const { selected, orientaciones, regimen, noteSet, onRegimen, onResetOrientacion } = orientacion;
  const { rotation, mirror } = orientaciones[selected];
  const { grados, reflejada } = textoDeOrientacion(rotation, mirror);
  // The box leaves (0,0) and the last cell of the reference board free: the circuit closes at
  // the first, and the playhead starts at the second.
  return (
    <aside
      className="fixed right-0 top-1/2 -translate-y-1/2 z-20 flex flex-col rounded-l-2xl shadow-lg bg-white/85 backdrop-blur p-2 text-sm"
      style={{ width: `calc(var(--cell) * 2)`, maxHeight: `calc(var(--cell) * 4)` }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        aria-controls="dock-piezas"
        className="shrink-0 text-left text-base font-semibold mb-2"
      >Piezas</button>
      {/* `hidden`, not an unmount: an unmount pays the runs that the `memo` of `OrientationPanel` saves. */}
      <div id="dock-piezas" hidden={!abierto} className="min-h-0 overflow-y-auto">
      <OrientationPanel orientacion={orientacion} />
      <div className="mt-4 space-y-2">
        {/* `space-y-2` selects direct children: a wrapper around two rows removes a margin. */}
        {/* `group`, not `radiogroup`: a `radiogroup` forces one tab stop and the arrow keys inside. */}
        <div className="flex items-center justify-between gap-1">
          <span id="rotacion-etiqueta" className="font-medium">Rotación</span>
          <div
            role="group"
            aria-labelledby="rotacion-etiqueta"
            title="La rotación cambia la fórmula de escala o el arranque del arpegio"
            className="flex gap-1"
          >
            {([REGIMEN.escala, REGIMEN.orden] as const).map(r=> (
              <button key={r} type="button" onClick={()=> onRegimen(r)} aria-pressed={regimen===r}
                      className={`px-2 py-0.5 rounded text-xs ${regimen===r?'bg-slate-900 text-white':'bg-slate-100 hover:bg-slate-200'}`}>{r}</button>
            ))}
          </div>
        </div>
        <div className="pt-2 text-sm text-slate-600">
          <p><b>{selected}</b> → tónica {CHROMATIC[BASE_MAP[selected]]}</p>
          <p className="min-h-[1lh] flex items-center gap-2">
            <span>{grados}{reflejada !== null && ` · ${reflejada}`}</span>
            <button
              type="button"
              onClick={onResetOrientacion}
              aria-label="Volver esta pieza a 0° sin reflejar"
              title="Volver esta pieza a 0° sin reflejar"
              className="px-1.5 rounded text-xs bg-slate-100 hover:bg-slate-200"
            >0°</button>
          </p>
          {/* Two lines reserved: the line wraps with the sharps of the scale, and a wrap moves the controls below. */}
          <p className="min-h-[2lh]">Notas actuales: {noteSet.map(m => midiName(m)).join(" · ")}</p>
        </div>
        <TransportPanel transporte={transporte} />
        <p className="mt-4 border-t pt-3 text-xs text-slate-500">
          Rotación cambia la fórmula de escala o el arranque del arpegio, según el régimen; Reflexión invierte el orden (retrógrado).
          {' '}Click en tablero para colocar y escuchar.
          {' '}<span className="whitespace-nowrap">Rueda sobre el tablero o <kbd>Shift</kbd> rota</span>;
          {' '}<span className="whitespace-nowrap">botón derecho o <kbd>Ctrl</kbd> refleja</span>;
          {' '}<span className="whitespace-nowrap"><kbd>Espacio</kbd> arranca y para</span>;
          {' '}<span className="whitespace-nowrap">la <kbd>letra</kbd> de una pieza la elige</span>.
        </p>
      </div>
      </div>
    </aside>
  );
}
