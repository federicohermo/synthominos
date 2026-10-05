import { describe, it, expect } from 'vitest';
import { RuleTester } from 'eslint';
import rule, { provenanceIn } from '../comment-anchor.mjs';

/**
 * The `RuleTester` of ESLint 9 registers nothing by itself: it calls the global `describe` and
 * `it`, and this repo does not run Vitest with `globals: true`. Without these two lines the
 * run does not fail red. It fails with `No test suite found in file`.
 */
RuleTester.describe = describe;
RuleTester.it = it;

/**
 * The rule resolves against `context.cwd`, which in the `RuleTester` is the `cwd` of the
 * process: the repo root. So the cases below are checked **against the real tree**, the only
 * thing that can prove that a live citation resolves.
 *
 * The index is built once in a process and has no reset hook, on purpose: a testing backdoor
 * in a gate is the first thing someone uses to skip it.
 */
const tester = new RuleTester();

tester.run('comment-anchor', rule, {
  valid: [
    { name: 'a citation that resolves', code: '// the geometry lives in src/pieces/transform.ts' },
    {
      // The index matches by BASENAME: the path is wrong and it still passes. What the rule
      // catches is the deleted or renamed file, not the format of the path.
      name: 'the path can be wrong when the file exists',
      code: '// see constants/pieces.ts',
    },
    { name: 'lib.*.d.ts belongs to TypeScript', code: '// the type comes from lib.dom.d.ts, not from this repo' },
    { name: 'node:* is a builtin', code: '// read with node:fs so that it depends on nothing' },

    // Words of position and of use are not history.
    { name: 'before is a word of position', code: '// the piece is normalized before the rotation' },
    { name: 'is used to is not history', code: '// the index is used to resolve a citation' },
    { name: 'a participle is not history', code: '// the key used to sign the bundle' },
    { name: 'is used to be', code: '// this flag is used to be sure the loop ends' },
    { name: 'the past tense that describes is not a chronicle', code: '// it was a list of five cells and it still is' },

    // Numbers that are not the name of a spec.
    { name: 'a criterion with its capability', code: '// AC-CIR-006 holds here, with BR-CIR-004' },
    { name: 'a decimal', code: '// the gain goes from 0.050 to 1,005 in 0.012 s' },
    { name: 'a measure', code: '// the click lasts 020 ms' },
    { name: 'a hex color and a part of a name', code: '// #012 is the ink, and v010 is the tag of track_007' },
    { name: 'a number of three digits that does not start with zero', code: '// 120 permutations, 390 cells' },
    { name: 'the word spec with no number', code: '// the spec of the circuit says five intervals' },

    // A comment that speaks to a tool is nobody's prose.
    { name: 'directives are not read', code: '// ts-expect-error lives in missing-xyz.ts since spec 031' },

    // Two comments with a blank line between them are TWO blocks.
    { name: 'two loose blocks, both clean', code: '// the tonic comes from the piece\n\n// the order comes from the position' },
    { name: 'a /* */ block does not pull the line comment after it', code: '/* the scale comes from the rotation */\n// and the retrograde from the reflection' },
  ],

  invalid: [
    {
      // A run of `//` is ONE comment: the citation is split from the text that introduces
      // it, it is still found, and the finding is one.
      name: 'a dead citation in a run of two lines',
      code: '// the helper that solves this lives in\n// src/domain/missing-xyz.ts',
      errors: [{ messageId: 'dead', data: { citation: 'src/domain/missing-xyz.ts' } }],
    },
    {
      // Two dead ones in one block are TWO findings: fixing one does not fix the other.
      name: 'two dead citations in one block are two findings',
      code: '/* it uses src/audio/fake-xyz.ts and src/audio/other-xyz.ts */',
      errors: [
        { messageId: 'dead', data: { citation: 'src/audio/fake-xyz.ts' } },
        { messageId: 'dead', data: { citation: 'src/audio/other-xyz.ts' } },
      ],
    },
    {
      // The four files of a numbered spec are gone with the old regime, and cite nothing.
      name: 'a file of a numbered spec does not resolve',
      code: '// the number comes from research.md, section 3',
      errors: [{ messageId: 'dead', data: { citation: 'research.md' } }],
    },

    // One red for each pattern, with its `messageId` and its form. A test that only counts
    // errors passes with the rule reporting the wrong message.
    {
      name: 'history: an adverb',
      code: '// previously the board was walked in a zigzag',
      errors: [{ messageId: 'history', data: { form: 'previously' } }],
    },
    {
      name: 'history: formerly, and until recently',
      code: '// formerly a Map\n\n// until  recently this was a Set',
      errors: [{ messageId: 'history', data: { form: 'formerly' } }, { messageId: 'history', data: { form: 'until  recently' } }],
    },
    {
      name: 'history: no longer',
      code: '// the field is no longer written on each frame',
      errors: [{ messageId: 'history', data: { form: 'no longer' } }],
    },
    {
      name: 'history: anymore',
      code: '// the seam does not move anymore',
      errors: [{ messageId: 'history', data: { form: 'anymore' } }],
    },
    {
      name: 'history: used to be',
      code: '// the tonic used to be the center cell',
      errors: [{ messageId: 'history', data: { form: 'used to be' } }],
    },
    {
      // One block is one history finding, whatever the number of forms in it.
      name: 'two historical forms in one block are one finding',
      code: '// previously a Map, and no longer one',
      errors: [{ messageId: 'history', data: { form: 'previously' } }],
    },

    {
      name: 'provenance: spec and its number',
      code: '// the seam leaves the board since spec 031',
      errors: [{ messageId: 'provenance', data: { form: 'spec 031' } }],
    },
    {
      name: 'provenance: the form of a commit scope, and the plural',
      code: '// spec(052) moved the dock\n\n// specs 007 and 012',
      errors: [{ messageId: 'provenance', data: { form: 'spec(052' } }, { messageId: 'provenance', data: { form: 'specs 007' } }],
    },
    {
      name: 'provenance: a bare number used as a name',
      code: '// the 011 made the crossing cost more',
      errors: [{ messageId: 'provenance', data: { form: '011' } }],
    },
    {
      name: 'provenance: a criterion without its capability',
      code: '// AC6 asks for the same budget on the large board',
      errors: [{ messageId: 'provenance', data: { form: 'AC6' } }],
    },
    {
      // A block can be rotten in the three ways, and they are three findings with three fixes.
      name: 'a dead citation, a chronicle and a numbered spec in one block',
      code: '// src/domain/missing-xyz.ts is no longer used since the 031',
      errors: [{ messageId: 'dead' }, { messageId: 'history' }, { messageId: 'provenance' }],
    },
  ],
});

describe('provenanceIn: the same check, for a text that is not a comment', () => {
  it('returns the first form it finds, or null', () => {
    expect(provenanceIn('The seam is a rule of spec 031, and of the 009.')).toBe('spec 031');
    expect(provenanceIn('The budget of the 009 holds.')).toBe('009');
    expect(provenanceIn('AC10 measures twelve pieces.')).toBe('AC10');
    expect(provenanceIn('AC-CIR-023 measures twelve pieces in 0.005 s.')).toBeNull();
  });
});
