import { TEMPO_MIN, TEMPO_MAX } from '../playback/scheduler.ts';

/** The transport of the instrument: tempo, play and pause, the clicks of the circuit, the reset. */
export interface PropsDeTransporte {
  tempo: number;
  playing: boolean;
  clicks: boolean;
  onTempo: (bpm: number) => void;
  onTogglePlay: () => void;
  onToggleClicks: () => void;
  onReset: () => void;
}

/**
 * The transport of the instrument: tempo, play and pause, the circuit over empty cells, and
 * the reset.
 *
 * Presentational: no state, no effects. It gets ONE object, the one of the transport.
 *
 * It returns its `border-t` block as one `div` with no wrapper: one more node would change
 * the vertical rhythm of the `space-y-2` that holds it, with the classes intact.
 */
export default function TransportPanel({ transporte }: { transporte: PropsDeTransporte }) {
  const { tempo, playing, clicks, onTempo, onTogglePlay, onToggleClicks, onReset } = transporte;
  return (
    <div className="mt-4 border-t pt-3 space-y-2">
      {/* The tempo row STACKS, and not for looks: the dock is 146 px wide at the floor. Three
          things in one row (the label, the slider and the readout) do not fit, and the
          overflow would be HORIZONTAL: the `overflow-y` of the dock does not cut it and an
          `overflow-x` does not fix it, because that scroll is exactly what must not exist.
          Stacked, the label and the readout share the first line, and the slider takes the
          full width below them. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <span id="tempo-etiqueta" className="font-medium">Tempo</span>
        {/* `aria-labelledby` and not `aria-label`: the name takes the text that the span
            above shows, and is not written twice. If the visible label changes, the
            announced one follows.

            `aria-valuetext` applies the argument of the comment below to the ear: a bare
            "110" does not say if it is bpm or intervals, and the instrument uses both
            units. The ear has no span next to the number: a `range` announces its raw
            number unless it has this attribute. */}
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
        {/* With the unit: a bare "110" does not say if it is bpm or intervals, and the
            instrument uses both units. The readout has no fixed width: in a dock of 146 px
            a fixed width makes the row overflow. `tabular-nums` keeps the number still
            while the slider moves. */}
        <span className="tabular-nums text-right whitespace-nowrap">{tempo} <span className="text-slate-500">bpm</span></span>
      </div>
      {/* The THREE buttons of the transport, each with an icon and no word. This row is the
          whole vocabulary of the instrument when it runs: make it sound, hear the circuit,
          and start again.

          The play button: **the icon IS the state**. What the user sees is what a press
          does, and the color repeats it so that one look is enough. The icon alone, with
          no word: ▶ and ⏸ are the universal vocabulary of a transport and need no gloss.
          And the label does not fit, measured: with "▶ Reproducir" the button needs 119 px
          of min-content in a row 148 px wide, so the row overflowed and the text wrapped
          to two lines. With the icon alone the button is 37.8 px wide.

          `aria-label` on the three, because with no text they have no accessible name: the
          glyph is not one, and the SVG even less. `title` so that the pointer says it too,
          with the SAME text: the pointer and the screen reader cannot tell two different
          stories of one button.

          When it runs, play uses the `bg-slate-900 text-white` with which the dock marks
          the active state: the click switch uses the same language when it is on. When
          paused it does NOT fall to `bg-slate-100`, the "off" of that language, because
          the same row has the click switch off (`bg-slate-100`) and `↺` (`bg-slate-200`):
          the main button of the instrument would look like the two secondary ones. The
          green is what a transport asks the user to read as "press this to make it
          sound". */}
      {/* `flex-wrap` for the same reason as the row above: there are three controls, and at
          the floor the dock is 146 px wide. To wrap is the only way not to overflow
          horizontally. */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playing? 'Pausa':'Reproducir'}
          title={playing? 'Pausa':'Reproducir'}
          className={`px-3 py-1 rounded text-white ${playing? 'bg-slate-900 hover:bg-slate-800':'bg-emerald-600 hover:bg-emerald-700'}`}
        >{playing? '⏸':'▶'}</button>
        {/* The click switch is a MIX switch: the circuit is the same with the clicks off,
            it only makes no sound. Its place is next to the transport, which decides what
            sounds while the instrument runs.

            **It turns off only one of the two kinds of crossing.** A crossing over an
            occupied cell plays its note and does not turn off, because it is model and not
            mix: to turn it off would silence part of what the board says. So the label
            says WHAT SOUNDS when the switch is on (the circuit, and the part of it that
            goes through empty cells) and does not name the click: the sound is a bell of
            fixed pitch, not a click.

            **And it cannot be deleted**: with the default off, this button is the only way
            to turn the circuit ON. Without it the circuit would be out of reach.

            It has no text, so it has no place to write ON/OFF. The COLOR says the state,
            and so does `aria-pressed`, which goes with the button and prevents color from
            being the only channel: `BR-ACC-005`. There is no visible text for an
            `aria-labelledby` to reference, so the label is an `aria-label`: `BR-ACC-003`. */}
        {/* An INLINE SVG and not a glyph, because Unicode has no metronome. The real
            candidates are ⏱ (a stopwatch: it measures how long something took, it does not
            mark the pulse), 🎵 and 🎼 (they say "music", which the ▶ next to it says) and
            🎹 (an instrument). An icon that does not tell this button from its neighbor is
            not an icon, it is decoration.

            It has no file of its own and no icon folder: it is the only inline SVG of the
            app, and an `icons/` folder with one element promises a system that does not
            exist. A second SVG is the moment to extract it.

            `1em` and `currentColor` give it the same optical size as the glyphs next to
            it, and make it inherit the `text-white` of the on state with no second rule.
            `aria-hidden` because the button gives the accessible name: without it the
            screen reader would announce the graphic and also the label. */}
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
        {/* `↺` and not `🗑`: the button empties the board AND stops the transport, so the
            two go back to the initial state. A bin promises to delete something chosen, an
            operation with a scope, and this is not that operation. The `aria-label` says
            the two halves because the two happen, and the `title` says the same.

            `ml-auto` separates it from the pair of ▶ and the click switch, and not for
            looks: it is the only destructive one of the three and it has no undo. It also
            solves a second problem of this row: the click switch when off is
            `bg-slate-100` and this button is `bg-slate-200`, a pair that cannot be told
            apart side by side. Apart, the doubt of which is which does not arise. */}
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
