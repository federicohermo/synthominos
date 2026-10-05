
/**
 * Synthesis: one voice for each note, an oscillator and an ADSR envelope.
 *
 * It gets the `BaseAudioContext` as a parameter and **cannot** touch the singleton: the
 * singleton lives in `engine.ts` and this module does not import it. That lets the
 * tests render the synthesis with an `OfflineAudioContext`, and the import graph holds
 * it.
 */

/**
 * The default timbre. A change here reaches the TWO paths to sound, the arpeggio of a
 * placement and the cycle, because the two end in `scheduleVoice`.
 *
 * It does NOT carry the release, and it cannot: the release is counted in intervals
 * (`RELEASE_INTERVALS`) and travels as a parameter, for the same reason that `dur` has
 * no default. An absolute value here, the 0.12 s that would be natural, would leave it
 * outside the musical units: that is 0.48 intervals at 60 bpm but 1.28 at 160, so the
 * overlap of the arpeggio would grow with the tempo.
 *
 * What stays here does NOT depend on the tempo: attack and decay are the transient of
 * the instrument, and its perceptual identity is the absolute shortness, like that of
 * `CLICK_SECONDS`. Sustain is a level, not a time.
 */
export const DEFAULT_VOICE: Required<VoiceOpts> = {
  attack: 0.005,
  decay: 0.06,
  sustain: 0.5,
  type: 'triangle',
};

/**
 * How long a note lasts, in INTERVALS. Without the release, which is added after.
 *
 * In intervals and not in seconds because a fixed duration does not survive a tempo
 * change: the note keeps its relation to the beat at any bpm, and a value in seconds
 * stretches, or runs into the next note, with the tempo. The user of this value
 * multiplies it by `intervalDuration(bpm)`.
 *
 * ONE and not two. With two, the note lasts exactly twice the time to the next one, so
 * the arpeggio always sounds with 2.88 voices on top of each other: measured at 110
 * bpm, as `(NOTE_INTERVALS * interval + release) / interval`. With one, the note ends
 * just when the next one starts and only the release tail overlaps: 1.88 voices,
 * against 3.13 with a fixed duration in seconds. The arpeggio is heard as five notes
 * and not as a spread chord.
 *
 * At 100 bpm it gives 1 * 0.15 = 0.150 s, against 0.350 s for that fixed duration.
 *
 * The release is in intervals too (`RELEASE_INTERVALS`), so the 1.88 voices are the
 * same at any tempo. With a release of 0.12 s absolute, the overlap grows with the bpm.
 */
export const NOTE_INTERVALS = 1;

/**
 * How long the fall of the note lasts after `dur`, in INTERVALS.
 *
 * It is the pair of `NOTE_INTERVALS` and exists for the same reason: in seconds it does
 * not survive a tempo change. With a fixed release of 0.12 s the arpeggio gets thicker
 * as the tempo rises. The voices that sound together are
 * `(NOTE_INTERVALS * interval + release) / interval`, that is `1 + release/interval`:
 * with the release in seconds that ratio grows with the bpm, and at 160 bpm it gives
 * 2.28 against the 1.88 of 110.
 *
 * **0.88 and not a round value**: it is exactly `0.12 / intervalDuration(110)`, the
 * release of 0.12 s at the default tempo (an interval of `15 / 110 = 0.13636 s`). At
 * 110 bpm the envelope is IDENTICAL to that of a release of 0.12 s, and at any other
 * tempo the overlap stays at the measured 1.88 voices. A rounder number would change
 * how the instrument sounds at the tempo where it was tuned.
 *
 * The user of this value multiplies it by `intervalDuration(bpm)` and gives it to
 * `scheduleVoice`, which knows nothing of the tempo.
 */
export const RELEASE_INTERVALS = 0.88;

/**
 * How long a CROSSING lasts, in INTERVALS. Its release is the same `RELEASE_INTERVALS`
 * as that of a note: the body changes, not the timbre.
 *
 * In intervals and not in seconds like `CLICK_SECONDS`. What holds the exception of the
 * click is the ABSOLUTE shortness alone: the click DOES have a pitch, a fixed bell at
 * `CLICK_MIDI`, so the usual reason ("it has no pitch") does not apply and cannot be
 * cited. What separates the two still holds: the click is a mark and its pitch never
 * changes, and the pitch of the crossing is the note of the crossed cell, which is
 * MODEL. So its precedent is `NOTE_INTERVALS`, and it must keep its relation to the
 * beat at any tempo. `engine.ts` multiplies it by `intervalDuration(bpm)`, because the
 * bpm lives there.
 *
 * **Less than one**, because a crossing must not compete for the turn with the piece:
 * with 0.75 the body goes off at three quarters of the way to the next cell, and what
 * sounds in that last quarter is only the release tail. Counted in voices that sound
 * together, `(dur + release) / interval`, the same count as `NOTE_INTERVALS`, a
 * crossing weighs 1.63 against the 1.88 of a note.
 *
 * **0.75 and not less, and that is a MEASURED floor, not a preference.** `scheduleVoice`
 * schedules `setValueAtTime(vel * sustain, at + dur)` after the decay ramp, which ends
 * at `attack + decay = 0.065 s` ABSOLUTE (the two live in `DEFAULT_VOICE` because they
 * are the transient of the instrument and do not depend on the tempo). If `dur` falls
 * before that instant, the events are still processed in time order and the envelope
 * turns over: it does not decay, it stays at the peak and then drops AT ONCE to the
 * sustain. Rendered offline at 160 bpm, the `TEMPO_MAX` of the instrument, where the
 * interval is 0.0938 s, with dur 0.25, 0.5 and 0.693: the three hold 0.450 (the whole
 * peak) and jump to 0.225 in 1 ms, a step that is heard as a click, just what this
 * crossing must not be. With 0.75 the envelope decays clean, and the largest jump of
 * the body is the attack ramp itself. The exact floor at 160 bpm is 0.693
 * (`0.065 / 0.0938`) and 0.75 is the round value above it, with 5 ms of margin. To
 * lower it, look at `DEFAULT_VOICE` and `TEMPO_MAX` in the same count.
 */
export const GRACE_INTERVALS = 0.75;

/** The amplitude of a note, 0-1. */
export const DEFAULT_VELOCITY = 0.8;

/**
 * The amplitude of a click, 0-1.
 *
 * Calibrated against `DEFAULT_VELOCITY` (0.8), that of a note: 0.25 is less than one
 * third, about -10 dB. Low on purpose, so that the circuit accompanies the notes and
 * does not compete with them.
 *
 * But not lower, and that is measured too: a cycle of 8 pieces has 40 notes and ~15
 * clicks, so the click is a minority but not background noise. If it is not heard, the
 * circuit is inaudible and has no reason to be.
 *
 * Also, the click lasts `CLICK_SECONDS` (50 ms) against the ~136 ms of a note at 110
 * bpm, and a transient that short is already perceived as much weaker than a held note
 * of the same amplitude: a lower number would discount the same thing twice.
 *
 * **And there is a counter-argument that the offline render does not close**: at the
 * same peak, the bell has 15 % LESS RMS than a click of noise (0.0141 against 0.0167),
 * but it lives in the band where the ear is most sensitive (`CLICK_MIDI`), so it can be
 * perceived as LOUDER although it measures less. The two effects point in opposite
 * directions and no measurement adds them: that is decided by ear, and the number stays
 * at 0.25 until somebody does it.
 */
export const CLICK_VELOCITY = 0.25;

/**
 * The amplitude of a CROSSING, 0-1. Between the other two, and not at the arithmetic
 * middle.
 *
 * A crossing must be heard more present than a click: it has a pitch, and if it is not
 * recognized as a note, nobody understands that a cell of a piece was crossed. But it
 * must be further back than the note of the piece whose turn it is. So the two numbers
 * that exist bound it: `CLICK_VELOCITY` (0.25) and `DEFAULT_VELOCITY` (0.8).
 *
 * **0.45 and not 0.525, which would be the mean.** Amplitude is perceived in dB and not
 * linearly, so the real midpoint is the GEOMETRIC mean: `sqrt(0.25 * 0.8) = 0.447`.
 * With 0.45 the crossing is at -5.0 dB from a note and at +5.1 dB from a click, the
 * same distance from the two. With the arithmetic mean it would be at -3.7 dB from the
 * note and at +6.4 dB from the click, much nearer to the sound of one more note.
 *
 * Five dB is not an arbitrary number either: it is the smallest difference that reads
 * clearly as "this sounds softer" and not as a note played badly, and it still leaves
 * the crossing audible in the mix. With 8 pieces a cycle has 40 notes against a handful
 * of crossings, so if the crossing sinks it is never heard.
 *
 * Also, the crossing is shorter than a note (`GRACE_INTERVALS`, 0.75 against 1), and
 * that already sets it apart: a lower amplitude would discount the same thing twice,
 * the same argument that closes the docblock of `CLICK_VELOCITY`.
 */
export const GRACE_VELOCITY = 0.45;

/**
 * The PITCH of the click, in MIDI. 96 = `C7` = 2 093.0 Hz.
 *
 * The click is a bell of fixed pitch and not white noise. A pitch does not make it a
 * melodic line: what draws a line is DIFFERENT pitches, and this one never changes. A
 * metronome has a pitch and plays nothing.
 *
 * **Outside the REGISTER, because there is no way out of the scale.** This is
 * MEASURED, and it stops an attempt to "choose a note that is not in use": the
 * instrument uses the 12 pitch classes out of 12. There are 12 tonics (`BASE_MAP` gives
 * a different class to each piece) times four pentatonic formulas, so the temperament
 * is covered whole and not one note is free. "Outside the scale" does not exist on
 * this instrument.
 *
 * What is possible is to leave the register, which goes from `C4` (MIDI 60, 261.6 Hz)
 * to `D#6` (MIDI 87, 1 244.5 Hz). That ceiling already includes the octave shift that
 * `notesForRotation` applies when the sum passes `B`, so it cannot be deduced from
 * `DEFAULT_OCTAVE` by eye. `C7` is NINE semitones above: no piece can reach that pitch
 * or mask it.
 *
 * **And 2 kHz and not higher, because the ear is most sensitive there.** The band from
 * 2 to 4 kHz is the maximum of human hearing, so a bell there is heard at a LOWER
 * amplitude than the same bell two octaves above. That is exactly what
 * `CLICK_VELOCITY` wants: the circuit accompanies and does not compete. `E7` (MIDI 100)
 * would be more "out of the way" on paper and more strident in practice. The lower
 * candidates were rejected for the register: `A6` (MIDI 93) is 6 semitones from the
 * ceiling against the 9 of `C7`.
 */
export const CLICK_MIDI = 96;

/**
 * How long a click lasts, in SECONDS.
 *
 * It is the deliberate exception to what `NOTE_INTERVALS` says: what is musical is
 * measured in intervals so that it survives a tempo change, but the click is a
 * transient and its perceptual identity is the ABSOLUTE shortness, not the proportion
 * to the beat. If it scaled with the tempo it would last 0.367 intervals, 92 ms at 60
 * bpm, and it would start to have a body. The anchor of that count is `DEFAULT_BPM`
 * (110 bpm, an interval of 136.4 ms), the same that the rest of the docblock uses: two
 * anchors in one paragraph make it unreadable.
 *
 * **50 ms, and the number that decides if two clicks overlap is not this one but the
 * decay.** Measured in an offline render: the bell falls 40 dB at 29.5 ms.
 *
 * ```
 * bpm            interval    the click takes   it fell 40 dB at
 * 60             250.0 ms    20 %              12 %
 * 110            136.4 ms    37 %              22 %
 * 160 TEMPO_MAX   93.8 ms    53 %              31 %
 * ```
 *
 * In the worst case, 160 bpm, the fastest tempo, 64 ms of air stay between the decay
 * and the next event. With 80 ms the bell would take 85 % of the interval at that tempo
 * and would fall 40 dB only at the middle: two consecutive clicks would overlap
 * audibly.
 *
 * **50 and not 20**: 20 ms of a sine at 2 093 Hz is 42 periods, enough to hear the
 * pitch, but the decay is so abrupt that the event reads as a hit again. With 50 ms the
 * bell DECAYS, and there it sounds like a metronome.
 */
export const CLICK_SECONDS = 0.05;

/**
 * The value where the decay of the click ends. Absolute, not relative to the amplitude.
 *
 * It exists because the decay of the click is EXPONENTIAL and
 * `exponentialRampToValueAtTime` cannot reach 0: the ramp goes to an epsilon and
 * `stop()` cuts it. It is the opposite of `scheduleVoice`, where the linear ramp is
 * mandatory because the envelope of a note must close in silence. Here the decay IS the
 * timbre, and an exponential to an epsilon sounds like a resonance that fades and not
 * like a hit.
 *
 * **0.0001 and not a rounder value, because it gives the measured decay.** From
 * `CLICK_VELOCITY` (0.25) to 0.0001 there are 68 dB, spread linearly in dB along
 * `CLICK_SECONDS`: so the 40 dB fall at 29.5 ms, the number with which the table of
 * `CLICK_SECONDS` decides that two clicks do not overlap. A lower value makes the bell
 * drier and a higher one leaves it hanging. A change here means that table must be
 * made again.
 *
 * **It is a floor for the `vel` of `scheduleClick`, not only a target.** The ramp is
 * exponential, so it falls only if it starts ABOVE this value: with a lower `vel` the
 * same call becomes a swell and not a bell, and with `vel = 0` it throws. A linear ramp
 * to 0 would take any amplitude, and this one does not.
 * This is not reachable today: the only production caller is `engine.ts`, which uses
 * the default `CLICK_VELOCITY` (0.25), 2 500 times this number. It is written because
 * the day somebody adds a caller with its own volume, a softer muted piece for example,
 * no signature gives the limit.
 */
export const CLICK_EPSILON = 0.0001;

/**
 * The cushion between the end of the release and the `stop()` of the oscillator, in
 * seconds.
 *
 * Without it, the oscillator is cut just when the envelope reaches 0 and the tail is
 * truncated.
 */
export const RELEASE_TAIL = 0.01;

/**
 * The envelope and the timbre of a voice. All optional: DEFAULT_VOICE gives the rest.
 *
 * No `release`: it depends on the tempo (`RELEASE_INTERVALS`), so it travels as a
 * parameter of `scheduleVoice` and not as an option with a default, like `dur`. A
 * default in seconds would lie about the current bpm, and a caller that omits it would
 * not know.
 */
export interface VoiceOpts {
  attack?: number;
  decay?: number;
  sustain?: number;
  type?: OscillatorType;
}

/** MIDI to Hz. A4 = 69 = 440 Hz. */
export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Schedules ONE note. `at` is absolute time on the clock of the context, not a delay.
 *
 * The first `setValueAtTime(0, at)` is not redundant: the ramps of Web Audio
 * interpolate from the last scheduled event, so without that anchor the ramp starts at
 * whatever value was left and a click is heard.
 *
 * The ramps are linear and not exponential because exponentialRampToValueAtTime cannot
 * reach 0: it would have to ramp to an epsilon and cut.
 *
 * `dur` and `rel` are mandatory and have no default, on purpose: the two are counted in
 * intervals, so they depend on the tempo and cannot be constants. A default would be a
 * fixed number of seconds that lies about the current bpm, and a caller that forgets
 * the parameter would not know. The calculations,
 * `NOTE_INTERVALS * intervalDuration(bpm)` and
 * `RELEASE_INTERVALS * intervalDuration(bpm)`, live where the bpm is, in `engine.ts`,
 * and this module knows nothing of the tempo.
 *
 * `rel` is a parameter and not a part of `opts` for the same reason: `opts` is the
 * TIMBRE, what can stay at its default without a lie, and the release is not a
 * preference but a measure of time, like `dur`.
 */
export function scheduleVoice(
  ctx: BaseAudioContext,
  dest: AudioNode,
  freq: number,
  at: number,
  dur: number,
  rel: number,
  vel = DEFAULT_VELOCITY,
  opts: VoiceOpts = {},
): void {
  const { attack, decay, sustain, type } = { ...DEFAULT_VOICE, ...opts };
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);

  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(vel, at + attack);
  env.gain.linearRampToValueAtTime(vel * sustain, at + attack + decay);
  env.gain.setValueAtTime(vel * sustain, at + dur);
  env.gain.linearRampToValueAtTime(0, at + dur + rel);

  osc.connect(env);
  env.connect(dest);
  osc.start(at);
  osc.stop(at + dur + rel + RELEASE_TAIL);
  osc.onended = () => { osc.disconnect(); env.disconnect(); };
}

/**
 * Schedules ONE click: the circuit crossing an empty cell. `at` is absolute time on the
 * clock of the context, as in scheduleVoice.
 *
 * **A bell of fixed pitch, and not noise.** The argument for a buffer of random samples
 * is half true: an oscillator ALWAYS has a pitch, and a pitch that moves makes the
 * circuit draw a melodic line that competes with the pieces. But there is a third
 * option between "no pitch" and "a pitch that moves": **what draws a melodic line is
 * DIFFERENT pitches**, and this one, `CLICK_MIDI`, never changes. A metronome has a
 * pitch and plays nothing. It is not a note, it is a mark.
 *
 * The risk that stays, that it reads as one more note of the arpeggio, is removed by
 * the REGISTER and not by the shortness: `CLICK_MIDI` is nine semitones above the
 * ceiling of the instrument, so no piece can reach it. The reason is written where the
 * number lives.
 *
 * Noise is also the wrong sound for this event. Measured: the spectral centroid of a
 * click of noise is at 11 260 Hz, almost two octaves above the ceiling of the
 * instrument, and on a board of 3 pieces 44 % of what sounds in a cycle is clicks.
 * Almost half of the instrument would be hiss.
 *
 * **The `stop()` is not optional.** A buffer of exactly `CLICK_SECONDS` ends alone, and
 * a `stop()` there would be a second place where the duration lives. An
 * `OscillatorNode` never ends, so `stop()` is needed for two things: to cut the
 * `CLICK_EPSILON` where the exponential ends, which otherwise goes on sounding, and to
 * fire the `onended` that holds the `disconnect()` calls, without which ~12 oscillators
 * stay alive for each cycle.
 */
export function scheduleClick(
  ctx: BaseAudioContext,
  dest: AudioNode,
  at: number,
  vel = CLICK_VELOCITY,
): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(midiToHz(CLICK_MIDI), at);

  // No attack ramp, the opposite of scheduleVoice: there the step is heard as a click
  // and must be anchored at 0. Here the click IS the aim, and an attack ramp would
  // remove just the transient that makes it percussive.
  //
  // But the decay DOES change shape: exponential and not linear, also the opposite of
  // scheduleVoice. There the linear ramp is mandatory, because the envelope of a note
  // must close in silence and the exponential cannot reach 0. Here the decay IS the
  // timbre, it makes a bell and not a hit, and an exponential to CLICK_EPSILON sounds
  // like a resonance that fades. The price of that shape is the stop().
  env.gain.setValueAtTime(vel, at);
  env.gain.exponentialRampToValueAtTime(CLICK_EPSILON, at + CLICK_SECONDS);

  osc.connect(env);
  env.connect(dest);
  osc.start(at);
  osc.stop(at + CLICK_SECONDS);
  osc.onended = () => { osc.disconnect(); env.disconnect(); };
}
