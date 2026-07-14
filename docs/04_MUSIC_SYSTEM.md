# Music System

## Musical objective

The system must make coherent loop creation highly likely without removing meaningful choice.

Random generation is not sufficient. Each role uses curated musical grammar, controlled variation, register constraints, and mix rules.

## Global composition model

Default composition:

- 4/4 time
- One canonical four-bar harmony phrase
- Planet orbit periods of 0.25, 0.5, 1, 1.5, 2, 3, 4, 6, or 8 bars
- One derived active super-loop, bounded to 24 bars for the supported catalog
- Tempo range: 70–140 BPM
- Global swing: 0–60%, with a safer default range of 0–30%
- One harmonic progression per system
- Role-based tracks
- Quantized event scheduling
- Optional seeded humanization within strict bounds

## Musical hierarchy

| Celestial element | Musical function                                      |
| ----------------- | ----------------------------------------------------- |
| Star              | Mood, harmony tendency, sound palette, master effects |
| Planet            | Primary musical track                                 |
| Orbit             | Visible and musical period plus pattern phase         |
| Active nodes      | Notes or hits                                         |
| Moon              | Parent-linked embellishment or secondary motif        |
| Ring              | Regular rhythmic subdivision or modulation            |
| Asteroid belt     | Humanized probabilistic percussion                    |
| Comet or flare    | Optional transition or fill                           |

## Star presets

Star types are data-driven preset bundles, not separate audio engines.

### Radiant

- Bright, balanced, melodic
- Major pentatonic tendency
- Clean drums, warm bass, clear plucks
- Moderate reverb and saturation

### Red Giant

- Warm, slow, spacious
- Major or minor pentatonic
- Soft percussion, pads, drones, rounded bass
- Longer release and reverb

### Dwarf

- Delicate, intimate, precise
- Pentatonic or suspended harmony
- Small percussion, bells, short plucks
- Lower density

### Neutron

- Fast, mechanical, syncopated
- Minor pentatonic or Dorian
- Metallic percussion, pulse bass, sequenced synths
- Tighter effects and stronger rhythmic gating

### Void

- Dark, sparse, atmospheric
- Minor pentatonic or carefully constrained chromatic color
- Sub bass, textured impacts, drones, filtered percussion
- Large negative space

## Safe Harmony

Safe Harmony is enabled by default.

### Beginner-facing controls

- Mood
- Brightness
- Stability
- Root feeling:
  - Higher
  - Lower
  - Randomize safely

### Internal rules

- Melody defaults to major or minor pentatonic.
- Strong beats prefer chord tones.
- Weak beats may use scale tones.
- Bass favors roots, fifths, octaves, and rare diatonic approach notes.
- Chord voicings use limited voice leading and avoid crowded low registers.
- Chord planets expose Closed, Open, and Wide voicing positions. Wider positions separate the root, fifth, and upper chord tones across octaves rather than stacking them in the low-mid register.
- Chord complexity moves continuously from a triad through a safely doubled layer to a separated color tone. Safe Harmony keeps every added tone diatonic and avoids adjacent clusters.
- Melody pitch variety controls how many scale positions a motif may visit without changing its rhythm.
- Melody contour deterministically projects the motif upward, downward, or in an alternating rise-and-fall shape.
- Texture parts are pitch-constrained or atonal but low in prominence.
- Notes are transposed rather than invalidated when harmony changes.
- Safe mutation changes one musical dimension at a time where possible.

### Initial progression library

Use mood labels in the main UI and theory labels in advanced UI.

- Bright: I–V–vi–IV
- Hopeful: I–vi–IV–V
- Reflective: vi–IV–I–V
- Driving: i–VII–VI–VII
- Dark: i–VI–III–VII
- Floating: I–Vsus–vi–IVadd9
- Minimal: I–IV or i–VI

The exact voicing implementation may simplify extended chord labels while retaining their character.

## Rhythm grammar

### Beat role

Generate from templates with controlled mutations:

- Four-on-the-floor
- Standard backbeat
- Half-time
- Broken beat
- Syncopated groove
- 3-3-2 pulse
- Minimal pulse
- Driving eighths

Rules:

- Preserve structural kick and backbeat anchors unless complexity is high.
- Density may add or remove ghost notes before removing anchors.
- Avoid placing every drum voice on the same steps.
- Cap simultaneous drum events.
- Use velocity hierarchy for primary hits, secondary hits, and ghosts.

### Bass role

Patterns should relate to kick placement and chord changes.

Rules:

- Root on important structural positions.
- Fifth, octave, or passing tone on secondary positions.
- Avoid excessive note overlap.
- Keep most notes within a curated register.
- Higher complexity may introduce anticipations and syncopation.

### Chord role

Patterns may be:

- Sustained
- Quarter-note pulse
- Offbeat stabs
- Half-time swells
- Broken chord
- Light arpeggio

Rules:

- Use chord changes from the global progression.
- Avoid low-register mud.
- Main chord-planet events resolve to the full selected voicing even when the stored pattern event carries a pitch intent; chord-ring arpeggios remain single-note events.
- Preserve space for melody.

### Melody role

Generate motifs rather than independent random notes.

Rules:

- Choose a short motif.
- Repeat with limited variation.
- Apply the selected pitch-variety range and contour at compile time so live playback and export share the same motif.
- Prefer chord tones on strong beats.
- Use contour limits to prevent extreme leaps.
- Keep rests.
- Avoid constant 16th-note activity at beginner density.

### Texture role

May use:

- Drone
- Noise pulse
- Granular-like sparkle
- Rhythmic ambience
- One-shot atmospheric events

Texture should remain quiet enough not to dominate unless explicitly raised.

## Orbit behavior

### Orbit rates and spatial lanes

The exact data-driven planet-rate catalog is:

- Quarter bar
- Half bar
- One bar
- One and a half bars
- Two bars
- Three bars
- Four bars
- Six bars
- Eight bars

The stored rate has one meaning: the planet completes one visible orbit and repeats its musical pattern in that period. The rate does not encode scene radius or camera scale.

Represent rates in exact quarter-bar units `[1, 2, 4, 6, 8, 12, 16, 24, 32]`. Include the four-bar harmony phrase in the integer least-common-multiple calculation for active audible sources. This produces the complete super-loop: 3- and 4-bar parts resynchronize after 12 bars, 6- and 8-bar parts after 24, and no supported catalog combination exceeds 24 bars.

Every planet receives a unique visual lane derived from rate order and stable composition order or ID. Duplicate-rate planets occupy neighboring lanes rather than sharing a path. Radial manipulation chooses a rate; lane placement is recalculated from the whole planet set. Camera fit and zoom remain renderer state, independent from rate.

### Pattern representation

A track stores:

- Loop length in bars
- Grid size
- Event list or active steps
- Phase offset
- Role-specific note data

When a planet changes to a 1.5- or 3-bar polymetric orbit, its pattern grid
must use 12 or 24 steps rather than 16 or 32. Preserve the current detail
tier by simplifying 16 steps to 12 and 32 steps to 24. Keep events that still
fit the shorter grid and deterministically omit overflow; if every event would
be omitted, wrap the earliest event into the new grid so the planet does not
become silent. Both supported polymeter grids divide each polymetric period
into a whole number of subdivisions per bar. When the planet returns to an
ordinary rate, expand 12 steps back to 16 and 24 steps back to 32. Preserve the
surviving event IDs and step positions; do not invent replacements for events
that were omitted, and keep the transformed pattern custom.

The planet completes one visual orbit per musical pattern loop. Live scheduling, orbit phase, WAV, and MIDI all consume the same rate and derived super-loop boundary.

### Pattern rotation

Moving a planet tangentially changes phase. This rotates all events without changing their internal spacing.

## Moons

A moon is bound to one parent planet.

Default limit: three moons per planet.

Moon types are behavior presets:

- Accent
- Echo
- Harmony
- Pickup
- Fill
- Counterpulse

Rules:

- Inherit parent harmony and instrument family.
- Operate at a quieter mix level.
- Use a related subdivision or longer cycle.
- Do not become a fully independent unrestricted track in beginner mode.
- Complexity and probability determine activity.

Examples:

- Bass moon: octave pickup every second loop
- Chord moon: upper chord tone on offbeats
- Beat moon: clap or rim accent
- Melody moon: short response motif

## Rings

A ring is segmented, legible, and interpreted through its parent planet's musical role. Every active segment retains one stable event ID so its audible event can flash the corresponding visible fragment.

Default behavior:

- 8 or 16 segments
- Active segments create hits or modulation pulses
- Rotating the ring changes phase
- Removing segments creates rests

Ring types:

- Closed hat
- Shaker
- Percussion tick
- Rhythmic gate
- Delay tap
- Filter pulse

Role-aware behavior:

- Beat and texture rings retain regular high-percussion pulses.
- Melody rings place short, quieter pitch-matched ghost notes immediately before or after nearby motif notes.
- Chord rings switch the parent from sustained chord hits to articulated single-note chord tones across active segments. The two modes never play on top of one another.
- Bass rings favor syncopated octave pickups, with a restrained occasional fifth for variation.

Controls:

- Density
- Phase
- Velocity variation
- Sound
- Probability, limited by default

Density changes the deterministic count and role-safe fill order of the stored active segments. It does not add hidden runtime events or replace the segment array with a second pattern.

## Asteroid belt

The belt is irregular and organic.

System limit: one belt in the MVP.

Controls:

- Population
- Clustering
- Turbulence
- Material
- Probability
- Accent chance

Musical implementation:

- Use seeded patterns, not physics collisions, as the authoritative source.
- Visual asteroid spacing should reflect the generated rhythm.
- Small timing humanization is allowed, but events remain scheduled from audio time.
- Occasional accent events may be generated at phrase boundaries.

## Macro transformations

Macros operate through bounded, role-aware transformations.

### Energy

- Increase velocity
- Add high-frequency layers
- Raise filter cutoff
- Strengthen visual reaction
- Add rhythm events at high settings

### Density

- Add or remove events while preserving anchors and motifs
- Increase moon and ring activity
- Reduce event count before reducing track count

### Groove

- Shift toward syncopated templates
- Increase swing within safe limits
- Add ghost notes and anticipations

### Space

- Increase note duration and effects
- Reduce conflicting density
- Widen stereo placement within mobile-safe bounds

### Complexity

- Increase pattern lengths
- Add motif variation
- Increase moon behavior
- Introduce probability and less obvious chord tones

## Mixing guardrails

- Per-role gain ranges
- Automatic headroom
- High-pass non-bass tracks where appropriate
- Low-pass or brightness bounds to reduce harshness
- Pan and width limits
- Master compressor or soft limiter
- Prevent export clipping
- Lower moon, ring, belt, and texture defaults than primary planets
- Voice limits per instrument and overall system

## Randomization rules

A seed must fully determine:

- Star preset
- Tempo
- Root and scale
- Progression
- Planet roles and sounds
- Patterns
- Moons
- Ring
- Asteroid belt
- Mix variation
- Visual variation

Generation order:

1. Choose star and mood.
2. Choose tempo and harmony.
3. Generate beat anchor.
4. Generate bass related to beat and harmony.
5. Generate chord rhythm.
6. Generate melody motif.
7. Add optional texture.
8. Add moons and rhythmic structures.
9. Apply mix balancing.
10. Validate density, register, event count, and variety.

If validation fails, regenerate only the failing layer using a derived seed.

## MIDI export mapping

- One track per planet
- Optional separate tracks for moons, rings, and asteroid belt
- Track names include role and sound
- Percussion uses a documented drum-note mapping
- Harmonic tracks preserve pitch, velocity, duration, and channel
- Tempo and time signature are written to the file
- Export defaults to one complete active super-loop and may repeat that whole boundary 1×, 2×, or 4×

## Musical definition of done

The music system is not complete until:

- At least 80% of tested random seeds produce a usable loop without manual repair.
- Harmony changes do not create invalid notes.
- Density changes preserve recognizable groove structure.
- Bass and chords avoid obvious low-register masking.
- Moons sound related to parents.
- Rings sound regular; belts sound organic.
- Exported MIDI reproduces the composition structure closely.
