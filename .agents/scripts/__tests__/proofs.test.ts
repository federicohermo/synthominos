import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { DOCTOR_USAGE, PROVE_USAGE, doctor, prove, settle, type App, type Mark, type ProveSystem, type Spot, type Step } from '../proofs.ts';

/** A reading: the next value of a list, whose last value repeats, or a function of the actions so far. */
type Reads = Record<string, unknown[] | ((calls: readonly string[]) => unknown)>;

interface FakeOptions {
  readonly errors?: string[];
  readonly board?: App['board'];
  /** The action that rejects. */
  readonly failOn?: string;
}

function fakeApp(reads: Reads, options: FakeOptions = {}) {
  const calls: string[] = [];
  const next = <T>(key: string): Promise<T> => {
    const source = reads[key];
    if (typeof source === 'function') return Promise.resolve(source(calls) as T);
    if (source === undefined || source.length === 0) return Promise.reject(new Error(`nothing scripted for ${key}\nsecond line`));
    return Promise.resolve((source.length > 1 ? source.shift() : source[0]) as T);
  };
  const act = (call: string): Promise<void> => {
    if (call === options.failOn) return Promise.reject(new Error(`${call} failed`));
    calls.push(call);
    return Promise.resolve();
  };
  const spot = (label: string): Spot => ({
    click: how => act(`click ${label}${how === undefined ? '' : ` ${JSON.stringify(how)}`}`),
    hover: () => act(`hover ${label}`),
    getAttribute: name => next(`${label} ${name}`),
    count: () => next(`count ${label}`),
  });
  const app: App = {
    board: options.board ?? { width: 10, height: 6 },
    errors: options.errors ?? [],
    cell: (x, y) => spot(`cell ${x},${y}`),
    piece: letter => spot(`piece ${letter}`),
    slots: () => spot('slots'),
    button: name => spot(`button ${name}`),
    cellName: (x, y) => next(`name ${x},${y}`),
    announced: () => next('announced'),
    litPixels: () => next('lit'),
    playhead: () => next('playhead'),
    key: key => act(`key ${key}`),
    wheel: deltaY => act(`wheel ${deltaY}`),
    blur: () => act('blur'),
    wait: ms => act(`wait ${ms}`),
    title: () => next('title'),
    screenshot: file => act(`screenshot ${path.basename(file)}`),
    close: () => act('close'),
  };
  return { app, calls };
}

/** `open` gives `page`, rejects with it when it is an error, and throws it when it is a string. */
function fakeSystem(page: App | Error | string) {
  const out: string[] = [];
  const err: string[] = [];
  const written = new Map<string, string>();
  const opened: string[] = [];
  const closeServer = vi.fn(() => Promise.resolve());
  const launch = vi.fn(() => Promise.resolve({ url: 'http://localhost:5300/', close: closeServer }));
  const sys: ProveSystem = {
    launch,
    open: url => {
      opened.push(url);
      if (typeof page === 'string') throw page as unknown;
      return page instanceof Error ? Promise.reject(page) : Promise.resolve(page);
    },
    folder: feature => `/runs/${feature}`,
    write: (file, text) => { written.set(file, text); },
    out: line => { out.push(line); },
    err: line => { err.push(line); },
  };
  const record = (feature: string) => JSON.parse(String(written.get(path.join(`/runs/${feature}`, 'proof.json')))) as {
    passed: boolean; url: string; steps: Step[]; consoleErrors: string[];
  };
  return { sys, out, err, opened, launch, closeServer, record };
}

const copy = (reads: Reads): Reads =>
  Object.fromEntries(Object.entries(reads).map(([key, source]) => [key, typeof source === 'function' ? source : [...source]]));

const failing = (steps: readonly Step[]) => steps.filter(step => !step.ok).map(step => step.action);

const PLACE_AND_PLAY: Reads = {
  'name 4,4': ['fila 5, columna 5, libre', 'fila 5, columna 5, pieza T, nota G4, paso 1 de 4'],
  'piece T aria-pressed': ['true'],
  lit: [0, 812, 400, 0, 860],
  announced: ['pieza T colocada en fila 5, columna 5'],
  'count button Pausa': [1],
  'count button Reproducir': [1],
};

const F = (...names: string[]) => names.map(name => `F, rotación ${name}`);
const ORIENTATION: Reads = { 'piece F aria-label': F('0°', '90°', '180°', '180°, reflejada', '180°', '0°') };

const FREE = 'fila 4, columna 7, libre';
const L = 'fila 4, columna 7, pieza L, nota F#4, paso 2 de 4';
const MUTED = 'fila 4, columna 7, pieza L muteada, nota F#4, paso 2 de 4';
const EDIT: Reads = {
  announced: ['pieza L colocada en fila 4, columna 7', 'pieza L quitada de fila 4, columna 7'],
  'name 6,3': [MUTED, L, FREE, L, FREE],
};

const KEYBOARD: Reads = {
  'piece W aria-pressed': ['true'],
  'piece F aria-pressed': ['false'],
  'count button Pausa': [1],
  'count button Reproducir': [1],
};

const ON_T: Mark = { cell: 'fila 3, columna 4, pieza T, nota D5, paso 4 de 4', outer: true };
const ON_L: Mark = { cell: 'fila 6, columna 7, pieza L, nota D4, paso 0 de 4', outer: true };
const ON_LEG: Mark = { cell: 'fila 7, columna 7, libre', outer: false };

/** No playhead before play and after pause. Between them, one mark for each wait, and the last one repeats. */
function playheadOf(...marks: (Mark | null)[]) {
  return (calls: readonly string[]) => {
    if (!calls.includes('click button Reproducir') || calls.includes('click button Pausa')) return null;
    return marks[Math.min(calls.filter(call => call === 'wait 50').length, marks.length - 1)];
  };
}

const CIRCUIT: Reads = {
  'name 2,3': ['fila 4, columna 3, pieza T, nota G4, paso 1 de 4'],
  'name 6,3': ['fila 4, columna 7, pieza L, nota F#4, paso 2 de 4'],
  'button Recorrido en el vacío aria-pressed': ['true'],
  playhead: playheadOf(null, ON_T, ON_L, ON_LEG),
};

const SCRIPTS: Record<string, Reads> = {
  'place-and-play': PLACE_AND_PLAY, orientation: ORIENTATION, edit: EDIT, keyboard: KEYBOARD, circuit: CIRCUIT,
};

describe('each proof drives the path of a player', () => {
  it.each([
    ['place-and-play', ['click piece T', 'click cell 4,4', 'wait 100', 'click button Reproducir', 'click button Pausa']],
    ['orientation', [
      'hover cell 4,4', 'wheel 100', 'key Shift', 'key Control', 'click cell 4,4 {"button":"right"}',
      'click button Volver esta pieza a 0° sin reflejar',
    ]],
    ['edit', [
      'click piece L', 'click cell 6,3', 'click cell 6,3 {"modifiers":["Alt"]}', 'click cell 6,3 {"modifiers":["Alt"]}',
      'click cell 6,3', 'click cell 6,3', 'click button Vaciar el tablero y frenar el transporte',
    ]],
    ['keyboard', ['key w', 'click cell 3,3', 'blur', 'key Space', 'key Space']],
    ['circuit', [
      'click piece T', 'click cell 2,3', 'click piece L', 'click cell 6,3', 'click button Recorrido en el vacío',
      'click button Reproducir', 'wait 50', 'wait 50', 'wait 50', 'click button Pausa',
    ]],
  ])('%s passes when the page shows what the player expects', async (feature, actions) => {
    const { app, calls } = fakeApp(copy(SCRIPTS[feature]));
    const { sys, record } = fakeSystem(app);
    expect(await prove([feature, 'http://localhost:5173/'], sys)).toBe(0);
    expect(calls).toEqual([...actions, 'screenshot final.png', 'close']);
    expect(record(feature).passed).toBe(true);
    expect(failing(record(feature).steps)).toEqual([]);
  });

  const played = (calls: readonly string[]) => calls.includes('click button Reproducir');
  it.each<[string, string, Reads, string]>([
    ['place-and-play', 'the idle state counts as sound', { lit: [4707, 812, 0, 860] }, 'read the idle spectrum'],
    ['place-and-play', 'the placement makes no sound', { lit: calls => (played(calls) ? 860 : 0) }, 'hear the courtesy arpeggio'],
    ['place-and-play', 'the sound never stops', { lit: [0, 812] }, 'wait for silence'],
    ['place-and-play', 'play makes no sound', { lit: [0, 812, 0] }, 'hear the cycle'],
    ['place-and-play', 'play does not start', { 'count button Pausa': [0] }, 'press play'],
    ['place-and-play', 'the cell keeps no piece', { 'name 4,4': ['fila 5, columna 5, libre'] }, 'read the cell again'],
    ['orientation', 'the wheel does not turn', { 'piece F aria-label': F('0°', '0°', '180°', '180°, reflejada', '180°', '0°') }, 'turn the wheel over the board'],
    ['orientation', 'the right click does not reflect', { 'piece F aria-label': F('0°', '90°', '180°', '180°, reflejada', '180°, reflejada', '0°') }, 'right-click the board'],
    ['edit', 'the second placement fails', { 'name 6,3': [MUTED, L, FREE, FREE, FREE] }, 'place it again'],
    ['edit', 'reset leaves the piece', { 'name 6,3': [MUTED, L, FREE, L, L] }, 'press reset'],
    ['keyboard', 'the space bar does nothing', { 'count button Pausa': [0] }, 'press the space bar'],
    ['circuit', 'the first piece is not placed', { 'name 2,3': ['fila 4, columna 3, libre'] }, 'place T and L apart'],
    ['circuit', 'the second piece is not placed', { 'name 6,3': ['fila 4, columna 7, libre'] }, 'place T and L apart'],
    ['circuit', 'the click switch stays off', { 'button Recorrido en el vacío aria-pressed': ['false'] }, 'press the click switch'],
    ['circuit', 'a paused board shows a playhead', { playhead: [ON_T, ON_T, ON_L, ON_LEG, null] }, 'read the playhead before play'],
    ['circuit', 'the playhead never reaches the piece T', { playhead: playheadOf(ON_L, ON_LEG) }, 'see the playhead on the piece T'],
    ['circuit', 'the playhead never reaches the piece L', { playhead: playheadOf(ON_T, ON_LEG) }, 'see the playhead on the piece L'],
    ['circuit', 'the playhead never leaves the pieces', { playhead: playheadOf(ON_T, ON_L) }, 'see the playhead on a free cell of a leg'],
    ['circuit', 'a leg cell takes the mark of a note', { playhead: playheadOf(ON_T, ON_L, { ...ON_LEG, outer: true }) }, 'see the playhead on a free cell of a leg'],
    ['circuit', 'the playhead stays after pause', { playhead: [null, ON_T, ON_L, ON_LEG] }, 'press pause'],
  ])('%s fails when %s', async (feature, _, fault, step) => {
    const { app } = fakeApp({ ...copy(SCRIPTS[feature]), ...fault });
    const { sys, record } = fakeSystem(app);
    expect(await prove([feature, 'http://localhost:5173/'], sys)).toBe(1);
    expect(failing(record(feature).steps)).toEqual([step]);
  });
});

describe('prove', () => {
  it.each([[[]], [['chords']], [['edit', 'http://localhost:5173/', 'extra']]])('rejects %j with 2 and starts nothing', async args => {
    const { sys, err, launch, opened } = fakeSystem(fakeApp({}).app);
    expect(await prove(args, sys)).toBe(2);
    expect(err).toEqual([PROVE_USAGE]);
    expect(launch).not.toHaveBeenCalled();
    expect(opened).toEqual([]);
  });

  it('with no URL starts a server of its own, drives it, and stops it', async () => {
    const { app, calls } = fakeApp(copy(KEYBOARD));
    const { sys, out, opened, closeServer, record } = fakeSystem(app);
    expect(await prove(['keyboard'], sys)).toBe(0);
    expect(opened).toEqual(['http://localhost:5300/']);
    expect(calls.at(-1)).toBe('close');
    expect(closeServer).toHaveBeenCalledOnce();
    expect(record('keyboard')).toMatchObject({ passed: true, url: 'http://localhost:5300/', consoleErrors: [] });
    expect(out).toEqual([
      'ok   press the key W -> "true"',
      'ok   read the piece F -> "false"',
      'ok   press the space bar -> 1',
      'ok   press it again -> 1',
      'PASSED: /runs/keyboard',
    ]);
  });

  it('with a URL starts no server and stops none', async () => {
    const { sys, launch, closeServer, opened } = fakeSystem(fakeApp(copy(KEYBOARD)).app);
    expect(await prove(['keyboard', 'http://localhost:5173/'], sys)).toBe(0);
    expect(opened).toEqual(['http://localhost:5173/']);
    expect(launch).not.toHaveBeenCalled();
    expect(closeServer).not.toHaveBeenCalled();
  });

  it('a step that throws is a failed step, and the evidence and the cleanup still happen', async () => {
    const { app, calls } = fakeApp({});
    const { sys, out, closeServer, record } = fakeSystem(app);
    expect(await prove(['keyboard'], sys)).toBe(1);
    expect(calls).toEqual(['key w', 'screenshot final.png', 'close']);
    expect(closeServer).toHaveBeenCalledOnce();
    expect(record('keyboard').steps).toEqual([
      { action: 'the proof stopped', observed: 'nothing scripted for piece W aria-pressed', ok: false },
    ]);
    expect(out.at(-1)).toBe('FAILED: /runs/keyboard');
  });

  it('a page that does not open is a failed step: nothing to shoot or close, and the server stops', async () => {
    const { sys, closeServer, record } = fakeSystem('net::ERR_CONNECTION_REFUSED');
    expect(await prove(['edit'], sys)).toBe(1);
    expect(closeServer).toHaveBeenCalledOnce();
    expect(record('edit')).toMatchObject({
      passed: false,
      steps: [{ action: 'the proof stopped', observed: 'net::ERR_CONNECTION_REFUSED', ok: false }],
      consoleErrors: [],
    });
  });

  it('a screenshot that fails is a failed step, and the page still closes', async () => {
    const { app, calls } = fakeApp(copy(KEYBOARD), { failOn: 'screenshot final.png' });
    const { sys, record } = fakeSystem(app);
    expect(await prove(['keyboard', 'http://localhost:5173/'], sys)).toBe(1);
    expect(calls.at(-1)).toBe('close');
    expect(record('keyboard').steps.at(-1)).toEqual({ action: 'the proof stopped', observed: 'screenshot final.png failed', ok: false });
  });

  it('a console error fails a proof whose steps all hold', async () => {
    const { sys, record } = fakeSystem(fakeApp(copy(KEYBOARD), { errors: ['Uncaught TypeError: x'] }).app);
    expect(await prove(['keyboard', 'http://localhost:5173/'], sys)).toBe(1);
    expect(record('keyboard')).toMatchObject({ passed: false, consoleErrors: ['Uncaught TypeError: x'] });
  });

  it('stops its server even when the browser does not close', async () => {
    const { sys, closeServer } = fakeSystem(fakeApp(copy(KEYBOARD), { failOn: 'close' }).app);
    await expect(prove(['keyboard'], sys)).rejects.toThrow('close failed');
    expect(closeServer).toHaveBeenCalledOnce();
  });
});

describe('settle', () => {
  it('returns at once when the first reading holds', async () => {
    const wait = vi.fn(() => Promise.resolve());
    expect(await settle(() => Promise.resolve(3), value => value > 0, wait)).toBe(3);
    expect(wait).not.toHaveBeenCalled();
  });

  it('reads again until the reading holds', async () => {
    const readings = [0, 0, 5];
    const wait = vi.fn(() => Promise.resolve());
    expect(await settle(() => Promise.resolve(readings.shift() ?? -1), value => value > 0, wait, 50, 20)).toBe(5);
    expect(wait.mock.calls).toEqual([[20], [20]]);
  });

  it('gives up after its tries and returns the last reading', async () => {
    const wait = vi.fn(() => Promise.resolve());
    expect(await settle(() => Promise.resolve(0), value => value > 0, wait, 3)).toBe(0);
    expect(wait).toHaveBeenCalledTimes(3);
  });
});

describe('doctor', () => {
  const HEALTHY: Reads = { title: ['Synthominos'], 'count slots': [12], 'count button Reproducir': [1] };

  it.each([[[]], [['http://localhost:5173/', 'extra']]])('rejects %j with 2', async args => {
    const { sys, err, opened } = fakeSystem(fakeApp({}).app);
    expect(await doctor(args, sys)).toBe(2);
    expect(err).toEqual([DOCTOR_USAGE]);
    expect(opened).toEqual([]);
  });

  it('says 0 for the instrument, prints its checks, and closes the page', async () => {
    const { app, calls } = fakeApp(copy(HEALTHY));
    const { sys, out } = fakeSystem(app);
    expect(await doctor(['http://localhost:5173/'], sys)).toBe(0);
    expect(JSON.parse(String(out[0]))).toEqual({
      url: 'http://localhost:5173/',
      board: { width: 10, height: 6 },
      checks: { title: true, board: true, twelvePieces: true, transport: true, noConsoleError: true },
      consoleErrors: [],
    });
    expect(calls).toEqual(['close']);
  });

  it.each<[string, Reads, FakeOptions, string]>([
    ['another title', { title: ['Vite App'] }, {}, 'title'],
    ['a board with no column', {}, { board: { width: 0, height: 6 } }, 'board'],
    ['a board with no row', {}, { board: { width: 10, height: 0 } }, 'board'],
    ['eleven slots', { 'count slots': [11] }, {}, 'twelvePieces'],
    ['no play button', { 'count button Reproducir': [0] }, {}, 'transport'],
    ['a console error', {}, { errors: ['boom'] }, 'noConsoleError'],
  ])('says 1 for %s', async (_, reads, options, check) => {
    const { sys, out } = fakeSystem(fakeApp({ ...copy(HEALTHY), ...reads }, options).app);
    expect(await doctor(['http://localhost:5173/'], sys)).toBe(1);
    const { checks } = JSON.parse(String(out[0])) as { checks: Record<string, boolean> };
    expect(Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name)).toEqual([check]);
  });

  it('says 1 with the first line of the error when the page does not open', async () => {
    const { sys, err } = fakeSystem(new Error('page.goto: net::ERR_CONNECTION_REFUSED\nCall log'));
    expect(await doctor(['http://localhost:5409/'], sys)).toBe(1);
    expect(err).toEqual(['not drivable: page.goto: net::ERR_CONNECTION_REFUSED']);
  });
});
