# Implementation Roadmap

## Delivery strategy

Build vertical slices that are playable, audible, testable, and demoable.

Do not build all rendering first and all audio later. The first milestone must already contain one synchronized orbit and one audible pattern.

## Milestone 0 — Repository and contracts

### Goal

Create a clean project skeleton and formalize the boundaries between domain state, audio, scene, UI, and persistence.

### Deliverables

- Vite, React, and strict TypeScript scaffold
- Lint, format, typecheck, unit test, and build commands
- Initial folder structure
- Core composition types
- Seeded PRNG utility
- Basic state store
- Placeholder application shell
- Decision log updated with exact dependencies

### Stopping condition

The application loads, all repository commands pass, and no audio or Three.js runtime object exists inside serializable state.

---

## Milestone 1 — One planet, one loop

### Goal

Prove precise audio-visual synchronization with the smallest useful vertical slice.

### Deliverables

- Audio unlock flow
- Global transport
- One beat planet
- One circular 16-step pattern
- Tone-based scheduling
- Three.js star, orbit, and planet
- Planet position driven by transport time
- Pattern node flashes driven by scheduled events
- Play, pause, stop, and tempo
- Basic mobile canvas sizing

### Stopping condition

The same one-bar beat loops stably while the planet and node pulses remain synchronized during deliberate render slowdowns.

---

## Milestone 2 — A complete safe groove

### Goal

Create an immediately good-sounding four-bar system.

### Deliverables

- Beat, bass, chords, melody, and texture roles
- Star mood presets
- Safe Harmony
- Progression library
- Role-aware rhythm generation
- Automatic mix guardrails
- Add, select, mute, solo, duplicate, and delete planet
- Quantized orbit shells
- Pattern phase rotation
- Energy, density, groove, and space macros
- Undo and redo

### Stopping condition

A generated seed creates a coherent multi-track groove, and a beginner can make meaningful edits without opening an advanced panel.

---

## Milestone 3 — Cosmic rhythmic ecosystem

### Goal

Deliver the distinctive celestial interactions.

### Deliverables

- Moons attached to parent planets
- Moon behavior presets
- Ring sequencer with removable segments
- One asteroid belt with seeded irregular percussion
- Clear visual triggering for all object types
- Object limits and disposal
- Focus View for precise pattern editing

### Stopping condition

Planets establish the composition, moons embellish it, rings provide regular pulse, and the asteroid belt adds visibly irregular texture.

---

## Milestone 4 — Product workflow

### Goal

Turn the prototype into a usable creative app.

### Deliverables

- First-run onboarding
- Mood selection
- Recommended starter system
- Responsive portrait and desktop UI
- Accessible HTML object list
- Keyboard navigation
- Reduced motion and particle options
- Local save library
- Seeded full-system generation
- Lock and regenerate
- Shareable encoded state
- Project naming and duplication

### Stopping condition

A new user can enter, create, save, reload, regenerate unlocked parts, and open a shared system on a phone-sized viewport.

---

## Milestone 5 — Export and reliability

### Goal

Make creations useful outside the app and harden core behavior.

### Deliverables

- Offline WAV export
- Multitrack MIDI export
- JSON export fallback
- Export dialog and progress
- Error handling for audio, storage, share, and export failures
- Schema validation and migration foundation
- Determinism tests
- Music constraint tests
- Critical Playwright flows

### Stopping condition

A saved system exports valid WAV and MIDI files, reloads identically, and survives tested error paths without data loss.

---

## Milestone 6 — Submission polish

### Goal

Make the application memorable, understandable, and presentable.

### Deliverables

- Five authored showcase systems
- Refined audio mix
- Quality profiles
- Adaptive mobile performance
- Scene polish and pooled effects
- Help and tooltips
- Loading and empty-state polish
- Demo route or reliable presentation sequence
- Production deployment
- Final accessibility and device pass

### Stopping condition

The deployed app completes the full first-minute promise on desktop and physical mobile hardware.

## Nine-day build sequence

### Day 1

Milestone 0 and the beginning of Milestone 1.

Focus:

- Scaffold
- Data contracts
- Audio unlock
- Transport
- Empty Three.js scene

### Day 2

Complete Milestone 1.

Focus:

- One beat planet
- Scheduler
- Visual orbit phase
- Event pulses
- Timing stress test

### Day 3

Begin Milestone 2.

Focus:

- Harmony
- Five roles
- Pattern templates
- Sound voices
- Complete generated groove

### Day 4

Complete Milestone 2.

Focus:

- Planet editing
- Orbit shells
- Macros
- Mix safety
- Undo and redo

### Day 5

Milestone 3.

Focus:

- Moons
- Rings
- Asteroids
- Focus View

### Day 6

Milestone 4.

Focus:

- Onboarding
- Responsive UI
- Save and load
- Seed and lock workflow
- Share format

### Day 7

Milestone 5.

Focus:

- WAV
- MIDI
- Validation
- Tests
- Failure paths

### Day 8

Milestone 6.

Focus:

- Mobile performance
- Accessibility
- Presets
- Audio mix
- Visual polish

### Day 9

Ship.

Focus:

- Physical-device testing
- Bug fixing
- Production deployment
- Demo capture
- Submission material
- No speculative new systems

## Daily triage rule

At the end of each day, classify remaining work:

- Required for the central promise
- Required for a stable submission
- Valuable polish
- Stretch
- Cut

Never carry a stretch feature forward while a core flow is broken.

## Parallel Codex work

Parallel tasks are safe only when boundaries are clear.

Good parallel branches:

- Pure harmony and generation logic
- Three.js object prototypes
- Audio preset content
- UI component shells
- Test fixtures
- MIDI exporter

Avoid parallel changes to:

- Canonical composition schema
- Transport and scheduler contract
- Shared state store
- Main scene reconciliation
- Save format

Merge architectural contracts before spawning parallel implementation tasks.
