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

/**
 * Pentomino Music: a prototype of an instrument, not a game with rules to solve.
 *
 * The user places pentominoes on a board sized to the screen, and each piece fires an
 * arpeggio of five notes. The piece decides the tonic. The rotation decides one of two
 * things, by the REGIME: the scale formula with `escala`, or where the arpeggio starts
 * with `orden`. The reflection decides the order of the notes. The position on the board
 * decides the playback order: a closed circuit visits the placed pieces by the shortest
 * way between them, not in the order they were placed.
 *
 * This file is the shell: state, derived values, handlers and the composition, and ZERO
 * effects. The geometry, the music, the board rules, the sound and the components live
 * in their capability, `src/<capability>/`. The bridge to the engine lives in
 * `playback/use-engine.ts` (the four reconciliation effects) and in
 * `board-editing/use-input.ts` (the two input effects).
 *
 * The six effects are outside this file for a reason: in a `.tsx`,
 * `react-refresh/only-export-components` forbids every export that is not the component,
 * so nothing that lives in this file can have a test. The logic lives in `.ts` modules
 * by the same mechanism.
 *
 * See the contracts `specs/musical-model/musical-model.md` and `specs/playback/playback.md`.
 */

export default function App() {
  const [selected, setSelected] = useState<PieceKey>('F');

  // The orientation belongs to the PIECE and not to the instrument. One `rotation` and
  // one `mirror` for the twelve makes a turn of the wheel on an `F` turn the other eleven
  // with no request. Measured: 11 of 12 thumbnails moved on each quarter turn (the one
  // that stayed was the `X`, which is symmetric). Worse, the orientation of the next
  // piece in hand is then the one the last piece left, not the one chosen for IT.
  //
  // A memory, and not "it resets when another piece is chosen", which also fixes the
  // complaint. With a memory the user can prepare twelve orientations and switch between
  // them with no new rotation, which is a way to play. With a reset, each change of piece
  // deletes work.
  //
  // The PLACED pieces do not depend on this: each `PlacedPiece` keeps its own
  // orientation, so a rotation of the piece in hand changes no note of the board.
  const [orientaciones, setOrientaciones] = useState<MemoriaDeOrientacion>(ORIENTACIONES_INICIALES);
  // It starts from the same number as the engine: DEFAULT_BPM is one declaration.
  const [tempo, setTempo] = useState<number>(DEFAULT_BPM);
  const [playing, setPlaying] = useState<boolean>(false);
  // The clicks of the circuit start OFF. With the default at `false`, the click switch of
  // the dock is the only way to turn them ON: that is why the switch cannot be deleted.
  //
  // The default lives here and in `clicksAudible` of `engine.ts`, which the effect of
  // `use-engine.ts` overwrites on mount. The two say `false`: one value declared two
  // times must not differ.
  //
  // The flag turns off only the clicks. A crossing sounds the note of its occupied cell
  // and this flag does not govern it, because a crossing is model and not mix.
  //
  // The reason for `false`: with the clicks on by default, they cover the phrase.
  const [clicks, setClicks] = useState<boolean>(false);
  // What the rotation does. It starts in `escala`, the scale regime. It is GLOBAL and
  // not for each piece: with a regime for each piece, two pieces at 90° sound with
  // different rules, and the board cannot show what a turn does to one of them. It is a
  // property of the instrument, like the tempo.
  //
  // It lives here and goes down by props, with no Context and no singleton: the repo has
  // no global state. It also makes the removal of one of the two regimes the deletion of
  // a branch, and not the untangling of one.
  const [regimen, setRegimen] = useState<RegimenDeRotacion>(DEFAULT_REGIMEN);

  // placed pieces
  const [placed, setPlaced] = useState<PlacedPiece[]>([]);

  // The pointed cell of the board, for the ghost. It has TWO writers, the mouse and the
  // keyboard focus, and it is still ONE state: the focused cell **is** `hover`. So the
  // ghost, the `pointer`/`not-allowed` cursor and `hoverEdita` work with the keyboard
  // with no new line of drawing. And no second "where it points" exists that can go out
  // of sync with the first.
  //
  // What is DRAWN with this is `cursor`, below: the grid changes size by itself, and the
  // pair kept here can point at a cell that the new grid does not have.
  const [hover, setHover] = useState<Cell | null>(null);

  // Whether the DOM focus is inside the board. It is the one thing `hover` cannot answer
  // alone, because the mouse also writes it. Two things depend on it: the focus ring
  // (which must not show under the mouse, which has no focus) and the tie-break rule of
  // `onMouseLeave`, below.
  //
  // It is one more state, so here is its cost: it changes when the focus ENTERS or
  // LEAVES the board, not on each cell crossed. Against the 337 elements measured for
  // each crossed cell, it is two re-renders for each visit. The low frequency is what
  // makes it cheap as state.
  const [focoEnTablero, setFocoEnTablero] = useState<boolean>(false);

  // The last change of the board, as text for the `aria-live` region. It lives in the
  // state and is not written to the DOM by hand, because the shell is the one that knows
  // which edit happened: the region is one more node of the render, and React updates it
  // like any other. The text of an edit comes from `cell-name.ts`, not from a string
  // built here.
  const [anuncio, setAnuncio] = useState<string>('');

  // The pair of the piece in hand, derived and not duplicated. The type of the memory
  // guarantees its twelve entries, because the `Record` is derived from `SHAPES`. So
  // this cannot give `undefined` and needs no default.
  const { rotation, mirror } = orientaciones[selected];

  const idRef = useRef(0);

  // `selected`, readable without being a dependency. It exists for ONE consumer:
  // `alRotar`, the callback of the wheel, which has empty dependencies on purpose. That
  // is what lets `useRuedaRota` register the `wheel` listener one time for each mount.
  // With the memory for each piece, the body must know WHICH entry to rotate, and
  // `selected` in the dependencies breaks that cardinality.
  //
  // The functional setter is not enough: `setOrientaciones(prev => ...)` receives the
  // previous `Record` and nothing else. It cannot know the piece in hand unless it
  // closes over `selected` or reads it from a ref.
  //
  // It is written WHERE `selected` is written and not in the body of the render. The body
  // is the obvious place, and the linter rejects it ("Cannot access refs during render"):
  // a ref read or written during the render is state that React cannot see. With
  // `elegirPieza` as the only writer of the two, the ref cannot go out of sync. The
  // other way is a `useEffect`, and this shell has none.
  //
  // The initial value comes from `selected` and not from a second `'F'` written next to
  // it: two literals that must match are the pair this repo does not leave loose.
  const selectedRef = useRef<PieceKey>(selected);

  /** The only writer of the piece in hand: the state that is drawn and the ref the wheel reads. */
  const elegirPieza = useCallback((pieza: PieceKey) => {
    selectedRef.current = pieza;
    setSelected(pieza);
  }, []);

  /**
   * Writes the entry of ONE piece. The four orientation gestures go through here.
   *
   * A new `Record` and a new object, never a mutation: `.agents/rules/ui.md` forbids it.
   * It also keeps the `memo` barrier of `OrientationPanel` true to what it says: the
   * identity of the `Record` changes when an orientation changes, and not when the
   * cursor moves.
   */
  const orientar = useCallback((pieza: PieceKey, cambio: (o: Orientacion) => Orientacion) => {
    setOrientaciones(prev => ({ ...prev, [pieza]: cambio(prev[pieza]) }));
  }, []);

  // The node of the board, for the wheel listener. It is created HERE and goes to `Board`
  // as one more prop: so the component gets no state and no effect.
  const boardRef = useRef<HTMLDivElement | null>(null);

  // The ROOT container, to hold `--cell`. It is not `boardRef`, and the difference is
  // inheritance: a custom property goes down the tree, and the two floating panels are
  // `fixed` outside `Board`. Set on the board, their boxes, which are measured in cells,
  // do not resolve `var(--cell)`.
  //
  // The effect that writes it lives in `board-fit/use-grid.ts` and not here: this shell
  // **declares no `useEffect`**, and a `resize` listener is the case that
  // `.agents/rules/ui.md` solves: the global listener lives in a `use-*.ts` hook, with
  // the `ref` created in the shell. The exact precedent is `useRuedaRota`, which
  // receives `boardRef`.
  const raizRef = useRef<HTMLDivElement | null>(null);
  // The hook **answers** as well as writes: the dimensions of the board come from the
  // same measurement as the cell size. CSS cannot resolve the dimensions, because they
  // decide how many nodes exist, so they come back as state. The hook changes that state
  // only when the numbers change, not on each pixel of the drag.
  const dims = useGrilla(raizRef);

  // The pieces that FIT in the current board. A smaller window gives a smaller grid, and
  // a piece that stays outside is not deleted: it stays in `placed`, it is not drawn and
  // does not sound, and it comes back whole when there is room again. The repo has no
  // undo, and a drag of the window edge is not an edit gesture.
  //
  // The criterion (the WHOLE piece, and why) lives in `cabeEn` and not here: it is a pure
  // function of the domain, and this shell holds none (`.agents/rules/ui.md`).
  //
  // **`visibles` is what is seen, touched and heard. `placed` is what exists.** So from
  // this line down each query chooses one of the two. The queries about the DRAWN board
  // (the occupant of a cell, the edit gesture, the circuit) use `visibles`, because a
  // piece that is not drawn cannot receive a click on a cell that looks empty. The
  // queries about LEGALITY use `placed`: a stored piece can have cells inside the new
  // grid ("it does not fit whole" is not "it is all outside"), and a placement on top of
  // them leaves two overlapped pieces when the window grows.
  const visibles = useMemo(() => placed.filter(p => cabeEn(p, dims)), [placed, dims]);

  // The same cut for the POINTED CELL, the other state that the new grid can leave on a
  // cell it does not have. The mouse and the focus write `hover`, and neither hears of a
  // `resize`: a person who moves the window edge, or presses `Ctrl`+`=` (zoom, so
  // viewport), touches neither the mouse nor the keyboard. So the pair that is kept can
  // fall outside `dims`.
  //
  // Outside `dims` is NOT harmless, and that makes this a derived value and not
  // tidiness. `Board` puts the anchor of the roving tabindex on this cell. With the
  // pointed cell on one that is not drawn, **no** cell has `tabIndex={0}` and the whole
  // board leaves the tab order. The `?? [0, 0]` of `Board.tsx` exists to prevent that
  // state. Also, `previewValid` gives `false` with `hover` set, so every cell shows
  // `cursor-not-allowed`, which says "it does not fit here" where the move is valid.
  //
  // `isValid([hover], [], dims)` and not a new predicate: "this cell is inside the board"
  // is what `isValid` answers with an empty board. `cabeEn` is built on it by the same
  // argument, and does not repeat the four limits.
  const cursor = hover !== null && isValid([hover], [], dims) ? hover : null;
  // With no pointed cell, the focus is not on a cell either: `alMoverElFoco` writes the
  // two halves together, so they fall together. Without this, the focus ring is drawn on
  // (0,0), where the anchor falls, while the DOM focus is not there.
  const focoEnCelda = focoEnTablero && cursor !== null;

  // The two floating panels start OPEN: an instrument that starts with its controls
  // hidden is not discovered. Folded, each panel leaves only its header, and each covered
  // cell is one click away. It does not persist: a reload opens them, as a reload empties
  // the board.
  const [piezasAbierto, setPiezasAbierto] = useState<boolean>(true);
  const [senalAbierta, setSenalAbierta] = useState<boolean>(true);

  // Whether the tap of the modifier that is down is still clean. It is a ref and not
  // `useState` because it changes several times in one gesture and nothing draws it: as
  // state, one pressed key re-renders the whole tree.
  const tapLimpio = useRef<boolean>(false);

  const transformedShape = useMemo(() => {
    let c = SHAPES[selected];
    c = rotateN(c, rotation);
    if (mirror) c = reflect(c);
    return c; // normalized
  }, [selected, rotation, mirror]);

  // The sequence, computed ONE time for each board and consumed by two: the engine (by
  // the projection without cells) and the playhead (by `encolar`). To compute it again
  // in each consumer lets two of them look at different circuits, and what is seen and
  // what sounds must not differ.
  //
  // `regimen` is in the dependencies, and that is not optional: this is the first of the
  // three derivations that must carry the regime. Without it, a change of regime does
  // not re-derive the board. That re-derivation is the intended consequence of notes
  // that are not kept in `PlacedPiece`.
  const secuencia = useMemo(() => buildSequence(visibles, regimen, dims), [visibles, regimen, dims]);

  // The arpeggio of the piece IN HAND, for the panel and for the placement click. The
  // derivation lives in `musical-model/music.ts` and not here: the placed pieces ask for
  // it on their own (`buildSequence`, for the engine), and the rule must exist one time.
  const noteSet = useMemo(() => arpeggioFor(selected, rotation, mirror, regimen), [selected, rotation, mirror, regimen]);

  // The four reconciliation effects that keep the engine on this same board live in
  // `playback/use-engine.ts`. The call is HERE and not above with the other wiring:
  // `secuencia` is a `const`, so a call before its `useMemo` reads it in its temporal
  // dead zone and throws a `ReferenceError` on the first render. It is still BEFORE the
  // two input hooks, so the four effects register before the input effects.
  //
  // `visibles` and not `placed`, for the same reason as above: this hook gives the draw
  // queue the board that the sequence is matched against, and the sequence comes from
  // `visibles`. With the whole board, the queue gets pieces the sequence does not name (a
  // piece the window left outside). The match ignores them, and that is the kind of
  // extra data that a later reader takes as present.
  useMotorSincronizado({ secuencia, placed: visibles, tempo, clicks });

  // The board is edited ON the board: on a placed piece, and only with that same piece in
  // hand, the click removes it and `Alt`+click toggles its mute. `accionDeClick` decides
  // which gesture it is; it is a pure function and has tests. Here stay the wiring and
  // the two queries to the domain that the pure function cannot make.
  function handleCellClick(x: number, y: number, altKey: boolean) {
    // `visibles` and not `placed`: a piece that does not fit in the current grid is not
    // drawn, so a cell that looks empty must BEHAVE as empty. With the whole board, a
    // drag of the window edge leaves invisible pieces that intercept clicks: a click
    // removes or mutes a piece that is not on screen, and announces it. It is the same
    // difference between what is seen and what the model does, the other way round.
    //
    // What stays of the stored piece is its LEGALITY, and the `isValid` below still
    // checks it against the whole `placed`: a placement on its cells is refused all the
    // same (the ghost is already pink), so nothing can cover what is not seen.
    const ocupante = occupantAt(visibles, x, y);
    const accion = accionDeClick(ocupante, selected, altKey);
    if (accion === null) return;   // a cell occupied by ANOTHER piece: nothing happens

    // The two edit branches are nested inside `ocupante !== null` and do not hang from
    // `accion`: the pure function guarantees that `quitar` and `mutear` come only with an
    // occupant. So TypeScript knows it, and no `!` must assert the same with no proof.
    if (ocupante !== null) {
      if (accion === EDICION.quitar) setPlaced(arr => arr.filter(p => p.id !== ocupante.id));
      // A new object and not `p.muted = !p.muted`: never mutate what React already has.
      else setPlaced(arr => arr.map(p => p.id === ocupante.id ? { ...p, muted: !p.muted } : p));
      // The announcement says the state the piece is LEFT in, and comes from the same
      // expression that the `setPlaced` above stores: so the screen reader cannot say a
      // mute different from the one the board applied. `quitar` receives it too. There
      // the phrase says which piece left and from where; the argument is in the docblock
      // of `anuncioDeEdicion`.
      setAnuncio(anuncioDeEdicion(accion, ocupante.piece, x, y, !ocupante.muted));
      return;
    }

    const cells = cellsAt(transformedShape, ANCHOR_INDEX[selected], x, y);
    if (!isValid(cells, placed, dims)) return;
    // The piece limit. The area of the board does not give it: the board comes from the
    // viewport, and 78 pieces fit on a desktop. The circuit is solved with exact
    // Held-Karp, `O(n²·2ⁿ)`. Measured: 12 pieces take 3.1 ms and 16 pieces take 18.6 ms.
    // The reason for the number is in `MAX_PIEZAS`.
    //
    // It is checked AFTER `isValid` and with the same treatment: the board does not
    // change. What it adds is the announcement, because it is the only refusal that does
    // not explain itself: an invalid move is seen (the ghost is pink) and this one is not.
    //
    // It counts `placed` and not `visibles`, as the `isValid` above does. The limit
    // exists to bound the `2ⁿ` of the circuit, and a stored piece comes back when the
    // window grows. A count of the visible pieces lets the user store twenty pieces with
    // a smaller window between placements, and the `buildSequence` of the first larger
    // window receives them all.
    if (placed.length >= MAX_PIEZAS) {
      setAnuncio(`El tablero acepta ${MAX_PIEZAS} piezas y ya tiene ${MAX_PIEZAS}. Quitá una para poder colocar otra.`);
      return;
    }
    // `Alt` means "muted" on the two sides of the gesture: a placement with it puts a
    // piece in the circuit for its SPACE and its TIME (it moves the visit order and adds
    // distance) and adds no five notes. It is the only way to compose with silence.
    const muted = accion === EDICION.colocarMuteada;
    const newPiece: PlacedPiece = {
      id: String(++idRef.current),
      piece: selected, rotation, mirror, cells, muted,
    };
    setPlaced(prev => [...prev, newPiece]);
    // After the `isValid`, not before: a move that does not fit did not change the board,
    // so its announcement tells a person who cannot see the screen a thing that did not
    // happen.
    setAnuncio(anuncioDeEdicion(accion, selected, x, y, muted));
    // The courtesy arpeggio plays only with the transport stopped: no clock runs that
    // can play the piece, so the click is the only immediate way to hear it. With the
    // transport running, the loop plays the piece: `setSequence` does not interrupt the
    // cycle in course, so the piece enters at the cycle boundary, and an arpeggio here
    // sounds it a second time. Without Web Audio, `playing` never becomes true, so the
    // degraded case falls on the side that sounds.
    //
    // A MUTED placement does not fire it: the piece is placed so that it does not sound,
    // and a courtesy arpeggio contradicts the gesture at the moment of the gesture.
    if (!playing && !muted) playNow(noteSet);
  }

  // Reset stops the transport AS WELL AS it empties the board, and that second half is
  // not cosmetic. To empty only `placed` leaves the engine at work on its active cycle:
  // the new, empty sequence enters at the cycle boundary. That is up to 7.5 s of sound
  // on a board that is already empty. Reset is an explicit order to go back to zero, not
  // an edit of the board, so it is the only place where it is correct to skip the swap
  // at the cycle boundary. What stays is the latency of a pause, which the engine
  // documents: the 100 ms of the lookahead plus the tail of the arpeggio already
  // scheduled.
  //
  // That paragraph is true for ONE of the two queues. The other, the draw queue in
  // `playback/route-source.ts`, advances only when the engine closes a cycle, so never
  // with the clock stopped: without a restart, the veil of the deleted pieces is drawn
  // on an empty board until the next Play. The two restart together or the bug comes
  // back, and the two go through `use-engine.ts`, the only module by which this shell
  // reaches the transport of the engine.
  //
  // What it does NOT touch must be said, because the constant is next to it: `↺` does
  // **not** set the twelve orientations back to zero. The decision has a written cost:
  // the invariant "after `↺` the app is as it was when it opened" is given up. In
  // exchange this button keeps one scope that has a name, the PLACED pieces, and does
  // not do two things of different domains. The orientation state has its own button,
  // the `0°` of the dock, and that one resets one piece.
  function resetBoard() {
    frenarTransporte();
    reiniciarRecorrido();
    setPlaying(false);
    setPlaced([]); // the reconciliation effect empties the sequence
  }

  // `useCallback` and not a plain function, because the space bar shortcut also calls
  // it: the keyboard effect has it in its dependencies, and without the memo it changes
  // identity on each render and subscribes the two listeners again for each key. With
  // `[playing]`, the identity changes exactly when the transport changes, which is the
  // real dependency that the effect declares.
  const togglePlay = useCallback(() => {
    // The decision (ask for the opposite of the current state, and believe the engine
    // and not the request) lives in `alternarTransporte`, where it has a test. Here stays
    // the wiring: the real engine and the `setState` with the answer of the engine.
    setPlaying(alternarTransporte(playing, MOTOR));
  }, [playing]);

  // ── Direct input ─────────────────────────────────────────────────────
  // The two effects live in `board-editing/use-input.ts`, and receive CALLBACKS and not
  // setters: so a change of the shape of the orientation state changes this block and
  // not the hook.
  //
  // `tapLimpio` stays HERE and goes to the two: the keyboard reads it and the two write
  // it, so the ref belongs to the one that composes them. `use-input.ts` has the
  // argument.

  // The two keyboard callbacks are memoized with their REAL dependencies and not with
  // `[]`. The real dependency is ONE, `selected`, and not `rotation` or `mirror`: the
  // change is computed inside the functional setter on the previous entry, so the
  // callback does not read the current orientation. With inline arrows the hook
  // subscribes again on each render, which is worse, and silent.
  const rotarConTecla = useCallback(
    () => orientar(selected, o => ({ ...o, rotation: siguienteRotacion(o.rotation) })),
    [orientar, selected],
  );
  const reflejarConTecla = useCallback(
    () => orientar(selected, o => ({ ...o, mirror: !o.mirror })),
    [orientar, selected],
  );

  // The `0°` button of the dock: it sets the piece in hand, and only that one, back to
  // the initial orientation.
  const resetearOrientacion = useCallback(
    () => orientar(selected, () => ORIENTACION_INICIAL),
    [orientar, selected],
  );

  // The letter chooses the piece. It is `elegirPieza` as it is and not a new callback:
  // the piece in hand has ONE writer, which updates the state and the ref together. A
  // second wrapper for the hook opens the way to a second writer that does not touch the
  // ref. Its identity is stable because of its `useCallback` with empty dependencies
  // above, not because `setSelected` is stable.
  //
  // The hook receives a callback and not the setter. So a change of the shape of the
  // state, with `rotation` and `mirror` as one entry for each piece, lands here and not
  // inside the hook.
  const seleccionarConTecla = elegirPieza;

  // `useCallback` with EMPTY dependencies, and it is not cosmetic: it lets the `wheel`
  // listener register one time for each mount. If it gets a dependency, the listener
  // subscribes again with it.
  //
  // The body DOES need a fact of the render, which piece is in hand, and the functional
  // setter cannot give it: it receives the previous `Record` and nothing else. The way
  // out is `selectedRef`, argued above. `selected` in the dependencies is the other
  // way, and it breaks the single subscription.
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

  // The context menu NEVER opens on the board (`preventDefault` always), but the toggle
  // is another matter: on macOS, `Ctrl`+click arrives as `contextmenu` with
  // `ctrlKey: true`, and there the `keyup` of `Ctrl` toggles. To count the two gives a
  // net of zero, and the reflection never answers on an Apple laptop with no mouse.
  function handleContextMenu(e: { preventDefault: () => void; ctrlKey: boolean }) {
    e.preventDefault();
    // One entry, like the other three orientation gestures. The right button is the
    // eighth consumer of the orientation and the only one that goes through no effect
    // and no `useMemo`. So a search by hand misses it; let the typecheck list them.
    if (reflejaElContextMenu(e)) orientar(selected, o => ({ ...o, mirror: !o.mirror }));
  }

  // The focus entered a cell of the board, or left the board (`null`). The two halves
  // are in one function because they are the same fact: the focused cell IS the pointed
  // cell. On entry the function writes it, and on exit it clears it (as `onMouseLeave`
  // does with the mouse). `focoEnTablero` is "did a cell arrive?".
  function alMoverElFoco(celda: Cell | null) {
    setFocoEnTablero(celda !== null);
    setHover(celda);
  }

  // THE tie-break rule, written one time and in one place: while the DOM focus is inside
  // the board, the focus wins over the mouse. Without it, a mouse that leaves the grid
  // clears the ghost of the focused cell, and the roving tabindex has no anchor. Then
  // "the focused cell is the hover" is a promise that the mouse breaks. Two copies of
  // this condition are two ways for the ghost to flicker.
  //
  // The event itself solves the other direction, with no second rule: the `blur` knows
  // which node gets the focus, so `Board` tells "it left the board" from "it jumped to
  // another cell" before it calls `alMoverElFoco(null)`.
  function alSalirElMouse() {
    if (!focoEnCelda) setHover(null);
  }

  // If the piece in hand occupies the pointed cell, the click does not place: it edits.
  // The condition comes from the SAME pure function that decides the click, so the
  // cursor cannot promise one thing while the gesture does another. So it reads
  // `visibles`, which is what `handleCellClick` reads: with the whole `placed`, a piece
  // the window left outside turns the ghost off and promises an edit on an empty cell.
  const hoverEdita = esLaPiezaEnLaMano(cursor ? occupantAt(visibles, cursor[0], cursor[1]) : null, selected);

  // The ghost: where the piece lands from the pointed cell. The cells outside the board
  // are not drawn, but they do count to mark the move as invalid.
  //
  // On a cell of an own piece the ghost is NOT drawn. The decision: a placement there is
  // invalid, because the piece hits itself, so the ghost is all pink and says "it does
  // not fit here" on the one cell where the click does something. What is seen is the
  // placed piece, which is what the gesture acts on.
  const previewCells = cursor && !hoverEdita ? cellsAt(transformedShape, ANCHOR_INDEX[selected], cursor[0], cursor[1]) : [];
  const previewValid = cursor && !hoverEdita ? isValid(previewCells, placed, dims) : false;

  // The reason for this `useMemo`, and the number that justifies it, are below, next to
  // the `<PiecePalette>` that consumes it.
  const orientacion = useMemo(() => ({
    selected, orientaciones, regimen, noteSet,
    onSelect: elegirPieza,
    onRegimen: setRegimen,
    onResetOrientacion: resetearOrientacion,
  }), [selected, orientaciones, regimen, noteSet, elegirPieza, resetearOrientacion]);

  // The board IS the screen. No row of cards is laid out, because no card exists. What
  // stays is a box of the exact size of the viewport, with the board centered inside and
  // the two panels that float on top.
  //
  // `100dvh` and not `100vh`: on iOS, `100vh` includes the browser bar, so the board
  // jumps when the bar shows and hides. `overflow-hidden` makes the first half of the
  // promise true: zero vertical scroll of the page. It also makes the other half true:
  // the board has no `overflow-x-auto` of its own to absorb an overflow, because it
  // cannot overflow: `grid-fit.ts` chooses the cells against THIS box. So this class is
  // the guarantee, not the safety net.
  //
  // `bg-fondo text-slate-900` STAY: this `div` is one of the four places where the
  // background color lives, and `__tests__/fondo-sincronizado.test.ts` exists so that
  // the four do not go out of sync.
  return (
    <div ref={raizRef} className="h-dvh w-full overflow-hidden bg-fondo text-slate-900">
      {/* `orientacion` is memoized, and `transporte` is built inline. The reason is a
            measured number, in `__tests__/App.browser.test.tsx`.

            `hover` lives in this file, so a cursor that crosses ten cells re-renders the
            tree ten times. Without a barrier, `OrientationPanel` runs the TEN times, at
            337 elements each (1 grid + 12 x (button + grid + 25 cells + span), with
            `MINI_BOX = 5`). That is 3370 elements reconciled to reach the SAME DOM,
            because no prop of the panel depends on the hover.

            The cost decided it, measured with `Profiler` on the whole commit of the app:
            a median of 4.9 ms for each crossed cell without the barrier against 1.9 ms
            with it. That is 3.0 ms, 61 %, spent in the subtree that cannot have changed,
            at the frequency of the MOUSE, which on the board is one cell for each drawn
            frame. `Spectrum` and `Playhead` left React by the same criterion; for this
            one a `memo` is enough.

            The dependency array is not debt kept by hand: `react-hooks/exhaustive-deps`
            verifies it in the lint. A new field of `PropsDeOrientacion` that is not in
            the array gives red, not a stale panel on screen.

            `hover` has a second writer: the arrows. Each press moves the focus, the focus
            writes `hover`, and `hover` re-renders this tree: the same 337 elements of
            `OrientationPanel`, for the same reason. So the barrier covers the two hands
            with no new line: the `useMemo` does not look at where the change of `hover`
            came from.

            The 4.9 ms and the 1.9 ms are measured on the mouse. The keyboard writes the
            same state at the cadence of the hand, and with auto-repeat at the cadence of
            the system. It was not measured again: it is the same work for each press
            against a different clock. So read the number as "for each write of `hover`"
            and not "for each cell crossed with the mouse".

            `transporte` is built inline because of the number: nothing consumes it behind
            a barrier, so a memo changes no render. */}
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

      {/* The signal that leaves the master, as a floating panel at the bottom left. It
            receives no props: it reads from the engine on its own, so that a draw at 60
            fps re-renders nothing of this file.

            The position comes from the measurement, like the position of the dock:
            `3 × 1` cells in the bottom left corner cover the first three cells of the last
            row. They leave free the last cell of that row and `(0,0)`, the two cells that
            the seam joins.

            The height is ONE cell, and the content fits inside with `flex-col`: the canvas
            takes what is left after the header. A fixed `h-24` of 96 px on `Spectrum`
            makes the content ask for 132 px against the 73 px of the box, and the panel
            takes a second row of the board. */}
      <aside
        className="fixed left-0 bottom-0 z-20 flex flex-col rounded-tr-2xl shadow-lg bg-white/85 backdrop-blur p-2"
        style={{ width: `calc(var(--cell) * 3)`, height: senalAbierta ? `calc(var(--cell) * 1)` : undefined }}
      >
        <button
          type="button"
          onClick={() => setSenalAbierta(v => !v)}
          aria-expanded={senalAbierta}
          aria-controls="franja-senal"
          className="shrink-0 text-left text-sm font-semibold mb-1"
        >Señal</button>
        {/* `hidden` and not an unmount: the `ResizeObserver` of `spectrum-loop.ts` draws
              again because its container changes SIZE. If a fold unmounts the `<canvas>`,
              no observer fires: the cleanup of `iniciarEspectro` runs, and the unfold
              mounts a new loop. */}
        <div id="franja-senal" hidden={!senalAbierta} className="min-h-0 flex-1">
          <Spectrum />
        </div>
      </aside>

      {/* The only `aria-live` region of `src/`.
          It announces the result of the THREE edits (place, remove and mute), because
          they are the only changes of the board, and the only ones that a person who
          cannot see the screen cannot confirm another way: the board is edited ON the
          board, and a removal has no undo.

          And NOTHING else but the refusal at the piece limit. Not the circuit, not the
          playhead, not the spectrum: the playhead goes from cell to cell between 4 and
          10.6 times each second, and a region that speaks at that frequency is hostile.
          The screen reader never ends a phrase, and it covers all the rest. How to tell
          the circuit without a narration is an open question.

          `polite` and not `assertive`: the person who hears the edit asked for it, so it
          can wait until the reader ends what it says. The node exists from the first
          render with empty text, and that makes the first announcement heard: a region
          just inserted in the DOM is not announced. */}
      <div aria-live="polite" className="sr-only">{anuncio}</div>

    </div>
  );
}
