# The click is a bell with one fixed pitch, not noise

**Recorded 2026-10-04.** The decision is of 2026-08-19, in
[#77](https://github.com/federicohermo/pentomino-games/issues/77).

A click is a leg of the circuit that enters an empty cell. It was 20 ms of white noise, for a
reason that still holds in part: an oscillator always has a pitch, and a pitch that moves makes the
legs draw a melodic line that competes with the pieces.

Measured on an offline render, the noise was the wrong sound for the event:

- Its spectral centroid was at 11,260 Hz, almost two octaves above the highest note that a piece
  can play (`D#6`, 1,244.5 Hz). It sounded as a hiss.
- The click is not a marginal event. On 200 random boards for each count of pieces, the clicks are
  44 % of the events of a cycle with 3 pieces, 35 % with 5 and 20 % with 8.

**Decision: the click is a sine bell at one fixed pitch, `C7` (MIDI 96, 2,093 Hz), 50 ms long, and
the click switch opens off.** A melodic line needs different pitches, and this pitch never changes:
a metronome has a pitch and plays no melody. The rules are `BR-PLY-013` and `BR-PLY-014` of
[the playback contract](../../../specs/playback/playback.md). The comments of
`src/playback/voice.ts` give the reason for each value.

The offline render of the candidates, all from the same start peak:

| | Noise, 20 ms | Bell, MIDI 96, 50 ms | Bell, MIDI 96, 80 ms | Bell, MIDI 93, 50 ms |
|---|---|---|---|---|
| Peak | 0.245 | 0.245 | 0.246 | 0.244 |
| RMS | 0.0167 | 0.0141 | 0.0179 | 0.0141 |
| Falls 40 dB in | 19.6 ms | 29.5 ms | 46.9 ms | 29.4 ms |
| Spectral centroid | 11,260 Hz | 2,645 Hz | 2,625 Hz | 2,290 Hz |

The centroid of the bell is above its pitch because the window is rectangular and includes the
attack. With a Hann window it is 2,093 Hz.

What was weighed:

- **A pitch outside the scale.** It does not exist. The instrument uses the 12 pitch classes: 12
  tonics by four pentatonic formulas. So the pitch is outside the register, nine semitones above
  `D#6`, where no piece can reach it or mask it.
- **80 ms.** Refused: at 160 bpm the bell fills 85 % of the interval, and two clicks in a row
  overlap.
- **MIDI 93 (`A6`).** Refused: six semitones above the highest note, against nine.

The cost:

- **The click has a pitch.** One fixed pitch about 12 times in a cycle can annoy more than a hiss:
  a hiss is ignored. Nobody judged the bell by ear at the three tempos. `OQ-PLY-003` keeps it
  open.
- **A new user does not hear the legs.** With the click switch off, a long leg over empty cells is
  silence: up to 44 % of the events of a small board.
- **The loudness is not settled.** At the same peak the bell has 15 % less RMS than the noise, but
  2 kHz is where the ear is most sensitive. No measurement adds the two effects, so
  `CLICK_VELOCITY` stays at 0.25 until someone listens.
