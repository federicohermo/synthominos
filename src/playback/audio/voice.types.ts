/**
 * Envolvente y timbre de una voz. Todo opcional: los faltantes salen de DEFAULT_VOICE.
 *
 * Sin `release`: depende del tempo (`RELEASE_INTERVALS`), asi que viaja como parametro
 * de `scheduleVoice` y no como opcion con default, igual que `dur`. Un default en
 * segundos mentiria sobre el bpm vigente y el llamador que lo omitiera no se enteraria.
 */
export interface VoiceOpts {
  attack?: number;
  decay?: number;
  sustain?: number;
  type?: OscillatorType;
}
