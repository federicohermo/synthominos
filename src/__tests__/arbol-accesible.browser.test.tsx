import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';

/**
 * The gate of the accessible tree: it checks the naming rules of the accessibility
 * contract on the whole app. `.agents/rules/ui.md` states the same rules.
 *
 * What each assertion covers, against its rule:
 *
 * - Every control has a name, and a glyph alone is not a name (BR-ACC-002, BR-ACC-003):
 *   the two assertions of the first case. The two are necessary: see `SOLO_SIMBOLOS`.
 * - The visible label is the name, taken with `aria-labelledby` and not written a second
 *   time in an `aria-label` (BR-ACC-004): the same first assertion. That is why it asks
 *   for the COMPUTED name and not for the attribute: to require `aria-label` forbids the
 *   preferred form.
 * - A toggle has `aria-pressed`, and its name is what it toggles, not the value
 *   (BR-ACC-005): the second case, **the second half only**. The first half is circular
 *   and cannot be verified here; see "What it does NOT cover".
 * - `type="button"` on every `<button>` (BR-ACC-010): **it does not belong to this
 *   file**. Its owner is the `describe` "App: what reaches the accessible tree" of
 *   `App.browser.test.tsx`, which visits the whole app as this file does.
 *
 * ## Why its own file and not one more `describe` in `App.browser.test.tsx`
 *
 * That file already has a case that visits the whole app, "no button of the app can
 * submit a form", so the form exists and the precedent is exact. But it is a file of
 * **cases**: it verifies the gestures, the state and the derived values of the shell,
 * with a mock of `OrientationPanel` that counts runs and an engine that remembers if it
 * started. A gate that visits the tree shares none of that, and inside that file it is
 * tied to that scenery.
 *
 * There is also a measurable reason. The three falsifications of this file **also turn
 * `App.browser.test.tsx` red**: to remove the `aria-label` of a button, to add an empty
 * one, and to rename a toggle to the value its `aria-pressed` already says. A
 * falsification that turns two files red does not prove which of the two verified.
 * Apart, `pnpm exec vitest run src/__tests__/arbol-accesible.browser.test.tsx` runs and
 * the answer comes from one file.
 *
 * ## The difference between a test and a gate
 *
 * The four files that query roles today (`OrientationPanel`, `PiecePalette`,
 * `TransportPanel` and `App`) verify **the controls that each one knows**. A new control
 * with no label breaks no name assertion. This file visits **all that it finds**, the
 * native controls and the `role`s of the closed list `ROLES`, so it fails on a control
 * that no test names.
 *
 * ## What it does NOT cover, which is the half to read before you trust it
 *
 * - **That the name is GOOD.** A control with an accessible name can have a useless
 *   one: "Botón 3" passes. A machine can decide only that the name exists and, for a
 *   toggle, that it is not the value its own `aria-pressed` already announces.
 * - **That a toggle HAS `aria-pressed`.** It is circular, so it is not here: the only
 *   automatic way to find the toggles is **by the attribute the rule requires**. A
 *   toggle without the attribute is not in the list, and the gate passes it. That half
 *   stays with human review, and it is declared here so that nobody reads this file as
 *   if it covered it.
 * - **A `role` that is not in `ROLES`.** The list is closed on purpose (see its
 *   docblock), so a new role enters the tree and this gate does not look at it until
 *   someone adds it. The NATIVE controls do all enter, which is the frequent case.
 * - **The tab order**, which is the next section of `ui.md` and another mechanism.
 * - **The contrast**, which `DESIGN.md` treats as a separate test (issue #50).
 * - **The behavior with a real screen reader.** This looks at the tree that the browser
 *   computes, which is one layer before.
 */

/**
 * The engine, mocked as in `App.browser.test.tsx`: a count of labels starts no audio.
 *
 * The rest (the domain, the components and the DOM) is real, and the tree comes from it.
 */
const motor = vi.hoisted(() => ({
  setSequence: vi.fn(),
  setBpm: vi.fn(),
  setClicksAudible: vi.fn(),
  startClock: vi.fn(),
  stopClock: vi.fn(),
  clockRunning: vi.fn(() => false),
  playNow: vi.fn(),
  playNotes: vi.fn(),
  playheadOffset: () => null,
  readSpectrum: () => null,
  cycleGeneration: () => 0,
}));
vi.mock('../playback/engine.ts', () => motor);

const App = (await import('../App.tsx')).default;

/**
 * A desktop viewport, the same as in `App.browser.test.tsx`.
 *
 * Without it, Playwright starts at 414 x 896 and the board has six columns. The verdict
 * does not change, but the number of controls visited does: a gate that measures less
 * with a smaller window can be weakened with no edit.
 */
const VIEWPORT: [number, number] = [1024, 768];

beforeEach(async () => {
  await page.viewport(...VIEWPORT);
});

/**
 * What counts as a control, and why it is a list and not a heuristic.
 *
 * The two halves have different reasons. The **native** ones enter by their tag: a
 * `<button>` is a button with no declaration. The **roles** enter by the closed list
 * below: the roles this app uses today plus the obvious neighbours of each. Nothing
 * looks at a new `role` that is not here. That is better than a heuristic that decides
 * alone about roles for which the repo has no naming decision yet.
 *
 * `grid`, `gridcell` and `group` are composites and not controls, and they enter all the
 * same: the three have a name in this app (the board, each cell and the pair of regime
 * buttons). A composite with no name is the case that the screen does not show, because
 * the screen shows the content.
 */
const ROLES = [
  'button', 'checkbox', 'switch', 'radio', 'link', 'tab', 'menuitem',
  'slider', 'spinbutton', 'textbox', 'combobox', 'listbox', 'option',
  'grid', 'gridcell', 'group',
];
const CONTROLES = ['button', 'input', 'select', 'textarea', 'a[href]', ...ROLES.map((r) => `[role="${r}"]`)].join(', ');

/**
 * The words that are a VALUE and not a name.
 *
 * It is a closed list, written here, because the two halves of the question have
 * different answers. The tree says **which** control is a toggle: the one with
 * `aria-pressed`. But no machine can decide **which word is a state**. "Activado" is a
 * value and "Activar el metrónomo" is a name, and the difference is semantic.
 *
 * They are in lower case, and they are compared with an anchored, case-insensitive
 * regex. So it catches "Activado" and does not catch "Recorrido activado en el vacío",
 * which is a bad name but is not what this rule looks for.
 */
const PALABRAS_DE_ESTADO = ['on', 'off', 'sí', 'si', 'no', 'activado', 'desactivado', 'encendido', 'apagado'];

/**
 * A name made ONLY of symbols, and why this second assertion is necessary.
 *
 * The rule says that every icon-only control has a name and that **the glyph is not a
 * name**. That is the part that `toHaveAccessibleName()` alone does NOT verify: the
 * algorithm of the browser takes the content of the button, so a `<button>▶</button>`
 * **has** an accessible name, and it is "▶". Measured: with the `aria-label` of the play
 * button of `TransportPanel.tsx` removed, the gate written with only the assertion of
 * existence stayed green. So the rule this file says it closes stayed open.
 *
 * The line that a machine can decide is this: a name must have **at least one letter or
 * one digit**. A glyph, an emoji or an arrow is neither in any language, and `\p{L}` /
 * `\p{N}` is the definition of Unicode, not a list written by hand. It does not say that
 * the name is good (see "What it does NOT cover"). It says that there is something to
 * read aloud.
 */
const SOLO_SIMBOLOS = /^[^\p{L}\p{N}]+$/u;

/** How a control is named in a failure message, when it has no name. */
const señas = (el: Element) => `<${el.tagName.toLowerCase()}${el.getAttribute('role') ? ` role="${el.getAttribute('role')}"` : ''}> "${el.textContent ?? ''}"`;

describe('The accessible tree of the whole app', () => {
  it('AC-ACC-002 — every control has an accessible name, and the gate visits them all', async () => {
    const { container } = await render(<App />);
    const controles = [...container.querySelectorAll(CONTROLES)];

    // An empty visit passes green with nothing verified, a failure mode this repo has
    // met two times. The floor is the 20 buttons that `App.browser.test.tsx` counts. So a
    // lower number says that the selector does not find the app, not that the app has
    // fewer controls.
    expect(controles.length).toBeGreaterThan(20);

    for (const control of controles) {
      // `toHaveAccessibleName` and not a read of `aria-label`: the browser computes the
      // name from text, `aria-label`, `aria-labelledby` and content. The rule PREFERS
      // `aria-labelledby` on the visible text, so to require the attribute forbids the
      // preferred form, and the tempo control of `TransportPanel.tsx` uses it.
      expect(control, señas(control)).toHaveAccessibleName();
      // And that name must not be the glyph. See `SOLO_SIMBOLOS`: without this line the
      // rule about icon-only controls is written and not verified.
      expect(control, `${señas(control)} is named with a glyph`).not.toHaveAccessibleName(SOLO_SIMBOLOS);
    }
  });

  it('AC-ACC-006 — no toggle is named by the state it already announces', async () => {
    const { container } = await render(<App />);
    const toggles = [...container.querySelectorAll('[aria-pressed]')];

    // The same reason as above: if the selector finds none, the assertion below does
    // not run and nothing reports it. Today they are the twelve of `OrientationPanel`,
    // the two of the regime and the click switch.
    expect(toggles.length).toBeGreaterThan(0);

    for (const toggle of toggles) {
      for (const palabra of PALABRAS_DE_ESTADO) {
        expect(toggle, `${señas(toggle)} is named as its state`)
          .not.toHaveAccessibleName(new RegExp(`^${palabra}$`, 'i'));
      }
    }
  });
});
