# The audio engine is our own, on Web Audio, with no audio library

**Recorded 2026-10-04.** The decision is of 2026-08-02, in
[#64](https://github.com/federicohermo/pentomino-games/issues/64).

The instrument used Tone.js for its three audio tasks: the synthesis, the scheduling and the life
of the voices. The repo held one call for each path to sound. Three problems came with that:

- **No test could say what sounds.** A count of the events of the Tone transport proves that
  something was scheduled. It does not prove a frequency, an instant or an envelope. The only check
  was to listen.
- **The weight.** `tone@15.1.22` does not declare `sideEffects: false`, so six imported symbols
  brought 962 modules, and deep imports removed only 9 %. That was 340 kB, 62 % of the JavaScript
  the site served.
- **A loop was an event with an identity.** Each loop kept the ID of its transport event. A lost
  ID left a loop that played after its piece was removed, and that bug occurred. To give the same
  pattern again restarted the phase of each loop.

**Decision: the repo writes its own engine on Web Audio and has no audio library.** `src/playback/`
holds the synthesis, the scheduler and the life of the voices.

- The functions that make sound and that decide time receive the audio context and the time as
  parameters. A test renders them with an `OfflineAudioContext` and asserts on the samples.
- The sequence is data that the scheduler reads. The engine keeps no event that can be lost, so to
  replace the whole sequence is safe.
- A voice is one oscillator and one gain, made for one note and dropped when it ends. There is no
  pool and no voice stealing: an oscillator node is single-use by design of the API, and a piece
  plays five notes.

Measured before the change: a prototype engine with the same function was 1.57 kB, about 217 times
smaller. The envelope of the prototype was asserted offline within 1 % to 2 % of its theoretical
values. The change set its criterion at a build of about 210 kB of JS and CSS, not compressed,
against about 550 kB before.

The cost:

- **The repo owns what the library did.** The timing, the envelope, the life of each node and the
  behavior in a hidden tab are code and tests of this repo. The cost of the scheduler is in
  [its own record](./2026-10-04-lookahead-scheduler.md).
- **Nothing comes for free.** A filter, a reverb, a delay or a limit on the voices is code to
  write. The master gain is fixed, and six pieces that sound together clip: `OQ-PLY-002` of
  [the playback contract](../../../specs/playback/playback.md).
- **The sound changed.** An envelope of our own is not the `Synth` of Tone.
