---
schema_version: 1
capability_id: CAP-PLY
status: draft
owner: federicohermo
provenance: migrated from specs 002 (#64), 008 (#70, the transport), 010 (#72), 014 (#76, the mute effect), 015 (#77); note length and release from the follow-up of 008; per-cell veil from the current code
---

# Capability: playback

## Purpose

Plays the sequence of the board as sound, in time, and shows where the sound is. It must get one
thing right: what the playhead shows and what the speaker plays are the same cycle, at the same
instant.

## Capability language

| Term | Meaning here | Avoid |
|---|---|---|
| **Transport** | the play or pause state of the instrument | loop, clock |
| **Play button** | the control that toggles the transport | transport control |
| **Tempo** | the speed of the instrument, in beats per minute (bpm) | speed, BPM slider |
| **Interval** | one sixteenth note at the current tempo, as the musical model defines it | spread, tick, beat |
| **Sequence** | the events of one cycle that the circuit builds, each with its offset and its cell | route, pattern, loop |
| **Sounding sequence** | the sequence that the speaker plays now | active sequence, sounding route |
| **Queued sequence** | the sequence of the current board, which waits for the end of the cycle | pending sequence, queued route |
| **Cycle** | one pass of the sounding sequence, from offset 0 to its length in intervals | bar, loop |
| **Cycle boundary** | the instant where one cycle ends and the next one starts | downbeat, edge |
| **Event** | one thing that sounds at one offset: a note, a crossing or a click | hit, onset |
| **Note** | a note of a placed, unmuted piece, at its own turn in the sequence | step note |
| **Crossing** | a leg of the circuit entering an occupied cell; it sounds the note of that cell | grace note, ornament |
| **Click** | a leg of the circuit entering an empty cell, or a cell of a muted piece; it has no note | tick, noise |
| **Click switch** | the control that makes clicks audible | metronome, empty-tour toggle |
| **Lookahead** | how far ahead of the audio clock the system schedules events | buffer, window |
| **Playhead** | the mark on the cell of the event that the speaker plays now | cursor, read head |
| **Veil** | the cover on a placed cell that has not sounded yet | pending style, dimming |

## Normative behavior

### BR-PLY-001 — Two transport states

The transport SHALL be either playing or paused. The instrument SHALL open paused. The transport
control SHALL offer the action it does: play while paused, pause while playing.

### BR-PLY-002 — The control tells what the audio did

WHEN the user asks the transport to play, the system SHALL show the state that the audio
engine reached, not the state that was asked. IF audio cannot start, THEN the transport SHALL stay
paused. IF the browser has no audio, THEN the instrument SHALL stay usable and silent.

### BR-PLY-003 — One tempo

The system SHALL have one tempo, set by the tempo clock between its slowest and its fastest
value. The instrument SHALL open at the default tempo.

### BR-PLY-004 — A tempo change applies to the sounding sequence

WHEN the tempo changes, the system SHALL apply it to the sounding sequence from the next scheduled
event. The change SHALL NOT queue the sequence again, and SHALL NOT change the order or the offsets
of its events.

### BR-PLY-005 — Each event at its offset

WHILE the transport plays, the system SHALL repeat the sounding sequence. In each cycle, each event
SHALL start at the cycle start plus its offset times the interval.

### BR-PLY-006 — Exact timing

The system SHALL start each event within 1 ms of its scheduled instant. The system SHALL NOT
schedule an event in the past, and SHALL NOT play one event twice.

### BR-PLY-007 — A late timer skips, it does not catch up

IF the scheduling timer falls behind by one or more cycles, THEN the system SHALL drop the events
it missed. It SHALL NOT play them in a burst, and the next events SHALL stay on the grid of the
cycle.

### BR-PLY-008 — A board change waits for the cycle boundary

WHEN the board changes while the transport plays, the system SHALL finish the sounding cycle and
start the queued sequence at the cycle boundary. No event SHALL be lost or doubled at the boundary.
IF the board changes twice before the boundary, THEN only the last queued sequence SHALL play. IF the
sounding sequence is empty, THEN the queued sequence SHALL start at once.

### BR-PLY-009 — Play starts a cycle from its start

WHEN the transport starts, the system SHALL start a cycle from offset 0, after a short fixed
delay. IF a queued sequence is waiting, THEN it SHALL become the sounding sequence at that start.

### BR-PLY-010 — Pause schedules nothing new

WHEN the transport pauses, the system SHALL schedule no new event. The system SHALL never schedule
more than the lookahead ahead of the audio clock. Events already scheduled SHALL play to their end.

### BR-PLY-011 — The voice of a note

A note SHALL sound at 440 × 2^((m − 69) / 12) Hz, where m is its MIDI number. Its body SHALL last
one interval, and its release SHALL scale with the interval. Its attack and decay SHALL stay fixed
in seconds.

### BR-PLY-012 — The voice of a crossing

A crossing SHALL sound the note of the crossed cell. It SHALL be shorter and softer than a note,
and louder than a click. Its body SHALL scale with the interval.

### BR-PLY-013 — The voice of a click

A click SHALL sound one fixed pitch above the highest note that any piece can play. Every click
SHALL sound the same: no click of the cycle has an accent. A click SHALL last a fixed time in
seconds, and SHALL end inside one interval at the fastest tempo. A click SHALL be softer than a
note.

### BR-PLY-014 — The click switch

The click switch SHALL be off when the instrument opens. WHILE it is off, the system SHALL sound no
click. The click switch SHALL NOT silence a crossing. Toggling it SHALL NOT change the sequence, its
offsets or the cycle length.

### BR-PLY-015 — A muted piece is silent

The system SHALL sound no note of a muted piece. Each cell of a muted piece SHALL be a click at the
offset of its note, so it sounds only when the click switch is on. A crossing over a muted piece
SHALL be a click, with no note.

### BR-PLY-016 — Where the playhead is

WHILE the transport plays, the playhead SHALL mark the cell of the event that the speaker plays
now. Its offset SHALL be the number of whole intervals since the cycle start, modulo the cycle
length. The system SHALL subtract the output latency of the audio device from the time. The
playhead SHALL jump from cell to cell, with no motion between cells.

### BR-PLY-017 — When there is no playhead

WHILE the transport is paused, the system SHALL show no playhead. IF the sounding sequence is empty,
THEN the system SHALL show no playhead. IF the current cycle has not started yet, THEN the system
SHALL show no playhead.

### BR-PLY-018 — The playhead follows the sounding sequence

The playhead SHALL follow the sounding sequence, not the queued sequence. It SHALL change to the new
sequence in the same frame where the audio engine starts it.

### BR-PLY-019 — Three marks for three events

The playhead SHALL mark a note, a crossing and a click with three different borders. A click SHALL
draw nothing outside its cell. The cells of a muted piece SHALL take the click mark.

### BR-PLY-020 — The veil

The system SHALL veil a placed cell that has not sounded yet. A piece in the queued sequence SHALL
stay veiled until the cycle boundary. After it enters, each of its cells SHALL lose its veil when
the playhead reaches that cell. A piece that already sounds SHALL NOT get a veil again. A muted
piece SHALL have no veil.

### BR-PLY-021 — Reset returns playback to zero

WHEN the user resets the board, the system SHALL stop the transport and clear the veil. The
next start SHALL sound no removed piece. IF the user removes the last piece without a reset,
THEN the system SHALL finish the sounding cycle.

## Acceptance criteria

### AC-PLY-001 — The control offers play while paused *(verifies BR-PLY-001)*

GIVEN the transport paused THEN the play button is named "play" and shows ▶. GIVEN the
transport playing THEN the same control is named "pause" and shows ⏸.

### AC-PLY-002 — The control follows the engine *(verifies BR-PLY-001, BR-PLY-002)*

GIVEN the transport paused WHEN the user activates play and the engine starts THEN the control
offers pause. WHEN the user activates pause THEN the engine stops and the control offers play.

### AC-PLY-003 — A failed start stays paused *(verifies BR-PLY-002)*

GIVEN an engine that does not start WHEN the user activates play THEN the toggle reports
"paused" and the control still offers play.

### AC-PLY-004 — No audio, no crash *(verifies BR-PLY-002)*

GIVEN a browser where the audio context cannot be built WHEN the system asks for audio THEN it
gets no context, logs one warning, and the next requests log no more.

### AC-PLY-005 — The instrument opens at the default tempo *(verifies BR-PLY-003)*

GIVEN the instrument loads THEN the tempo is the default tempo, and the shell and the engine have
the same value.

### AC-PLY-006 — A tempo change does not queue the sequence *(verifies BR-PLY-004)*

GIVEN a mounted instrument WHEN only the tempo changes THEN the engine gets the new tempo and the
sequence is not queued again.

### AC-PLY-007 — The same sequence at a new tempo *(verifies BR-PLY-004)*

GIVEN one sequence WHEN it plays at 60 bpm and at 160 bpm THEN each event falls at the same fraction
of the cycle, and the order of events is the same.

### AC-PLY-008 — N cycles give N onsets *(verifies BR-PLY-005)*

GIVEN a sequence with one note at offset 0 WHEN N cycles play THEN there are exactly N onsets, each at
the cycle start plus k cycles. GIVEN notes at different offsets THEN each onset falls at the cycle
start plus k cycles plus its offset times the interval.

### AC-PLY-009 — A note starts on time *(verifies BR-PLY-006, BR-PLY-011)*

GIVEN a note rendered offline at a known instant THEN its first non-zero sample is within 1 ms of
that instant, and its frequency is within 1 Hz of the MIDI formula.

### AC-PLY-010 — What is scheduled is what is heard *(verifies BR-PLY-005, BR-PLY-006)*

GIVEN the scheduler and the voice rendered together offline THEN each onset is heard within 6 ms
of the instant that the scheduler gave.

### AC-PLY-011 — Overlapping windows play each onset once *(verifies BR-PLY-006)*

GIVEN scheduling windows that overlap THEN every onset of the sequence comes out, and none comes out
twice.

### AC-PLY-012 — Ten lost cycles do not burst *(verifies BR-PLY-007)*

GIVEN the scheduler 10 cycles late THEN it emits only the events of the current window, none in
the past, and the scheduling state moves forward.

### AC-PLY-013 — The new sequence waits for the boundary *(verifies BR-PLY-008)*

GIVEN a sequence playing WHEN a new sequence is queued in the middle of the cycle THEN the events up to
the boundary are those of the old sequence, and the first event of the new sequence falls on the boundary.
GIVEN that swap THEN every onset of both sequences is emitted, and none twice.

### AC-PLY-014 — Two changes count as one *(verifies BR-PLY-008)*

GIVEN two sequences queued before the boundary THEN only the second one plays after the boundary.

### AC-PLY-015 — An empty sequence lets the queued sequence in at once *(verifies BR-PLY-008, BR-PLY-009)*

GIVEN an empty sounding sequence and a queued sequence THEN the queued sequence starts without waiting for
a cycle.

### AC-PLY-016 — Play after pause starts the queued sequence *(verifies BR-PLY-009)*

GIVEN a sequence playing, paused, and a new sequence queued during the pause WHEN the transport starts
again THEN the new sequence plays from offset 0, and no event of the old sequence sounds.

### AC-PLY-017 — Nothing beyond the lookahead *(verifies BR-PLY-010)*

GIVEN a long cycle THEN no scheduling call commits an event later than the lookahead after the
current time.

### AC-PLY-018 — The note scales with the tempo *(verifies BR-PLY-011)*

GIVEN the same note at 60 bpm and at 160 bpm THEN it lasts longer at 60 bpm, and the ratio of its
release to the interval is the same at both tempos.

### AC-PLY-019 — The crossing sounds its pitch, shorter and softer *(verifies BR-PLY-012)*

GIVEN a note and a crossing on note 77, rendered offline together THEN the crossing has the pitch of
note 77 within 2 %, and its peak is below 0.7 of the peak of the note. 1.75 intervals after the
onset, the crossing is silent and the note still sounds.

### AC-PLY-020 — The click has a fixed pitch and a short life *(verifies BR-PLY-013)*

GIVEN a click rendered offline THEN it crosses zero at the rate of its fixed pitch within 2 %, it
is silent after its fixed duration, and its peak is lower than the peak of a note.

### AC-PLY-021 — The click switch keeps the cycle *(verifies BR-PLY-014)*

GIVEN a sequence with a click and the click switch off WHEN the transport plays a full cycle THEN the
playhead reaches the last offset, and the sequence still has its click and its length.

### AC-PLY-022 — The click switch does not silence a crossing *(verifies BR-PLY-014)*

GIVEN a sequence with a note, a click and a crossing WHEN the clicks are left out THEN the note and
the crossing remain.

### AC-PLY-023 — The three events dispatch to three voices *(verifies BR-PLY-012, BR-PLY-013, BR-PLY-014)*

GIVEN a cycle with a note, a crossing and a click, and the click switch on THEN each of the three
reaches its own voice.

### AC-PLY-024 — A muted piece gives five clicks *(verifies BR-PLY-015)*

GIVEN a board with one muted piece among others THEN the sequence has no note for that piece, and has
five clicks with no note at the offsets of its five notes.

### AC-PLY-025 — One muted piece alone is silent *(verifies BR-PLY-015)*

GIVEN a board with only one piece, muted THEN the sequence has five clicks with no note, zero notes,
and a length of five intervals.

### AC-PLY-026 — A crossing over a muted piece has no note *(verifies BR-PLY-015)*

GIVEN a sequence that crosses the X WHEN the X is muted THEN the crossings over the X carry no note.

### AC-PLY-027 — The playhead offset *(verifies BR-PLY-016)*

GIVEN a cycle of 8 intervals THEN the offset grows by one per interval, stays an integer inside an
interval, returns to 0 at the boundary, and stays in 0–7 many cycles later.

### AC-PLY-028 — The playhead offset never fails *(verifies BR-PLY-016, BR-PLY-017)*

GIVEN a cycle length of 0, a non-positive interval or a non-finite argument THEN there is no
offset. GIVEN a time before the cycle start THEN the offset is an integer from 0 to the length
minus 1, never a negative number.

### AC-PLY-029 — No playhead when nothing plays *(verifies BR-PLY-017)*

GIVEN the transport paused, or an empty sounding sequence, or a suspended audio context THEN the
engine reports no playhead offset. GIVEN a cycle start still in the future THEN it reports none,
and after the start it reports a number.

### AC-PLY-030 — The playhead jumps to its cell *(verifies BR-PLY-016)*

GIVEN an offset THEN the playhead moves to the cell of that offset, measured in cells. GIVEN the
same cell in the next frame THEN the page is not written again.

### AC-PLY-031 — The playhead draws the sounding sequence *(verifies BR-PLY-018)*

GIVEN a sequence playing WHEN a new sequence is queued THEN the playhead keeps the old sequence, whole, until
the engine reports the boundary.

### AC-PLY-032 — Three borders *(verifies BR-PLY-019)*

GIVEN a note, a crossing and a click THEN the playhead draws three different borders, and the click
draws no outer border.

### AC-PLY-033 — A muted piece takes the click mark *(verifies BR-PLY-019)*

GIVEN a muted piece in the sounding sequence THEN its five cells are marked as clicks, not as notes.

### AC-PLY-034 — Cell by cell *(verifies BR-PLY-020)*

GIVEN a piece that just entered the cycle THEN each cell keeps its veil until the playhead reaches
its offset, also when a frame is lost. GIVEN a queued piece THEN its cells have no offset and lose
the veil all at once at the boundary. GIVEN a piece that already sounds WHEN another piece enters
the sequence THEN the first piece gets no veil.

### AC-PLY-035 — A muted piece has no veil *(verifies BR-PLY-020)*

GIVEN one muted piece and one unmuted piece, both new THEN only the unmuted piece is veiled.

### AC-PLY-036 — Reset clears the veil *(verifies BR-PLY-021)*

GIVEN veiled pieces and the transport paused WHEN the user resets THEN the veil is empty.

### AC-PLY-037 — Removing the last piece is not a reset *(verifies BR-PLY-021)*

GIVEN one piece playing WHEN the user removes it THEN the sounding sequence stays until the cycle
boundary.

### AC-PLY-038 — Reset stops the transport *(verifies BR-PLY-021)*

GIVEN a placed piece and the transport playing WHEN the user resets the board THEN the transport
stops, the play button offers play, and no cell shows a note.

## Non-goals

- This capability does NOT build the sequence. It plays the offsets that the circuit gives.
- This capability does NOT decide the notes of a piece or the length of the interval. The musical
  model gives them.
- This capability does NOT decide when the courtesy arpeggio plays. Board editing decides; this
  capability gives it the note voice.
- This capability does NOT apply a board change before the cycle boundary. A muted piece, a removed
  piece and a regime change all wait.
- This capability does NOT limit the output level. Many pieces at once can clip (see
  `OQ-PLY-002`).
- This capability does NOT keep the transport, the tempo or the click switch across sessions.
- This capability does NOT draw the signal. The spectrum does.

## Contracts

- **Input:** the sequence, with an offset for each event, a note for each note or crossing, and the
  cell of each event; the tempo; the click switch; play, pause and reset.
- **Output:** sound through one master bus; the transport state that the engine reached; the
  playhead offset; the marks and the veil of the cells.
- **Failure:** without audio, play leaves the transport paused and the instrument silent. An empty
  sequence plays nothing and draws no playhead. A late timer drops events instead of playing them late.

## Signals

- The play button shows the transport state after each toggle.
- The engine counts each start of a new sounding sequence. The playhead and the veil change on that
  count.
- The engine logs one warning when audio is not available.

## Dependencies

- [`circuit`](../circuit/circuit.md) (consumes): the sequence, its cycle length, and the offset and
  cell of each note, crossing and click.
- [`musical-model`](../musical-model/musical-model.md) (consumes): the interval from the tempo,
  the arpeggio in sound order, and the note of each crossed cell.
- [`board-editing`](../board-editing/board-editing.md) (consumes): the placed pieces and their
  mute, the space bar toggle, and the reset order.
- [`board-editing`](../board-editing/board-editing.md) (feeds): the transport state, which decides
  whether a placement plays the courtesy arpeggio.
- [`panels`](../panels/panels.md) (consumes): the requests of the play button, the tempo clock, the
  click switch and the reset button.
- [`spectrum`](../spectrum/spectrum.md) (feeds): the master bus, which the signal display reads.
- [`accessibility`](../accessibility/accessibility.md) (feeds): the transport state and the tempo,
  which the play button and the tempo clock expose.

## Open questions

- **OQ-PLY-001 — Should pause silence what is already scheduled?**
  - Why it is still open: pause stops the scheduling, but the lookahead and the note tails keep
    sounding. The tail depends on the tempo. It feels like a control that does not respond (#46).
  - Decides: the repository owner.
  - Blocks: a change to `BR-PLY-010`.
- **OQ-PLY-002 — How does the mix keep its headroom?**
  - Why it is still open: the master gain is fixed. Measured offline, six pieces sounding together
    clip (#45). A limiter and a gain per piece count are candidates; neither is tested.
  - Decides: the repository owner.
  - Blocks: a rule on the output level.
- **OQ-PLY-003 — Should the click switch open on?**
  - Why it is still open: the click switch opens off because the clicks covered the phrase. The
    fixed-pitch click was never judged by ear against that decision.
  - Decides: the repository owner, by ear at the slowest, default and fastest tempos.
  - Blocks: `BR-PLY-014`.
- **OQ-PLY-004 — Is a full cycle of latency acceptable?**
  - Why it is still open: a new piece can wait a full cycle to sound, 7.5 s with eight pieces at the
    default tempo. The named alternative applies a change at the next pass over the affected piece.
    Nobody decided it.
  - Decides: the repository owner, by ear.
  - Blocks: nothing. It changes `BR-PLY-008`.
