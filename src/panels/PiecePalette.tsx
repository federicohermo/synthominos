import { midiName, CHROMATIC, BASE_MAP, REGIMEN } from '../musical-model/music.ts';
import { textoDeOrientacion } from './orientation-text.ts';
import OrientationPanel from './OrientationPanel.tsx';
import TransportPanel from './TransportPanel.tsx';
import type { PropsDeOrientacion } from './OrientationPanel.tsx';
import type { PropsDeTransporte } from './TransportPanel.tsx';

/**
 * The DOCK: the panel that floats over the board, against the right edge.
 *
 * Presentational: no state, no effects. It gets two objects, `orientacion` and `transporte`,
 * and each panel gets only its own. The criterion of the split is in the docblock of
 * `PropsDeOrientacion`, in `OrientationPanel.tsx`. The fold state is state of the shell, like
 * all the rest.
 *
 * ## The box is measured in cells
 *
 * The box is `2 x 4` **cells** and floats over the board: it takes no pixel from the grid.
 *
 * **In cells and not in px.** With fixed sizes, the count of the cells that the dock covers
 * holds for one viewport only: on the reference board of 10 × 6 cells, a dock 640 px high
 * and centred enters row 5 at 1366 x 768 and covers `(9,5)`, where the playhead starts.
 * Measured in cells, it covers `(8,1)`…`(9,4)` of that board in any viewport, because the
 * box and the grid use the same unit.
 *
 * ## Why the content needs its own scroll
 *
 * Because the box does not grow with the content. At the floor, `--cell = 73`, the dock is
 * 146 x 292 px, and its content was measured at about 349 x 428 px. The `overflow-y-auto`
 * makes that fit and not push the grid. The WIDTH is solved in `OrientationPanel` (the
 * column count against the container) and in `TransportPanel` (the rows that stack).
 *
 * ## A wrapper in the middle rows removes a margin
 *
 * The `space-y-2` of the middle rows compiles to `& > :not([hidden]) ~ :not([hidden])`, a
 * DIRECT CHILD selector. So any new wrapper turns two children into one and removes a margin
 * with the classes intact, and no test sees it. And the slot grid inside that `space-y-2`
 * would move 16 px down because of the `mt-4`.
 */

interface Props {
  orientacion: PropsDeOrientacion;
  transporte: PropsDeTransporte;
  /** The fold state lives in the shell: this component reads it and asks for a change. */
  abierto: boolean;
  onToggle: () => void;
}

export default function PiecePalette({ orientacion, transporte, abierto, onToggle }: Props) {
  const { selected, orientaciones, regimen, noteSet, onRegimen, onResetOrientacion } = orientacion;
  // The orientation of the piece in hand, derived from the `Record` and not passed as two
  // loose props: two sources of one truth are two ways for the readout to say one
  // orientation and for the thumbnail to draw another.
  const { rotation, mirror } = orientaciones[selected];
  const { grados, reflejada } = textoDeOrientacion(rotation, mirror);
  // The position comes from a MEASUREMENT and not from looks, and `fixed right-0 top-1/2`
  // does not show it: on the reference board of 10 × 6 cells, `2 x 4` cells against the
  // right edge and centred vertically cover `(8,1)`…`(9,4)` and leave `(0,0)` and `(9,5)`
  // free. Those two cells must stay free: the circuit closes at the first and the playhead
  // starts at the second. The top edge was rejected for the same reason: a top bar covers
  // the whole top row, `(0,0)` included.
  //
  // The background is half opaque with `backdrop-blur` and not opaque: there are cells with
  // a note below, and an opaque panel hides them while a translucent one says they are there.
  return (
    <aside
      className="fixed right-0 top-1/2 -translate-y-1/2 z-20 flex flex-col rounded-l-2xl shadow-lg bg-white/85 backdrop-blur p-2 text-sm"
      style={{ width: `calc(var(--cell) * 2)`, maxHeight: `calc(var(--cell) * 4)` }}
    >
      {/* A `<button>` and not an `<h2>` with `onClick`: it is a control, and a control must
          exist for the keyboard too. `aria-expanded` says if the dock is folded and
          `aria-controls` says which region it refers to. Folded, the header stays and
          NOTHING else: the panel still says what it is, and does not become a loose icon. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        aria-controls="dock-piezas"
        className="shrink-0 text-left text-base font-semibold mb-2"
      >Piezas</button>
      {/* `hidden` and not an unmount, and two measured things depend on it. One: the
          `ResizeObserver` of the spectrum draws again because its container CHANGES SIZE,
          and that holds for the other floating panel by the same mechanism. Two: the
          barrier of the `memo` of `OrientationPanel`. An unmount and a mount cost it
          exactly the runs that the memo exists to save. With the tree alive, the two
          hold. */}
      <div id="dock-piezas" hidden={!abierto} className="min-h-0 overflow-y-auto">
      <OrientationPanel orientacion={orientacion} />
      <div className="mt-4 space-y-2">
        {/* The regime has a row of its own, and not for looks. Without a rotation the regime
            does nothing, and the dock has no row for the rotation that could hold it. So
            the regime is the row, with the label of the rotation.

            And it is not deleted. The precedent is the click switch, which stays because
            it is the only way to turn the circuit on. Here the case is stronger: the
            rotation and the reflection need no button because each one has two direct
            gestures, and the regime has none. Without this row it would be out of reach.
            It is a property of the instrument, like the tempo.

            The `title` says the whole sentence: without the word «cambia»,
            `Rotación | escala orden` can be read as if the rotation had two values.

            Two buttons and not an ON/OFF: the two values are symmetric and neither is the
            absence of the other. An ON/OFF would say that there is a regime and a
            deviation, and that reading is wrong: they are not levels of difficulty, they
            are two rules. The visual language is the one that the rest of the dock uses
            for the active state: a dark background. */}
        {/* The group is `role="group"` and NOT `radiogroup`, although the two buttons are an
            exclusive set. A `radiogroup` forces a focus model: one tab stop for the whole
            group and the arrows to move inside it. The focus model of the board fixes that
            model, and that is where the question is answered. To decide it here in passing
            would be to decide it twice, and probably in two ways. The `aria-pressed` of
            each button already announces the state and does not commit the focus. */}
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
          {/* The orientation IN TEXT. Without it the orientation can only be DERIVED: from
              the thumbnail, which is blind for 6 of the 12 pieces (29 of the 96
              combinations sound different and look the same, and four rotations of the `X`
              give four arpeggios and no change in the shape), or from the five names of
              `Notas actuales`, which tell the eight apart but leave the deduction to the
              reader. What was missing is a DIRECT readout, exactly the derivation that a
              panel exists to save. The full argument is in `orientation-text.ts`.

              It is not a button and cannot be pressed: it informs and does not turn the
              piece.

              `min-h-[1lh]` for the same reason as the `2lh` of the line below: the worst
              case (`270° · reflejada`) must have its height reserved, so that the line
              does not move all that is below it when the orientation changes. One line and
              not two because it fits in one line across the whole range of widths,
              measured in the DOM.

              It says the orientation of the PIECE IN HAND and changes when another piece
              is chosen. That makes the memory visible: back at the `F` that was left at
              180°, it must say `180°`, or the memory exists and cannot be seen. */}
          {/* The `0°` button and not an icon: the same dock has a `↺`, in
              `TransportPanel.tsx`, and two "go back" controls must say different things.
              `0°` says literally where it leads, and it cannot be confused with a glyph.

              It resets the WHOLE orientation, rotation and reflection, not only the
              degrees: a reflected `X` sounds different and looks the same (29 of the 96
              orientations), so a button that left it "at 0° but reflected" would keep
              exactly the invisible state. The label says only the degrees and does not
              mislead, because the readout next to it says the two things and changes with
              the button. And the `aria-label`, the name for a user who does not see the
              readout, says the two.

              And it resets ONE piece and not the twelve. Each piece remembers its own
              orientation: if the `T` is at 90°, it is because the user turned the `T`. A
              "reset the twelve" has no use case. */}
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
          {/* The two lines are RESERVED, not left to the content: the length of this line
              depends on the number of sharps in the scale, from 0 to 5 over the 48
              combinations of piece x rotation. When the line wrapped, it moved all that is
              below it (the tempo and the transport row) 20 px down on a change of piece OR
              of rotation. A control panel that moves when the user touches it is the bug:
              the button moves at the moment of the press.

              Two and not three, measured on the worst string of the 48 (`F#4 · G#4 · A#4 ·
              C#5 · D#5`, 5 sharps: it comes from `N` rot1, `U` rot0 and `Z` rot3): it takes
              2 lines in a container from 148 px to 252 px wide. The jump existed only in
              the widest band, the only one where the best case fits in one line.

              `2lh` and not `min-h-10`: they are the same 40 px today because `text-sm`
              gives a line height of 20 px, but `2lh` is tied to the font and not to a
              number that someone must remember to update. */}
          <p className="min-h-[2lh]">Notas actuales: {noteSet.map(m => midiName(m)).join(" · ")}</p>
        </div>
        <TransportPanel transporte={transporte} />
        {/* The gesture legend. It is not deleted: it is the ONLY place where the four direct
            gestures and the letter are written, and without it they are invisible. And it
            cannot go below the board: that would give the page a vertical scroll, and the
            page must have none. */}
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
