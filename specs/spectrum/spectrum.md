---
schema_version: 1
capability_id: CAP-SPC
status: draft
owner: federicohermo
provenance: migrated from spec 003 (#65); the idle redraw rule from later code without a spec
---

# Capability: spectrum

## Purpose

Shows the sound that the instrument makes as a live frequency spectrum, so that a user who
cannot hear still sees that something sounds. It must get two things right: the analysis does
not change the sound, and "no audio yet" looks different from "audio that is silent".

## Capability language

| Term | Meaning here | Avoid |
|---|---|---|
| **Signal** | the mixed audio at the master output, the last point before the speakers | sound, output |
| **Analysis** | the frequency analysis of the signal, with time smoothing between readings | analyser, FFT |
| **Bin** | one frequency band of the analysis, with a magnitude from 0 to 255 | bucket |
| **Reading** | the bins of the analysis at one instant, or no signal | sample, snapshot |
| **No signal** | the answer of a reading when the audio context does not exist or does not run | null, empty |
| **Bar** | one column of the spectrum, with a height from 0 to 1 | band |
| **Band** | the range of bins that one bar covers | group |
| **Lane** | the horizontal space of one bar on the canvas | column, slot |
| **Idle state** | the image the spectrum draws when a reading gives no signal | rest, flat line |
| **Frame** | one display refresh of the browser | tick |
| **Pixel density** | the ratio of device pixels to CSS pixels | dpr, zoom |

## Normative behavior

### BR-SPC-001 — The analysis point

The system SHALL analyse the signal after the master gain and before the speakers. Each sound
that the instrument makes SHALL go through the analysis.

### BR-SPC-002 — The analysis is transparent

The analysis SHALL NOT change the signal. The signal with the analysis SHALL be identical, sample
for sample, to the signal without it.

### BR-SPC-003 — No signal before the audio runs

IF the audio context does not exist, or exists and does not run, THEN a reading SHALL give no
signal. No signal is different from bins with zero magnitude. A reading SHALL NOT create the audio
context.

### BR-SPC-004 — One reused reading buffer

Consecutive readings SHALL return the same buffer, overwritten with the new magnitudes. A consumer
that keeps a reading after its frame SHALL copy it.

### BR-SPC-005 — Logarithmic bands

The system SHALL group N bins into B bars with logarithmic band edges. The lower edge of band b is
floor((N + 1)^(b / B)) − 1, and band b ends before the lower edge of band b + 1. No band SHALL
cover more bins than the band above it. Reference: 128 bins in 8 bars give bands of 1, 2, 3, 5, 9,
18, 32 and 59 bins.

### BR-SPC-006 — Every bin reaches a bar

Each bin SHALL fall in at least one band, the highest bin included.

### BR-SPC-007 — No empty band

Each band SHALL cover at least one bin. IF there are more bars than bins, THEN two neighbouring
bands MAY share a bin.

### BR-SPC-008 — Peak height

The height of a bar SHALL be the highest magnitude in its band divided by 255. The mapping SHALL
be deterministic: the same reading gives the same heights.

### BR-SPC-009 — Degenerate input

IF the bar count is zero or negative, THEN the mapping SHALL give no bars. The mapping SHALL round
a fractional bar count down. IF there are no bins, THEN each bar SHALL have height 0.

### BR-SPC-010 — Drawing the bars

WHILE a reading gives bins, the system SHALL draw a fixed number of bars, fewer than the bins. Each
bar SHALL have an equal lane, a fixed gap to the next lane, and grow up from the bottom edge. A bar
of height 0 SHALL paint nothing. A bar above 0 SHALL be at least a minimum visible height.

### BR-SPC-011 — The idle state

WHILE a reading gives no signal, the system SHALL draw the idle state: every lane as a dim
full-height column, and a centred text that says the audio starts with the first click. The idle
state SHALL NOT be a flat line.

### BR-SPC-012 — The idle state is drawn once

WHILE the reading stays at no signal, the system SHALL NOT draw the canvas again. WHEN a reading
changes from bins to no signal, the system SHALL draw the idle state. WHEN the canvas changes size,
the system SHALL draw the idle state again.

### BR-SPC-013 — One reading per frame, outside the interface state

WHILE the spectrum is on screen, the system SHALL read and draw once per frame. The drawing SHALL
NOT cause a render of any other part of the interface.

### BR-SPC-014 — Sharp at any pixel density

The canvas SHALL take its CSS size from its container, and its drawing surface SHALL be that size
times the pixel density, rounded. IF the pixel density is not a valid value, THEN the system SHALL
use 1. WHEN the pixel density changes, the system SHALL measure the canvas again, also when its CSS
size does not change.

### BR-SPC-015 — The canvas follows its container

WHEN the container of the canvas changes size, the system SHALL measure the canvas again. IF the
canvas has no container, THEN the system SHALL follow the size of the canvas.

### BR-SPC-016 — Removal stops all work

WHEN the spectrum leaves the interface, the system SHALL cancel its pending frame and stop
following size and pixel density.

### BR-SPC-017 — No canvas, no failure

IF there is no canvas or no 2D drawing context, THEN the system SHALL NOT start the spectrum and
SHALL NOT fail. The rest of the instrument SHALL work.

## Acceptance criteria

### AC-SPC-001 — The analysis sits between master and speakers *(verifies BR-SPC-001)*

GIVEN the audio context running WHEN the instrument builds its audio graph THEN the master gain
connects to the analysis and the analysis connects to the speakers, and nothing else connects to
the speakers.

### AC-SPC-002 — Identical samples *(verifies BR-SPC-002)*

GIVEN one voice rendered offline at master gain 0.3, once with the analysis in series and once
without WHEN the two renders are compared THEN they have the same length and every sample is
equal.

### AC-SPC-003 — No signal before the first gesture *(verifies BR-SPC-003)*

GIVEN no audio context WHEN a reading is taken THEN it gives no signal, and no audio context
exists after the reading.

### AC-SPC-004 — The same buffer twice *(verifies BR-SPC-004)*

GIVEN the audio context running WHEN two readings are taken THEN both return the same buffer
object.

### AC-SPC-005 — Normalized and deterministic *(verifies BR-SPC-008)*

GIVEN 128 bins at 255 WHEN they map to 8 bars THEN each bar is 1. GIVEN 128 bins at 128 WHEN they
map to 16 bars twice THEN both results are equal, and each bar is 128/255.

### AC-SPC-006 — Peak, not mean *(verifies BR-SPC-008)*

GIVEN 128 bins at 0 except bin 100 at 255 WHEN they map to 8 bars THEN the highest bar is 1.

### AC-SPC-007 — Bands grow with frequency *(verifies BR-SPC-005)*

GIVEN 128 bins in 8 bars WHEN each bin is lit alone THEN the lowest band covers fewer bins than the
highest, the lowest covers at least one, and no band covers fewer bins than the band below it.

### AC-SPC-008 — The highest bin is read *(verifies BR-SPC-006)*

GIVEN 128 bins in 8 bars WHEN each bin from 0 to 127 is lit alone at 255 THEN some bar is 1.

### AC-SPC-009 — Silence gives zero bars *(verifies BR-SPC-008)*

GIVEN 128 bins at 0 WHEN they map to 8 bars THEN each bar is 0.

### AC-SPC-010 — More bars than bins *(verifies BR-SPC-007)*

GIVEN 4 bins at 255 WHEN they map to 32 bars THEN there are 32 bars and each is 1.

### AC-SPC-011 — One bar is the peak of all *(verifies BR-SPC-006, BR-SPC-008)*

GIVEN 128 bins at 255 WHEN they map to 1 bar THEN the bar is 1. GIVEN 128 bins at 0 except bin 127
at 51 WHEN they map to 1 bar THEN the bar is 0.2.

### AC-SPC-012 — Degenerate input does not fail *(verifies BR-SPC-009)*

GIVEN 128 bins WHEN they map to 0 bars or to −4 bars THEN there are no bars. GIVEN no bins WHEN they
map to 8 bars THEN each bar is 0.

### AC-SPC-013 — Zero paints nothing, the minimum shows *(verifies BR-SPC-010)*

GIVEN a 200 × 96 canvas WHEN it draws the bars 0, 0, 0 THEN no pixel is painted. WHEN it draws the
bars 0, 0.0001, 0 THEN some pixels are painted, and no more than one lane width times the minimum
height.

### AC-SPC-014 — The gap between lanes *(verifies BR-SPC-010)*

GIVEN a canvas 200 px wide WHEN it draws two bars at 1 THEN the first bar is 100 px minus the gap
wide.

### AC-SPC-015 — The idle state writes *(verifies BR-SPC-011)*

GIVEN a 200 × 96 canvas WHEN it draws the idle state THEN pixels are painted and the idle text is
written at (100, 48).

### AC-SPC-016 — Idle and signal look different *(verifies BR-SPC-011, BR-SPC-013)*

GIVEN the spectrum mounted and readings with no signal WHEN a frame passes THEN the canvas has
paint and the idle text is written. WHEN the readings change to 128 bins at 255 THEN the next frames
paint bars and write no text.

### AC-SPC-017 — Idle does not redraw *(verifies BR-SPC-012)*

GIVEN the idle state drawn once WHEN three more frames pass with no signal THEN the canvas is not
cleared and no text is written.

### AC-SPC-018 — A resize redraws the idle state *(verifies BR-SPC-012, BR-SPC-015)*

GIVEN the idle state drawn WHEN the container width changes to 300 px THEN the drawing surface is
300 times the pixel density wide, and the next frame writes the idle text.

### AC-SPC-019 — Signal back to idle *(verifies BR-SPC-012)*

GIVEN bars drawn from 128 bins at 255 WHEN the readings change to no signal THEN the next frames
write the idle text.

### AC-SPC-020 — The drawing surface comes from the layout *(verifies BR-SPC-014)*

GIVEN the spectrum mounted WHEN the canvas is measured THEN its drawing surface is its CSS width and
height times the pixel density, rounded.

### AC-SPC-021 — An invalid pixel density falls to 1 *(verifies BR-SPC-014)*

GIVEN a 120 × 60 container and a pixel density of 0 WHEN the spectrum starts THEN the drawing
surface is 120 × 60.

### AC-SPC-022 — A density change follows the new density *(verifies BR-SPC-014, BR-SPC-016)*

GIVEN the spectrum started with one density listener for the current density WHEN the pixel
density changes THEN the system adds a listener for the new density and removes the old one, so one
listener is alive. WHEN the spectrum stops THEN no density listener is alive.

### AC-SPC-023 — The container grows *(verifies BR-SPC-015)*

GIVEN a container 120 px wide WHEN it changes to 240 px THEN the drawing surface is 240 times the
pixel density wide.

### AC-SPC-024 — A canvas without container *(verifies BR-SPC-015)*

GIVEN a canvas with no container WHEN the spectrum starts THEN it follows the size of the canvas
itself.

### AC-SPC-025 — Removal stops the loop *(verifies BR-SPC-016)*

GIVEN the spectrum mounted and one frame drawn WHEN it is removed THEN its pending frame is
cancelled and its size follower is disconnected.

### AC-SPC-026 — No canvas, no context *(verifies BR-SPC-017)*

GIVEN no canvas WHEN the spectrum starts and stops THEN nothing fails. GIVEN a canvas whose 2D
context is not available WHEN the spectrum starts and stops THEN nothing fails.

### AC-SPC-027 — The drawing renders nothing else *(verifies BR-SPC-013)*

GIVEN the spectrum drawing 60 frames of bins WHEN the renders of the board are counted THEN the
count does not change.

## Non-goals

- This capability does NOT show the microphone. The instrument captures no audio.
- This capability does NOT keep a history of the spectrum. The bars show the current reading only.
- This capability does NOT draw the waveform in time, nor a volume meter.
- This capability does NOT light the cell whose note a bar shows.
- This capability does NOT decide where the spectrum sits on screen, nor how its panel folds.
- This capability does NOT announce the spectrum to assistive technology.

## Contracts

- **Input:** the signal at the master output; the size of the container; the pixel density.
- **Output:** a reading of bins, or no signal; a set of bar heights from 0 to 1; the image on the
  canvas, bars or the idle state.
- **Failure:** no canvas or no 2D context starts nothing and fails nothing. A reading before the
  first gesture gives no signal and creates no audio context. A degenerate bar count gives no bars.

## Signals

- The canvas shows the bars of the current reading, once per frame, while the audio runs.
- The canvas shows the idle state and its text while there is no signal.

## Dependencies

- `playback` (consumes): the signal at the master output and the state of the audio context.
- `panels` (consumes): the container that holds the spectrum, its size and whether it is folded.

## Open questions

- **OQ-SPC-001 — What does the spectrum show after the transport stops?**
  - Why it is still open: after the first gesture the audio context keeps running. A stopped
    transport gives bins at 0, so the canvas shows an empty strip and not the idle state. That is
    the ambiguous flat image the idle state exists to avoid.
  - Decides: the repository owner.
  - Blocks: nothing. It may change `BR-SPC-003` or `BR-SPC-011`.
- **OQ-SPC-002 — Does the spectrum read while its panel is folded?**
  - Why it is still open: folding hides the canvas but keeps the loop, so a hidden canvas reads
    and draws once per frame. No decision weighs this cost against a restart on unfold.
  - Decides: the repository owner.
  - Blocks: nothing.
