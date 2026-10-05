# A coarse timer schedules 100 ms ahead on the audio clock

**Recorded 2026-10-04.** The decision is of 2026-08-02, with the engine of
[#64](https://github.com/federicohermo/pentomino-games/issues/64).

A browser timer has a jitter of tens of milliseconds. The clock of the audio context is exact to
the sample, but code cannot wait on it. The contract asks for each event within 1 ms of its instant
(`BR-PLY-006` of [the playback contract](../../../specs/playback/playback.md)).

**Decision: a timer wakes each 25 ms and gives each event of the next 100 ms an absolute time on
the audio clock.** The timer plays no note. It decides when to look, so its jitter is not heard.
This is the pattern of the article "A Tale of Two Clocks", and it is what the transport of Tone did
inside. The two values are `TICK_MS` and `LOOKAHEAD` in `src/playback/scheduler.ts`. The comments
of that module say how a window is solved from an origin and not with a cursor.

What was weighed:

- **One `setTimeout` for each note.** Refused: the jitter of the timer becomes the jitter of the
  note.
- **A timer in a `Worker` or in an `AudioWorklet`**, which a hidden tab does not throttle. Not
  taken: it is a change of its own. The engine drops the events it missed instead.

The cost:

- **Pause is not instant.** What is scheduled plays to its end: up to 100 ms of new events, plus
  the tail of an arpeggio that already started. All five notes of a piece are committed when its
  first note enters the window. So the tail is four intervals, the note and its release: 1.47 s at
  60 bpm and 0.55 s at 160 bpm. `OQ-PLY-001` asks if pause must silence it.
- **A hidden tab loses events.** The browser throttles the timer of a hidden tab to about one wake
  each second, ten times the lookahead. The engine drops what it missed and stays on the grid of
  the cycle (`BR-PLY-007`).
- **A swap is decided before it is heard.** The scheduler starts the queued sequence inside the
  lookahead. Measured, for up to 82 ms at 110 bpm, plus the output latency, the new sequence is in
  force and the old one still sounds. The playhead shows nothing in that window (`BR-PLY-017`).
