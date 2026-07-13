# Product Requirements

## Release target

A polished Build Week web application that works well on desktop and modern mobile browsers, can create and edit one musical solar system, and supports a complete save-share-export loop.

## Core user journey

1. Open the app.
2. Tap to enter and unlock audio.
3. Choose a star mood or begin with a recommended system.
4. Hear a coherent starter loop.
5. Add or edit a planet.
6. Shape rhythm through an orbit, moon, ring, or asteroid interaction.
7. Adjust one or more plain-language macro controls.
8. Save or copy a share link.
9. Export audio or multitrack MIDI.

## MVP requirements

### A. Entry and onboarding

- **MUST** provide an explicit first interaction that starts audio.
- **MUST** explain the core metaphor in three actions or fewer.
- **MUST** offer a recommended starting system.
- **MUST** allow onboarding to be skipped.
- **SHOULD** remember whether onboarding has been completed.

### B. Musical system

- **MUST** support one global transport with play, pause, stop, and tempo.
- **MUST** default to a four-bar system.
- **MUST** provide five planet roles:
  - Beat
  - Bass
  - Chords
  - Melody
  - Texture
- **MUST** provide musically safe default harmony.
- **MUST** provide curated common rhythm templates.
- **MUST** support swing, density, energy, space, and complexity macros.
- **MUST** keep the audio schedule independent of rendered frames.
- **SHOULD** expose root, scale, and progression to advanced users.

### C. Celestial construction

- **MUST** provide a central star.
- **MUST** allow adding, selecting, muting, soloing, duplicating, and deleting planets.
- **MUST** show a circular representation of each pattern.
- **MUST** allow changing loop length through quantized orbit shells.
- **MUST** support moons as parent-linked embellishments.
- **MUST** support one ring per eligible planet for regular rhythmic texture.
- **MUST** support one asteroid belt for probabilistic percussion.
- **SHOULD** allow direct manipulation of active trigger nodes.
- **COULD** support comets, eclipses, flares, or conjunctions.

### D. Beginner safety

- **MUST** enable Safe Harmony by default.
- **MUST** use pentatonic or chord-tone-constrained melodic defaults.
- **MUST** constrain bass to musically useful low-register notes.
- **MUST** use automatic gain staging and master limiting.
- **MUST** prevent destructive edits from becoming irreversible.
- **MUST** provide undo and redo.
- **SHOULD** explain technical controls with plain-language labels or help text.
- **COULD** allow disabling safety constraints in an advanced mode.

### E. Generation and mutation

- **MUST** generate a complete system from a deterministic seed.
- **MUST** generate musically coherent parts by role rather than unrestricted random events.
- **MUST** allow users to lock at least:
  - Star and mood
  - Harmony
  - Individual planets
- **MUST** allow regeneration of the unlocked system.
- **SHOULD** allow regeneration of one selected object.
- **SHOULD** preserve human edits when unrelated parts are regenerated.

### F. Save and sharing

- **MUST** save compositions locally.
- **MUST** load, rename, duplicate, and delete local compositions.
- **MUST** serialize the complete composition into a versioned format.
- **MUST** provide a shareable URL or compact share code.
- **MUST** reproduce the shared composition deterministically.
- **WON'T** require accounts or a backend.

### G. Export

- **MUST** export a stereo WAV of a defined number of loops.
- **MUST** export a multitrack MIDI file with one track per musical role or planet.
- **MUST** name exported tracks clearly.
- **MUST** preserve tempo, note timing, duration, and velocity in MIDI.
- **SHOULD** export composition JSON.
- **COULD** export individual audio stems.

### H. Mobile and responsive behavior

- **MUST** work in portrait phone layout.
- **MUST** work in desktop landscape layout.
- **MUST** use touch targets of at least 44 by 44 CSS pixels.
- **MUST** avoid gestures that conflict ambiguously with camera control.
- **MUST** provide a quality selector.
- **MUST** remain usable with reduced motion enabled.
- **SHOULD** support landscape tablet layout.
- **COULD** be installable as a PWA.

### I. Accessibility

- **MUST** expose essential controls through semantic HTML.
- **MUST** support keyboard navigation for the DOM interface.
- **MUST** not rely on color alone.
- **MUST** label icons and controls.
- **MUST** provide a visible focus state.
- **MUST** provide a way to reduce particles and flashes.
- **MUST** provide a master stop and volume control.
- **SHOULD** provide text descriptions of selected celestial objects and their musical behavior.

## Content requirements

The release should contain at least:

- 5 star mood presets
- 5 musical roles
- 3 or more sound choices per role
- 6 or more rhythm templates
- 5 or more progression presets
- 4 or more scale/mode presets, with pentatonic defaults
- 5 polished full-system presets
- 12 or more seed-generated systems tested for variety and coherence

## Explicit cuts

Cut these before compromising timing, accessibility, or mobile stability:

1. Audio stems
2. Celestial event arrangement features
3. Binary star mechanics
4. Hardware MIDI
5. PWA installation
6. Complex synthesis panels
7. Eight-bar and unusual-time-signature systems
