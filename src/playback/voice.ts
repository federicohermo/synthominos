
/** `attack` and `decay` are seconds. */
export const DEFAULT_VOICE: Required<VoiceOpts> = {
  attack: 0.005,
  decay: 0.06,
  sustain: 0.5,
  type: 'triangle',
};

/** In intervals, without the release. */
export const NOTE_INTERVALS = 1;

/** In intervals. 0.88 is a release of 0.12 s at 110 bpm, the tempo where it was tuned. */
export const RELEASE_INTERVALS = 0.88;

/**
 * In intervals. Below 0.693 at `TEMPO_MAX` the body ends before `attack + decay`, and the
 * envelope drops in one step that is heard as a click.
 */
export const GRACE_INTERVALS = 0.75;

export const DEFAULT_VELOCITY = 0.8;

export const CLICK_VELOCITY = 0.25;

/** The geometric mean of `CLICK_VELOCITY` and `DEFAULT_VELOCITY`: 5 dB from each. */
export const GRACE_VELOCITY = 0.45;

/** C7, nine semitones above D#6, the highest note that a piece can play. */
export const CLICK_MIDI = 96;

/**
 * Seconds, not intervals. The bell falls 40 dB at 29.5 ms, inside the 93.8 ms interval of
 * `TEMPO_MAX`.
 */
export const CLICK_SECONDS = 0.05;

/**
 * An exponential ramp cannot reach 0. It is also the floor of `vel` in `scheduleClick`:
 * below it the ramp rises, and with 0 it throws.
 */
export const CLICK_EPSILON = 0.0001;

/** Seconds. Without it, `stop()` truncates the tail of the release. */
export const RELEASE_TAIL = 0.01;

export interface VoiceOpts {
  attack?: number;
  decay?: number;
  sustain?: number;
  type?: OscillatorType;
}

export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** `at` is absolute time on the clock of the context, not a delay. */
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

  // A ramp interpolates from the last scheduled event: without this anchor a click is heard.
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

  env.gain.setValueAtTime(vel, at);
  env.gain.exponentialRampToValueAtTime(CLICK_EPSILON, at + CLICK_SECONDS);

  osc.connect(env);
  env.connect(dest);
  osc.start(at);
  osc.stop(at + CLICK_SECONDS);
  osc.onended = () => { osc.disconnect(); env.disconnect(); };
}
