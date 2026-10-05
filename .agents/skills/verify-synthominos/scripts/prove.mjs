// Drives one feature as a player does and records the proof. Exit 0 passed, 1 failed, 2 usage.
// usage: node .agents/skills/verify-synthominos/scripts/prove.mjs <feature> [url]
// With no url it starts a dev server of its own and stops it at the end.
import { evidence, launch, open } from './app.mjs';

const PROOFS = {
  /** board-editing, playback, spectrum: a placed piece is on the board and sounds. */
  async 'place-and-play'(app, proof) {
    proof.step('read an empty cell', await app.cellName(4, 4), name => name.endsWith('libre'));
    await app.piece('T').click();
    proof.step('choose the piece T', await app.piece('T').getAttribute('aria-pressed'), pressed => pressed === 'true');
    await app.cell(4, 4).click();
    proof.step('click the cell', await app.announced(), text => /^pieza T colocada en fila 5, columna 5$/.test(text));
    proof.step('read the cell again', await app.cellName(4, 4), name => /pieza T, nota \S+, paso \d de 4$/.test(name));
    proof.step('read the spectrum before play', await app.litPixels(), lit => lit === 0);
    await app.button('Reproducir').click();
    await app.page.waitForTimeout(1500);
    proof.step('press play', await app.button('Pausa').count(), count => count === 1);
    proof.step('read the spectrum while it plays', await app.litPixels(), lit => lit > 0);
    await app.button('Pausa').click();
    proof.step('press pause', await app.button('Reproducir').count(), count => count === 1);
  },

  /** pieces, panels: the rotation and the reflection of the chosen piece show in its name. */
  async orientation(app, proof) {
    const name = () => app.piece('F').getAttribute('aria-label');
    proof.step('read the piece F', await name(), text => text === 'F, rotación 0°');
    await app.cell(4, 4).hover();
    await app.page.mouse.wheel(0, 100);
    proof.step('turn the wheel over the board', await name(), text => text === 'F, rotación 90°');
    await app.page.keyboard.press('Shift');
    proof.step('tap Shift', await name(), text => text === 'F, rotación 180°');
    await app.page.keyboard.press('Control');
    proof.step('tap Control', await name(), text => /reflejad/.test(text));
    await app.button('Volver esta pieza a 0° sin reflejar').click();
    proof.step('press the 0° button', await name(), text => text === 'F, rotación 0°');
  },

  /** board-editing, accessibility: Alt+click mutes a piece, a click removes it, reset empties the board. */
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
    await app.button('Vaciar el tablero y frenar el transporte').click();
    proof.step('place it again and reset', await app.cellName(6, 3), name => name.endsWith('libre'));
  },

  /** board-editing: a letter key chooses a piece, and the space bar moves the transport. */
  async keyboard(app, proof) {
    await app.page.keyboard.press('w');
    proof.step('press the key W', await app.piece('W').getAttribute('aria-pressed'), pressed => pressed === 'true');
    proof.step('read the piece F', await app.piece('F').getAttribute('aria-pressed'), pressed => pressed === 'false');
    await app.cell(3, 3).click();
    await app.page.locator('body').focus();
    await app.page.keyboard.press('Space');
    proof.step('press the space bar', await app.button('Pausa').count(), count => count === 1);
    await app.page.keyboard.press('Space');
    proof.step('press it again', await app.button('Reproducir').count(), count => count === 1);
  },
};

const [feature, givenUrl] = process.argv.slice(2);
if (!Object.hasOwn(PROOFS, feature ?? '')) {
  console.error(`usage: prove.mjs <${Object.keys(PROOFS).join(' | ')}> [url]`);
  process.exit(2);
}

const server = givenUrl === undefined ? await launch() : null;
let app;
try {
  app = await open(givenUrl ?? server.url);
  const proof = evidence(feature);
  await PROOFS[feature](app, proof);
  process.exitCode = await proof.save(app) ? 0 : 1;
} finally {
  await app?.close();
  await server?.close();
}
