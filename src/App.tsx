import { useMemo, useState, useRef, useCallback } from "react";
import { playNow } from "./playback/engine.ts";
import { DEFAULT_BPM } from "./playback/scheduler.ts";
import { rotateN, reflect } from "./pieces/transform.ts";
import { arpeggioFor, DEFAULT_REGIMEN } from "./musical-model/music.ts";
import { cabeEn, cellsAt, isValid, occupantAt, MAX_PIEZAS } from "./board-editing/placement.ts";
import { buildSequence } from "./circuit/sequence.ts";
import { SHAPES, ANCHOR_INDEX } from "./pieces/pieces.ts";
import type { Cell } from "./pieces/transform.ts";
import type { PieceKey } from "./pieces/pieces.ts";
import type { PlacedPiece } from "./board-editing/placement.ts";
import type { RegimenDeRotacion } from "./musical-model/music.ts";
import PiecePalette from "./panels/PiecePalette.tsx";
import FloatingPanel from "./panels/FloatingPanel.tsx";
import { SIGNAL_PANEL_WIDTH_CELLS, dockStartPosition, signalPanelStartPosition } from "./panels/drag.ts";
import type { Position } from "./panels/drag.ts";
import Board from "./board-editing/Board.tsx";
import Spectrum from "./spectrum/Spectrum.tsx";
import { alternarTransporte } from "./playback/engine-bridge.ts";
import {
  MOTOR,
  frenarTransporte,
  reiniciarRecorrido,
  useMotorSincronizado,
} from "./playback/use-engine.ts";
import { useAtajosDeTeclado, useRuedaRota } from "./board-editing/use-input.ts";
import { useGrilla } from "./board-fit/use-grid.ts";
import {
  rotacionPorRueda,
  siguienteRotacion,
  reflejaElContextMenu,
  accionDeClick,
  esLaPiezaEnLaMano,
  EDICION,
} from "./board-editing/input.ts";
import { anuncioDeEdicion } from "./accessibility/cell-name.ts";
import { ORIENTACION_INICIAL, ORIENTACIONES_INICIALES } from "./pieces/orientation.ts";
import type { MemoriaDeOrientacion, Orientacion } from "./pieces/orientation.ts";

export default function App() {
  const [selected, setSelected] = useState<PieceKey>('F');

  const [orientaciones, setOrientaciones] = useState<MemoriaDeOrientacion>(ORIENTACIONES_INICIALES);
  const [tempo, setTempo] = useState<number>(DEFAULT_BPM);
  const [playing, setPlaying] = useState<boolean>(false);
  // The same default as `clicksAudible` in `engine.ts`.
  const [clicks, setClicks] = useState<boolean>(false);
  const [regimen, setRegimen] = useState<RegimenDeRotacion>(DEFAULT_REGIMEN);

  const [placed, setPlaced] = useState<PlacedPiece[]>([]);

  // The mouse and the keyboard focus both write it. It can point outside the grid: draw with `cursor`.
  const [hover, setHover] = useState<Cell | null>(null);

  const [focoEnTablero, setFocoEnTablero] = useState<boolean>(false);

  const [anuncio, setAnuncio] = useState<string>('');

  const { rotation, mirror } = orientaciones[selected];

  const idRef = useRef(0);

  const selectedRef = useRef<PieceKey>(selected);

  /** The only writer of the piece in hand: the state that is drawn and the ref the wheel reads. */
  const elegirPieza = useCallback((pieza: PieceKey) => {
    selectedRef.current = pieza;
    setSelected(pieza);
  }, []);

  const orientar = useCallback((pieza: PieceKey, cambio: (o: Orientacion) => Orientacion) => {
    setOrientaciones(prev => ({ ...prev, [pieza]: cambio(prev[pieza]) }));
  }, []);

  const boardRef = useRef<HTMLDivElement | null>(null);

  // The root, not the board: the signal panel reads `--cell`, and it is outside `Board`.
  const raizRef = useRef<HTMLDivElement | null>(null);
  const dims = useGrilla(raizRef);

  // A piece that does not fit the grid stays in `placed` and comes back when the window grows.
  // The drawn board reads `visibles`. Legality reads `placed`: nothing lands on a stored piece.
  const visibles = useMemo(() => placed.filter(p => cabeEn(p, dims)), [placed, dims]);

  // A resize can leave `hover` outside the grid: then no cell of the board has `tabIndex={0}`.
  const cursor = hover !== null && isValid([hover], [], dims) ? hover : null;
  // Without `cursor`, the focus ring is drawn on (0,0), where the roving anchor falls.
  const focoEnCelda = focoEnTablero && cursor !== null;

  const [piezasAbierto, setPiezasAbierto] = useState<boolean>(true);
  const [senalAbierta, setSenalAbierta] = useState<boolean>(true);

  const [dockPosition, setDockPosition] = useState<Position>(() =>
    dockStartPosition({ width: window.innerWidth, height: window.innerHeight }));
  const [signalPosition, setSignalPosition] = useState<Position>(() =>
    signalPanelStartPosition({ width: window.innerWidth, height: window.innerHeight }));

  const tapLimpio = useRef<boolean>(false);

  const transformedShape = useMemo(() => {
    let c = SHAPES[selected];
    c = rotateN(c, rotation);
    if (mirror) c = reflect(c);
    return c;
  }, [selected, rotation, mirror]);

  const secuencia = useMemo(() => buildSequence(visibles, regimen, dims), [visibles, regimen, dims]);

  const noteSet = useMemo(() => arpeggioFor(selected, rotation, mirror, regimen), [selected, rotation, mirror, regimen]);

  useMotorSincronizado({ secuencia, placed: visibles, tempo, clicks });

  function handleCellClick(x: number, y: number, altKey: boolean) {
    const ocupante = occupantAt(visibles, x, y);
    const accion = accionDeClick(ocupante, selected, altKey);
    if (accion === null) return;

    // `quitar` and `mutear` come only with an occupant: the nesting proves it to TypeScript.
    if (ocupante !== null) {
      if (accion === EDICION.quitar) setPlaced(arr => arr.filter(p => p.id !== ocupante.id));
      else setPlaced(arr => arr.map(p => p.id === ocupante.id ? { ...p, muted: !p.muted } : p));
      setAnuncio(anuncioDeEdicion(accion, ocupante.piece, x, y, !ocupante.muted));
      return;
    }

    const cells = cellsAt(transformedShape, ANCHOR_INDEX[selected], x, y);
    if (!isValid(cells, placed, dims)) return;
    // `placed`, not `visibles`: a stored piece comes back, and the limit bounds the `2ⁿ` of the circuit.
    if (placed.length >= MAX_PIEZAS) {
      setAnuncio(`El tablero acepta ${MAX_PIEZAS} piezas y ya tiene ${MAX_PIEZAS}. Quitá una para poder colocar otra.`);
      return;
    }
    const muted = accion === EDICION.colocarMuteada;
    const newPiece: PlacedPiece = {
      id: String(++idRef.current),
      piece: selected, rotation, mirror, cells, muted,
    };
    setPlaced(prev => [...prev, newPiece]);
    setAnuncio(anuncioDeEdicion(accion, selected, x, y, muted));
    // With the transport running, the loop plays the new piece at the cycle boundary: an arpeggio
    // here sounds it a second time.
    if (!playing && !muted) playNow(noteSet);
  }

  // An emptied sequence enters only at the cycle boundary, up to 7.5 s later: so the transport stops.
  // The draw queue advances only when the engine closes a cycle: so it restarts here too.
  function resetBoard() {
    frenarTransporte();
    reiniciarRecorrido();
    setPlaying(false);
    setPlaced([]);
  }

  const togglePlay = useCallback(() => {
    setPlaying(alternarTransporte(playing, MOTOR));
  }, [playing]);

  const rotarConTecla = useCallback(
    () => orientar(selected, o => ({ ...o, rotation: siguienteRotacion(o.rotation) })),
    [orientar, selected],
  );
  const reflejarConTecla = useCallback(
    () => orientar(selected, o => ({ ...o, mirror: !o.mirror })),
    [orientar, selected],
  );

  const resetearOrientacion = useCallback(
    () => orientar(selected, () => ORIENTACION_INICIAL),
    [orientar, selected],
  );

  const seleccionarConTecla = elegirPieza;

  // No `selected` in the dependencies: it subscribes the `wheel` listener again. So `selectedRef`.
  const alRotar = useCallback((deltaY: number) => {
    const pieza = selectedRef.current;
    orientar(pieza, o => ({ ...o, rotation: rotacionPorRueda(o.rotation, deltaY) }));
  }, [orientar]);

  useAtajosDeTeclado(
    {
      rotar: rotarConTecla,
      reflejar: reflejarConTecla,
      transporte: togglePlay,
      seleccionar: seleccionarConTecla,
    },
    tapLimpio,
  );
  useRuedaRota(boardRef, alRotar, tapLimpio);

  // On macOS, `Ctrl`+click arrives as `contextmenu` with `ctrlKey`, and the `keyup` of `Ctrl` toggles too.
  function handleContextMenu(e: { preventDefault: () => void; ctrlKey: boolean }) {
    e.preventDefault();
    if (reflejaElContextMenu(e)) orientar(selected, o => ({ ...o, mirror: !o.mirror }));
  }

  function alMoverElFoco(celda: Cell | null) {
    setFocoEnTablero(celda !== null);
    setHover(celda);
  }

  // While the DOM focus is inside the board, the focus wins over the mouse: the roving tabindex
  // keeps its anchor.
  function alSalirElMouse() {
    if (!focoEnCelda) setHover(null);
  }

  const hoverEdita = esLaPiezaEnLaMano(cursor ? occupantAt(visibles, cursor[0], cursor[1]) : null, selected);

  const previewCells = cursor && !hoverEdita ? cellsAt(transformedShape, ANCHOR_INDEX[selected], cursor[0], cursor[1]) : [];
  const previewValid = cursor && !hoverEdita ? isValid(previewCells, placed, dims) : false;

  // Memoized: `hover` renders this tree for each crossed cell, and `OrientationPanel` is a `memo`.
  const orientacion = useMemo(() => ({
    selected, orientaciones, regimen, noteSet,
    onSelect: elegirPieza,
    onRegimen: setRegimen,
    onResetOrientacion: resetearOrientacion,
  }), [selected, orientaciones, regimen, noteSet, elegirPieza, resetearOrientacion]);

  // `h-dvh`: on iOS, `100vh` includes the browser bar, and the board jumps when the bar hides.
  // `bg-fondo` is one of four places that `fondo-sincronizado.test.ts` keeps in sync.
  return (
    <div ref={raizRef} className="h-dvh w-full overflow-hidden bg-fondo text-slate-900">
      <PiecePalette
        orientacion={orientacion}
        transporte={{
          tempo, playing, clicks,
          onTempo: setTempo,
          onTogglePlay: togglePlay,
          onToggleClicks: () => setClicks(c => !c),
          onReset: resetBoard,
        }}
        abierto={piezasAbierto}
        onToggle={() => setPiezasAbierto(v => !v)}
        position={dockPosition}
        onMove={setDockPosition}
      />

      <Board
        placed={visibles}
        dims={dims}
        previewCells={previewCells}
        previewValid={previewValid}
        hover={cursor}
        selected={selected}
        rotation={rotation}
        mirror={mirror}
        regimen={regimen}
        onCellClick={handleCellClick}
        onCellEnter={setHover}
        onMouseLeave={alSalirElMouse}
        focoEnTablero={focoEnCelda}
        onFoco={alMoverElFoco}
        hoverEdita={hoverEdita}
        onContextMenu={handleContextMenu}
        boardRef={boardRef}
      />

      <FloatingPanel
        title="Señal"
        regionId="franja-senal"
        open={senalAbierta}
        onToggle={() => setSenalAbierta(v => !v)}
        position={signalPosition}
        onMove={setSignalPosition}
        box={{
          width: `calc(var(--cell) * ${SIGNAL_PANEL_WIDTH_CELLS})`,
          height: senalAbierta ? 'var(--cell)' : undefined,
        }}
      >
        <Spectrum />
      </FloatingPanel>

      {/* It exists from the first render: a region just inserted in the DOM is not announced. */}
      <div aria-live="polite" className="sr-only">{anuncio}</div>

    </div>
  );
}
