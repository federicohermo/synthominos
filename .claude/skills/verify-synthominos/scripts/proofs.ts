import path from 'node:path';

/** The cell the playhead marks. `outer` is false when it draws nothing outside the cell: a click. */
export interface Mark { readonly cell: string; readonly outer: boolean }

/** What a proof does to one element: the part of a Playwright locator it uses. */
export interface Spot {
  click(options?: { modifiers?: 'Alt'[]; button?: 'right' }): Promise<void>;
  hover(): Promise<void>;
  getAttribute(name: string): Promise<string | null>;
  count(): Promise<number>;
}

/** The instrument as a player reaches it: by accessible name, with the mouse and the keys. */
export interface App {
  readonly board: { readonly width: number; readonly height: number };
  /** The console errors and the page errors, as they arrive. */
  readonly errors: readonly string[];
  cell(x: number, y: number): Spot;
  piece(letter: string): Spot;
  /** The twelve slots of the dock, together. */
  slots(): Spot;
  button(name: string): Spot;
  cellName(x: number, y: number): Promise<string>;
  announced(): Promise<string>;
  /** The opaque pixels of the spectrum. A bar is opaque and the idle state is dim, so only sound counts. */
  litPixels(): Promise<number>;
  /** `null` when the page shows no playhead. */
  playhead(): Promise<Mark | null>;
  key(key: string): Promise<void>;
  wheel(deltaY: number): Promise<void>;
  /** Takes the focus from the element that has it. */
  blur(): Promise<void>;
  wait(ms: number): Promise<void>;
  title(): Promise<string>;
  screenshot(file: string): Promise<void>;
  close(): Promise<void>;
}

export interface Server {
  readonly url: string;
  close(): Promise<void>;
}

export interface ProveSystem {
  /** Starts a dev server of its own. */
  launch(): Promise<Server>;
  open(url: string): Promise<App>;
  /** Creates the evidence folder of one run and returns its path. */
  folder(feature: string): string;
  write(file: string, text: string): void;
  out(line: string): void;
  err(line: string): void;
}

export interface Step {
  readonly action: string;
  readonly observed: unknown;
  readonly ok: boolean;
}

export interface Proof {
  step<T>(action: string, observed: T, expected: (value: T) => boolean): boolean;
}

const firstLine = (error: unknown) => String(error instanceof Error ? error.message : error).split('\n')[0];

function recorder(out: (line: string) => void) {
  const steps: Step[] = [];
  const add = (action: string, observed: unknown, ok: boolean) => {
    steps.push({ action, observed, ok });
    out(`${ok ? 'ok  ' : 'FAIL'} ${action} -> ${JSON.stringify(observed)}`);
    return ok;
  };
  return {
    steps,
    step: <T>(action: string, observed: T, expected: (value: T) => boolean) => add(action, observed, expected(observed)),
    threw: (error: unknown) => add('the proof stopped', firstLine(error), false),
  };
}

/** Reads until `expected` holds or `tries` more readings, `every` ms apart, are spent. Returns the last reading. */
export async function settle<T>(
  read: () => Promise<T>, expected: (value: T) => boolean, wait: (ms: number) => Promise<void>, tries = 50, every = 100,
): Promise<T> {
  let value = await read();
  for (let left = tries; left > 0 && !expected(value); left -= 1) {
    await wait(every);
    value = await read();
  }
  return value;
}

const sound = (app: App, expected: (lit: number) => boolean) =>
  settle(() => app.litPixels(), expected, ms => app.wait(ms));

/** Follows the playhead until it marked the piece `a`, the piece `b` and a free cell, or the time is spent. */
async function follow(app: App, a: string, b: string) {
  const seen: { a: Mark | null; b: Mark | null; free: Mark | null } = { a: null, b: null, free: null };
  const read = async () => {
    const mark = await app.playhead();
    if (mark?.cell.includes(`pieza ${a},`)) seen.a = mark;
    if (mark?.cell.includes(`pieza ${b},`)) seen.b = mark;
    if (mark?.cell.endsWith('libre')) seen.free = mark;
    return seen;
  };
  return settle(read, now => now.a !== null && now.b !== null && now.free !== null, ms => app.wait(ms), 400, 50);
}

type Drive = (app: App, proof: Proof) => Promise<void>;

export const PROOFS = {
  /** board-editing, playback, spectrum: a placed piece is on the board, sounds once, and sounds in the cycle. */
  async 'place-and-play'(app, proof) {
    proof.step('read an empty cell', await app.cellName(4, 4), name => name.endsWith('libre'));
    await app.piece('T').click();
    proof.step('choose the piece T', await app.piece('T').getAttribute('aria-pressed'), pressed => pressed === 'true');
    proof.step('read the idle spectrum', await app.litPixels(), lit => lit === 0);
    await app.cell(4, 4).click();
    proof.step('click the cell', await app.announced(), text => text === 'pieza T colocada en fila 5, columna 5');
    proof.step('read the cell again', await app.cellName(4, 4), name => /pieza T, nota \S+, paso \d de 4$/.test(name));
    proof.step('hear the courtesy arpeggio', await sound(app, lit => lit > 0), lit => lit > 0);
    proof.step('wait for silence', await sound(app, lit => lit === 0), lit => lit === 0);
    await app.button('Reproducir').click();
    proof.step('press play', await app.button('Pausa').count(), count => count === 1);
    proof.step('hear the cycle', await sound(app, lit => lit > 0), lit => lit > 0);
    await app.button('Pausa').click();
    proof.step('press pause', await app.button('Reproducir').count(), count => count === 1);
  },

  /** pieces, panels: the rotation and the reflection of the piece in hand show in the name of its slot. */
  async orientation(app, proof) {
    const name = () => app.piece('F').getAttribute('aria-label');
    proof.step('read the piece F', await name(), text => text === 'F, rotación 0°');
    await app.cell(4, 4).hover();
    await app.wheel(100);
    proof.step('turn the wheel over the board', await name(), text => text === 'F, rotación 90°');
    await app.key('Shift');
    proof.step('tap Shift', await name(), text => text === 'F, rotación 180°');
    await app.key('Control');
    proof.step('tap Control', await name(), text => text === 'F, rotación 180°, reflejada');
    await app.cell(4, 4).click({ button: 'right' });
    proof.step('right-click the board', await name(), text => text === 'F, rotación 180°');
    await app.button('Volver esta pieza a 0° sin reflejar').click();
    proof.step('press the 0° button', await name(), text => text === 'F, rotación 0°');
  },

  /** board-editing, accessibility: Alt+click mutes an own piece, a click removes it, reset empties the board. */
  async edit(app, proof) {
    await app.piece('L').click();
    await app.cell(6, 3).click();
    proof.step('place the piece L', await app.announced(), text => text.startsWith('pieza L colocada'));
    await app.cell(6, 3).click({ modifiers: ['Alt'] });
    proof.step('Alt+click the piece', await app.cellName(6, 3), name => name.includes('pieza L muteada'));
    await app.cell(6, 3).click({ modifiers: ['Alt'] });
    proof.step('Alt+click it again', await app.cellName(6, 3), name => name.includes('pieza L,'));
    await app.cell(6, 3).click();
    proof.step('click the piece', await app.announced(), text => text.startsWith('pieza L quitada'));
    proof.step('read the cell', await app.cellName(6, 3), name => name.endsWith('libre'));
    await app.cell(6, 3).click();
    proof.step('place it again', await app.cellName(6, 3), name => name.includes('pieza L,'));
    await app.button('Vaciar el tablero y frenar el transporte').click();
    proof.step('press reset', await app.cellName(6, 3), name => name.endsWith('libre'));
  },

  /** board-editing: a letter key chooses a piece, and the space bar moves the transport. */
  async keyboard(app, proof) {
    await app.key('w');
    proof.step('press the key W', await app.piece('W').getAttribute('aria-pressed'), pressed => pressed === 'true');
    proof.step('read the piece F', await app.piece('F').getAttribute('aria-pressed'), pressed => pressed === 'false');
    await app.cell(3, 3).click();
    await app.blur();
    await app.key('Space');
    proof.step('press the space bar', await app.button('Pausa').count(), count => count === 1);
    await app.key('Space');
    proof.step('press it again', await app.button('Reproducir').count(), count => count === 1);
  },

  /** circuit, playback: the playhead visits each piece and the leg between them, and marks a leg cell as a click. */
  async circuit(app, proof) {
    const far = app.board.width - 4;
    await app.piece('T').click();
    await app.cell(2, 3).click();
    await app.piece('L').click();
    await app.cell(far, 3).click();
    proof.step('place T and L apart', [await app.cellName(2, 3), await app.cellName(far, 3)],
      ([t, l]) => t.includes('pieza T,') && l.includes('pieza L,'));
    await app.button('Recorrido en el vacío').click();
    proof.step('press the click switch', await app.button('Recorrido en el vacío').getAttribute('aria-pressed'), pressed => pressed === 'true');
    proof.step('read the playhead before play', await app.playhead(), mark => mark === null);
    await app.button('Reproducir').click();
    const seen = await follow(app, 'T', 'L');
    proof.step('see the playhead on the piece T', seen.a, mark => mark?.outer === true);
    proof.step('see the playhead on the piece L', seen.b, mark => mark?.outer === true);
    proof.step('see the playhead on a free cell of a leg', seen.free, mark => mark?.outer === false);
    await app.button('Pausa').click();
    proof.step('press pause', await settle(() => app.playhead(), mark => mark === null, ms => app.wait(ms)), mark => mark === null);
  },
} satisfies Record<string, Drive>;

export type Feature = keyof typeof PROOFS;

const isFeature = (name: string): name is Feature => Object.hasOwn(PROOFS, name);

export const PROVE_USAGE = `usage: node prove.ts <${Object.keys(PROOFS).join(' | ')}> [url]`;
export const DOCTOR_USAGE = 'usage: node doctor.ts <url>';

/** Drives one feature as a player does and records the proof. 0 passed, 1 failed, 2 usage. */
export async function prove(args: readonly string[], sys: ProveSystem): Promise<0 | 1 | 2> {
  const [feature, given, ...rest] = args;
  if (feature === undefined || !isFeature(feature) || rest.length > 0) {
    sys.err(PROVE_USAGE);
    return 2;
  }
  let server: Server | null = null;
  let url = given;
  if (url === undefined) {
    server = await sys.launch();
    url = server.url;
  }
  const proof = recorder(line => { sys.out(line); });
  let app: App | null = null;
  try {
    app = await sys.open(url);
    await PROOFS[feature](app, proof);
  } catch (error) {
    proof.threw(error);
  }
  const dir = sys.folder(feature);
  try {
    if (app !== null) await app.screenshot(path.join(dir, 'final.png'));
  } catch (error) {
    proof.threw(error);
  } finally {
    try {
      await app?.close();
    } finally {
      await server?.close();
    }
  }
  const consoleErrors = app?.errors ?? [];
  const passed = proof.steps.every(step => step.ok) && consoleErrors.length === 0;
  sys.write(path.join(dir, 'proof.json'), JSON.stringify({ feature, url, passed, steps: proof.steps, consoleErrors }, null, 2));
  sys.out(`${passed ? 'PASSED' : 'FAILED'}: ${dir}`);
  return passed ? 0 : 1;
}

/** Read-only: is the instance at the URL this app, and can it be driven? 0 yes, 1 no, 2 usage. */
export async function doctor(args: readonly string[], sys: ProveSystem): Promise<0 | 1 | 2> {
  const [url, ...rest] = args;
  if (url === undefined || rest.length > 0) {
    sys.err(DOCTOR_USAGE);
    return 2;
  }
  let app: App | null = null;
  try {
    app = await sys.open(url);
    const checks = {
      title: await app.title() === 'Synthominos',
      board: app.board.width > 0 && app.board.height > 0,
      twelvePieces: await app.slots().count() === 12,
      transport: await app.button('Reproducir').count() === 1,
      noConsoleError: app.errors.length === 0,
    };
    sys.out(JSON.stringify({ url, board: app.board, checks, consoleErrors: app.errors }, null, 2));
    return Object.values(checks).every(Boolean) ? 0 : 1;
  } catch (error) {
    sys.err(`not drivable: ${firstLine(error)}`);
    return 1;
  } finally {
    await app?.close();
  }
}
