import { REGIMEN } from '../musical-model/music.ts';
import { textoDeOrientacion } from './orientation-text.ts';
import FloatingPanel from './FloatingPanel.tsx';
import OrientationPanel from './OrientationPanel.tsx';
import TransportPanel from './TransportPanel.tsx';
import type { Position } from './drag.ts';
import type { PropsDeOrientacion } from './OrientationPanel.tsx';
import type { PropsDeTransporte } from './TransportPanel.tsx';

interface Props {
  orientacion: PropsDeOrientacion;
  transporte: PropsDeTransporte;
  abierto: boolean;
  onToggle: () => void;
  /** Not inside `orientacion`: that object is half of the `memo` barrier, and a drag changes this. */
  position: Position;
  onMove: (p: Position) => void;
}

export default function PiecePalette({ orientacion, transporte, abierto, onToggle, position, onMove }: Props) {
  const { selected, orientaciones, regimen, onRegimen, onResetOrientacion } = orientacion;
  const { rotation, mirror } = orientaciones[selected];
  const { grados, reflejada } = textoDeOrientacion(rotation, mirror);
  return (
    <FloatingPanel
      title="Piezas"
      regionId="dock-piezas"
      open={abierto}
      onToggle={onToggle}
      position={position}
      onMove={onMove}
    >
      <OrientationPanel orientacion={orientacion} />
      {/* `space-y-2` selects direct children: a wrapper around two rows removes a margin. */}
      <div className="mt-4 space-y-2">
        {/* `group`, not `radiogroup`: a `radiogroup` forces one tab stop and the arrow keys inside. */}
        <div role="group" aria-label="Qué cambia la rotación" className="flex gap-1">
          {([REGIMEN.escala, REGIMEN.orden] as const).map(r=> {
            const dice = r === REGIMEN.escala
              ? 'La rotación cambia la fórmula de escala'
              : 'La rotación cambia el arranque del arpegio';
            return (
              <button key={r} type="button" onClick={()=> onRegimen(r)} aria-pressed={regimen===r}
                      aria-label={dice} title={dice}
                      className={`px-2 py-0.5 rounded-sm text-xs ${regimen===r?'bg-slate-900 text-white':'bg-slate-100 hover:bg-slate-200'}`}
              >{r === REGIMEN.escala ? '⇗' : '⇄'}</button>
            );
          })}
        </div>
        <p className="min-h-lh flex items-center gap-2">
          <span>{grados}{reflejada !== null && ` · ${reflejada}`}</span>
          <button
            type="button"
            onClick={onResetOrientacion}
            aria-label="Volver esta pieza a 0° sin reflejar"
            title="Volver esta pieza a 0° sin reflejar"
            className="px-1.5 rounded-sm text-xs bg-slate-100 hover:bg-slate-200"
          >0°</button>
        </p>
        <TransportPanel transporte={transporte} />
      </div>
    </FloatingPanel>
  );
}
