import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';

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

/** Playwright starts at 414 x 896: a smaller board gives the gate fewer controls to visit. */
const VIEWPORT: [number, number] = [1024, 768];

beforeEach(async () => {
  await page.viewport(...VIEWPORT);
});

const ROLES = [
  'button', 'checkbox', 'switch', 'radio', 'link', 'tab', 'menuitem',
  'slider', 'spinbutton', 'textbox', 'combobox', 'listbox', 'option',
  'grid', 'gridcell', 'group',
];
const CONTROLES = ['button', 'input', 'select', 'textarea', 'a[href]', ...ROLES.map((r) => `[role="${r}"]`)].join(', ');

const PALABRAS_DE_ESTADO = ['on', 'off', 'sí', 'si', 'no', 'activado', 'desactivado', 'encendido', 'apagado'];

/** A `<button>▶</button>` has an accessible name, "▶": a name needs one letter or one digit. */
const SOLO_SIMBOLOS = /^[^\p{L}\p{N}]+$/u;

const señas = (el: Element) => `<${el.tagName.toLowerCase()}${el.getAttribute('role') ? ` role="${el.getAttribute('role')}"` : ''}> "${el.textContent ?? ''}"`;

describe('The accessible tree of the whole app', () => {
  it('AC-ACC-002 — every control has an accessible name, and the gate visits them all', async () => {
    const { container } = await render(<App />);
    const controles = [...container.querySelectorAll(CONTROLES)];

    // An empty visit passes green: `App.browser.test.tsx` counts 20 buttons.
    expect(controles.length).toBeGreaterThan(20);

    for (const control of controles) {
      // The computed name: BR-ACC-004 prefers `aria-labelledby`, so a read of `aria-label` is wrong.
      expect(control, señas(control)).toHaveAccessibleName();
      expect(control, `${señas(control)} is named with a glyph`).not.toHaveAccessibleName(SOLO_SIMBOLOS);
    }
  });

  it('AC-ACC-006 — no toggle is named by the state it already announces', async () => {
    const { container } = await render(<App />);
    const toggles = [...container.querySelectorAll('[aria-pressed]')];

    // A toggle is found by `aria-pressed`: this gate cannot fail on a toggle with no `aria-pressed`.
    expect(toggles.length).toBeGreaterThan(0);

    for (const toggle of toggles) {
      for (const palabra of PALABRAS_DE_ESTADO) {
        expect(toggle, `${señas(toggle)} is named as its state`)
          .not.toHaveAccessibleName(new RegExp(`^${palabra}$`, 'i'));
      }
    }
  });
});
