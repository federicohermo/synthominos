import '../styles/index.css';

/**
 * The one thing the browser project needs before each file: the style sheet.
 *
 * It is the most expensive trap of a test in a real browser. Without this import the
 * Tailwind classes are in the `className`, so a test that reads the attribute passes.
 * But they do not exist as rules, so `getComputedStyle` returns the initial values:
 * `z-10` reads `auto`, an `h-24` reads `auto`, and `getBoundingClientRect()` of a canvas
 * that CSS stretches returns 0. A layout test passes or fails for the wrong reason, and
 * does not say so.
 *
 * It is in the setup and not in each test for the same reason: a test that forgets the
 * import does not fail. It gives a false result.
 */
