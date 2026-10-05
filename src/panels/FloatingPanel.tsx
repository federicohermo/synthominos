import { useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useDrag } from './use-drag.ts';
import type { Position } from './drag.ts';

interface Props {
  title: string;
  regionId: string;
  open: boolean;
  onToggle: () => void;
  position: Position;
  onMove: (p: Position) => void;
  /** The dock gives none: its box comes from its content. */
  box?: CSSProperties;
  children: ReactNode;
}

export default function FloatingPanel({
  title, regionId, open, onToggle, position, onMove, box, children,
}: Props) {
  const panelRef = useRef<HTMLElement | null>(null);
  const { onHandlePointerDown, onHandleKeyDown } = useDrag(panelRef, position, onMove);
  const fold = `${open ? 'Plegar' : 'Desplegar'} ${title}`;
  // React writes a constant `transform`, and the gesture writes the two custom properties: a render
  // during a drag has nothing to undo.
  return (
    <aside
      ref={panelRef}
      className="fixed left-0 top-0 z-20 flex flex-col rounded-2xl shadow-lg bg-white/85 backdrop-blur-sm p-2 text-sm will-change-transform"
      style={{ ...box, transform: 'translate3d(var(--panel-x), var(--panel-y), 0)' }}
    >
      <div className="shrink-0 flex items-center gap-1 mb-2">
        {/* Two buttons: the browser sends a `click` after the `pointerup` of a drag, so a handle
            that folds would fold the panel at each drop. */}
        <button
          type="button"
          onPointerDown={onHandlePointerDown}
          onKeyDown={onHandleKeyDown}
          aria-label={`${title} — arrastrar el panel, o moverlo con las flechas`}
          // `touch-none`: without it, a touch drag scrolls the page and sends no `pointermove`.
          className="flex-1 text-left text-base font-semibold cursor-grab active:cursor-grabbing touch-none"
        >{title}</button>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={regionId}
          aria-label={fold}
          title={fold}
          className="shrink-0 px-1.5 rounded-sm text-xs bg-slate-100 hover:bg-slate-200"
        >{open ? '▾' : '▸'}</button>
      </div>
      {/* `hidden`, not an unmount: an unmount restarts the loop of `spectrum-loop.ts`, and pays the
          runs that the `memo` of `OrientationPanel` saves. */}
      <div id={regionId} hidden={!open} className="min-h-0 flex-1">
        {children}
      </div>
    </aside>
  );
}
