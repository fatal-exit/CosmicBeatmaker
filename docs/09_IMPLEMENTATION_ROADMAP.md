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
- Quantized orbit rates with derived unique spatial lanes
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

---

## Milestone 7 — Visual Material & Interaction Polish

### Goal

Give the existing instrument a richer, coherent material identity and clearer tactile response without changing its musical model, interaction hierarchy, or mobile performance baseline.

### Status

Milestone 7 is delivered in checkpoint `6474aee`, with an additional accessible planet-destruction microinteraction in the following polish revision. It includes the procedural materials, glow, microinteraction, orbit-gate, rhythm-preset, transport-aligned spawn, camera-navigation, and live deterministic macro-derived pattern scope. Format, typecheck, lint, unit, build, E2E, and deployed-browser acceptance checks passed.

Physical iOS and Android performance and listening checks remain an unverified release task. Mobile viewport automation supports interaction and rendering acceptance but does not establish physical-device frame rate, thermal behavior, touch latency, or audio quality.

### Deliverables

- Custom `ShaderMaterial` planet surfaces with a distinct visual vocabulary for beat, bass, chords, melody, and texture roles
- Custom star surfaces whose color, motion, and pattern parameters distinguish each authored mood preset
- Stable seed-derived surface parameters that survive save, share, reload, and deterministic regeneration
- Selective additive bloom-like glow shells for the star and a small set of state-significant scene accents, with no full-screen post-processing bloom pass
- Low, balanced, and high shader variants that preserve object and transport-state legibility while reducing fragment cost, motion, and glow work
- Reduced-motion and reduced-flash behavior that removes decorative shader animation and attenuates pulses without hiding selection, mute, solo, lock, or playback state
- Restrained, state-driven DOM microinteractions for actions such as selection, button activation, panel changes, saves, and exports
- Live deterministic, role-safe pattern derivation from energy, density, groove, space, and complexity without destructively rewriting the canonical pattern
- Visible orbit gates projected from each planet and moon pattern. Their resting positions use deterministic step and phase data; each admitted occurrence then corrects its exact gate to the scheduler's swing- and humanize-adjusted audio tick, including events created by macro projection or common rhythm presets
- Simple common-rhythm preset choices for fast gate layouts, with step-level gate customization through the existing Focus View pattern editor
- An exact gate-collision pulse keyed by canonical event ID and scheduled audio-clock tick rather than render-frame intersection tests
- Audio-clock spawn alignment that places a planet added during playback at its transport-derived position in the active super-loop instead of restarting its visual orbit
- A transient highlighted spawn marker at the newly added planet's computed orbit position, adapted for quality, reduced-motion, and reduced-flash preferences
- Semantic 44-by-44 CSS-pixel Zoom out, Reset view, Zoom in, Rotate left, Rotate right, Tilt up, and Tilt down controls available in desktop and mobile layouts
- Zoom constrained to 60–180 percent through buttons, pointer wheel, or touch pinch, plus bounded empty-space horizontal rotation and vertical tilt that do not steal selected-object gestures
- Renderer-owned camera orientation, tilt, and zoom with an aspect-aware deterministic reset view and no composition-state, history, save, or share fields
- Visual regression coverage for representative roles, star presets, gate patterns, quality profiles, and reduced-motion states

### Acceptance

- All five planet roles remain distinguishable by surface pattern or form response, not color alone, at the portrait phone viewport.
- All five star mood presets have visibly different shader identities while keeping orbit lines, pattern nodes, and the current playhead readable.
- Opening the same saved or shared composition reproduces the same static surface identity; animation time does not enter seeded generation or serialized state.
- Regenerating one unlocked object derives its new surface deterministically while leaving locked and unrelated objects' surface identities unchanged.
- Low quality uses no full-screen post-processing and attenuates optional glow and shader detail while preserving every musical and editing state cue.
- Reduced motion stops continuous decorative surface movement, and reduced flash limits trigger intensity; neither setting removes the visible cause of an audible event.
- UI microinteractions are triggered by explicit application state, do not delay input, have no essential motion-only meaning, and settle to a stable state.
- The same canonical pattern and macro values always produce the same bounded, role-safe live event projection. Audio scheduling and orbit gates consume that same projection, repeated macro changes do not accumulate drift, and undo or redo restores the exact derived result.
- Each visible planet gate maps one-to-one by ID to a canonical pattern event. Choosing a common rhythm preset replaces those canonical events, and adding, moving, or removing a step in Focus View updates the same gates and audio schedule through the existing undoable command path.
- At every admitted compiled occurrence, the matching gate is corrected to the planet or moon's audio-clock-derived phase at the occurrence's swing- and humanize-adjusted scheduled tick, modulo one turn. Each admitted occurrence produces exactly one pulse at that matching gate; a probability-rejected occurrence produces no pulse. Resting gates remain a deterministic nominal preview, and geometric collision detection or render frames never decide whether an event occurs.
- Adding a planet during each bar and at fractional positions of the active super-loop places it at the phase computed from the current audio transport tick within one rendered frame; it does not visibly start at orbit phase zero unless the transport-derived position is zero.
- The spawn marker appears at that computed position, remains bounded to one short-lived runtime effect per addition, and becomes a static low-intensity highlight when reduced motion or reduced flash requires it.
- Save, share, reload, undo, and redo contain no gate-runtime state, spawn marker, wall-clock timestamp, or runtime transport tick. Existing canonical pattern, orbit, composition-length, and seed data remain sufficient, so this milestone adds no schema field.
- In automated desktop and mobile browser stress scenarios, touch feedback, scene-resource lifecycle, and audio-independence checks pass without WebGL compilation, rendering, or console errors.

### Camera navigation acceptance — complete

- Desktop and mobile expose semantic buttons with the accessible names Zoom out, Reset view, Zoom in, Rotate left, Rotate right, Tilt up, and Tilt down; each remains keyboard operable and meets the 44-by-44 CSS-pixel touch target.
- The buttons apply bounded increments across the 60–180 percent zoom range, and Reset view restores the aspect-appropriate default angle and zoom without changing selection, playback, or composition state.
- Pointer-wheel and pinch gestures zoom within the same 60–180 percent bounds as the buttons. Dragging empty scene space rotates and tilts the constrained camera, while dragging a selected planet continues to edit that planet and never changes the camera.
- Camera input produces immediate feedback. Reduced motion removes animated camera interpolation without disabling any control or gesture.
- Camera orientation, tilt, zoom, gesture state, and reset state remain renderer-only and are excluded from composition history, undo, save, share, JSON export, and schema migrations.
- Desktop and mobile automated-browser coverage verifies the semantic buttons, wheel zoom, aspect-aware reset, and the unobstructed guided flow; pure unit coverage verifies bounded pinch, rotation, and tilt math, while real-browser review verifies empty-space camera movement and a clean console.
- At the 390-by-844 phone viewport, the corrected coachmark remains readable without obstructing the camera controls.

### Scope boundary

This milestone does not add procedural terrain simulation, a full-screen compositor, a parallel gate sequencer, new musical behavior, a new top-level creative-control hierarchy, or new runtime dependencies. Rhythm presets and Focus View continue to edit the existing canonical pattern model; gates and spawn markers are scene projections only. Camera navigation is an accessible renderer control surface and never becomes composition data.

### Implementation stopping condition — complete

The milestone stops when the primary re-verification confirms that the five showcase systems retain their role and star-preset identities; seeded surfaces remain stable; deterministic macro projections drive both audio and gates without mutating canonical patterns; preset and Focus View gates remain exact; transport-aligned spawning and camera navigation retain their tested behavior; renderer-only state stays out of serialization and history; low-quality and reduced-motion modes retain all musical state cues; and the complete quality suite and real-browser WebGL review remain green without adding a post-processing pipeline.

### Checkpoint and release tasks still open

- Complete primary re-verification after the review fixes.
- Inspect and publish the resulting coherent repository checkpoint, deploy it, and smoke-test the deployed application.
- On physical iOS and Android devices, verify listening quality, touch response, thermal stability, and the documented 30 FPS minimum during normal editing.
- Reconfirm that physical-device visual frame drops do not affect audio scheduling before marking release acceptance complete.

---

## Milestone 8 — First-Party Sample Pack Pilot

### Goal

Prove a small authored sample pack can be processed repeatably, delivered efficiently, and used safely in live playback without risking startup sound, deterministic exports, repository size, or future content growth.

### Status

The 20-user-authored-asset pilot, generated manifest, processor, runtime mappings, lazy Tone playback, playback envelopes, and synth fallback are delivered in checkpoint `6474aee`. Repository and deployed-browser verification passed. Physical-device listening has not been completed.

### Deliverables

- A repeatable `scripts/process-samples.mjs` processor that recursively discovers WAV inputs, derives stable collision-checked IDs, regenerates a manifest, and removes stale outputs
- Explicit rerun prerequisites: `ffmpeg`, `ffprobe`, and Xiph `oggenc` on `PATH`
- Terminal-silence trimming only for at least 120 ms below -60 dBFS, with 30 ms retained after the audible tail and internal or authored reverberant space preserved
- No processor gain or normalization and no mutation of raw input WAVs
- Stereo 48 kHz Ogg Vorbis quality-5 delivery for all 20 current user-authored assets, encoded through Xiph `oggenc`
- A committed 20-entry authored-pilot manifest with stable URLs plus source, output, processing, level, license, authorship, and per-sample attack/release metadata
- Near-immediate attack for punchy transients, optional subtle fade-in for softer or style-dependent samples, and release before the file boundary for the 2.182-second long assets
- Lazy Tone sample playback for active live presets with an event-for-event synthesized fallback while loading or after fetch, decode, or trigger failure
- Existing synth-only offline WAV rendering and canonical MIDI export preserved unchanged
- Ignored, uncommitted raw WAV inputs and a processor that accepts future files without a hard-coded inventory

### Acceptance

- Running `npm run samples:build` with the three prerequisite tools available discovers the current user-authored WAV inputs in stable order and produces exactly 20 `.ogg` files plus a 20-entry schema-versioned authored manifest before any later procedural merge.
- Every generated asset decodes as stereo 48 kHz Ogg Vorbis quality 5, has a unique stable ID and base-path-safe URL, and is represented once in the runtime manifest and a live sound-preset mapping.
- The processor trims only terminal silence meeting the 120 ms and -60 dBFS policy, retains 30 ms after the audible tail, and preserves internal gaps, short endings, and identified long or reverberant tails.
- No processing step applies gain or normalization. Manifest level metadata supports review of the source and decoded output without treating lossy-codec peak movement as normalization.
- Raw source WAV hashes and contents remain unchanged, `sample inputs/` remains ignored, and no raw WAV enters the checkpoint diff.
- Manifest envelope metadata keeps punchy transients at near-immediate attack, allows restrained fade-in only where the sample style calls for it, and releases every 2.182-second asset before its file boundary. The six new lead filenames containing `short` remain 2.182 seconds because no terminal silence qualified for trimming; playback release still prevents a hard boundary stop.
- Live playback loads only active sample voices after audio unlock. A not-yet-ready or failed sample uses synthesis for the same scheduled occurrence rather than dropping the event.
- Offline WAV rendering remains synth-only, and MIDI output remains on the existing deterministic compiled-note path; sample availability cannot change either export.
- Adding a future WAV and rerunning the processor yields a stable new asset and manifest entry without modifying discovery code; ID collisions fail clearly, and deliberate runtime preset assignment remains reviewable.

### Scope boundary

This pilot does not add a sample marketplace, user sample import, stems, sample-based offline rendering, automatic loudness normalization, destructive raw-audio editing, or a large preload. It validates a small first-party live palette and a scalable content pipeline while synthesis remains the safety and export baseline.

### Stopping condition

The primary agent reruns the processor and complete repository quality suite, confirms the 20 user-authored outputs and manifest policy, exercises lazy load and failure fallback, verifies WAV and MIDI regressions remain green, confirms no raw WAV is tracked, and reviews live sample playback without clipped or missing events. Only then may the checkpoint be committed and pushed for deployment; physical iOS and Android listening remains a separate release task.

## Milestone 9 — Exact Polymeter & Unique Orbit Lanes

### Goal

Let simple loops and deeper polymeters coexist without breaking the beginner metaphor: a planet's orbit rate must be the same period users see and hear, planets must remain spatially distinct, and live/export playback must end only on a complete synchronization boundary.

### Deliverables

- One data-driven rate catalog containing exactly 0.25, 0.5, 1, 1.5, 2, 3, 4, 6, and 8 bars
- Exact quarter-bar integer LCM math, including the canonical four-bar harmony phrase, with a maximum supported 24-bar super-loop
- One `loopBars` source for musical scheduling, visible angular phase, interaction choices, save/share, WAV, and MIDI
- A bounded live scheduler that repeats complete super-loops without scheduling an unbounded future timeline
- Unique per-planet spatial lanes ordered by rate and stable composition identity, including adjacent distinct lanes for duplicate rates
- Camera fit/zoom independent from rate, with essential silhouette outlines retained at expanded zoom and optional glow still quality-dependent
- A mobile-first semantic rate control with four familiar choices immediately visible and the deeper ¼-, 1½-, 3-, 6-, and 8-bar choices progressively disclosed
- Inspector copy explaining that rate changes both the visible orbit period and musical pattern period, plus the derived system synchronization length
- WAV and MIDI export defaulting to one complete super-loop, with 1×, 2×, and 4× whole-loop choices and exact bar/duration copy
- Browser coverage proving a 3-bar orbit alongside a 4-bar orbit produces a visible 12-bar sync and 12-bar default export
- Schema-version-1 contract updated in place for the early test build, with old shared-shell compatibility explicitly not guaranteed

### Acceptance

- The catalog round-trips and validates every supported rate while rejecting values outside it.
- Returning from a 1.5- or 3-bar rate to an ordinary rate restores the corresponding 16- or 32-step detail tier without changing surviving event IDs or steps.
- Integer timing proves 3 + 4 → 12 bars, 6 + 8 → 24 bars, fractional rates exactly divide the shared PPQ timeline, and no supported composition exceeds the 24-bar limit.
- Live playback, visual phase, probability indexing, WAV, and MIDI use the same derived boundary; repeated exports are whole super-loops rather than arbitrary four-bar slices.
- Every planet has a distinct orbit radius. Planets with the same rate occupy neighboring lanes and never share or cross the same path; reloading the same composition preserves deterministic lane ordering.
- Rate changes do not change camera state. Auto-fit and bounded user zoom keep the outer lane usable, and essential object outlines remain legible without depending on bloom.
- All semantic rate and export controls are keyboard reachable, expose selection state, and provide at least 44 by 44 CSS-pixel targets.
- Desktop Chromium and the Pixel 7 profile can select a 3-bar rate, see the 3-bar label and 12-bar sync, and open an export panel defaulted to one 12-bar super-loop.

### Scope boundary

This milestone does not add arbitrary decimal rates, user-authored time signatures, song arrangement, independent moon-rate controls, audio stems, or a free-fly camera. A four-bar harmonic phrase remains the composition default; the derived super-loop is its polymetric repetition boundary, not a linear song length.

### Stopping condition

The primary agent reviews the complete diff; runs format, typecheck, lint, unit tests, production build, and the critical E2E suite; verifies the 3 + 4 and 6 + 8 acceptance cases; checks unique lanes and outline legibility at phone and desktop sizes; then commits and pushes the coherent checkpoint and monitors the Pages smoke test. Physical iOS and Android timing, zoom, and listening checks remain separate release tasks.

## Milestone 10 — Procedural Runtime Sample Cache

### Goal

Move the remaining computationally heavier live synth patches to compact, deterministic cached audio while retaining the synth engine as a reliable loading/error fallback and the offline-render baseline.

### Status

The renderer has produced 41 procedural Ogg assets and merged them with the 20 user-authored assets into a 61-entry manifest. Runtime mappings cover the four rendered drum kits, rendered chord and texture voices, and ring/asteroid percussion. A baked sample that is ready before its first event avoids constructing the fallback synth graph; a loading-time graph becomes idle after readiness and is retained only until normal voice disposal so scheduled events remain safe. Two complete rebuilds produced the same digest, and format, typecheck, lint, unit, and production-build checks pass. Physical-device listening remains pending.

### Deliverables

- A dependency-free `scripts/render-procedural-samples.mjs` renderer invoked with `npm run samples:render`, and automatically after the default authored `npm run samples:build` stage
- A transactional `scripts/build-samples.mjs` orchestrator that builds outside `public/`, accepts future authored inventory growth, validates the whole pack, and rolls back both pack and runtime inventory on promotion failure
- Deterministic 48 kHz PCM16 synthesis keyed by stable definition/channel IDs and synthesis version, followed by fixed Ogg Vorbis quality-5 encoding arguments
- 28 drum assets spanning four style families and seven voices each: eight mono low transients and 20 baked stereo upper-percussion replacements, plus two stereo and two mono auxiliary assets
- Eight baked stereo C4 tonal/texture replacements and one stereo C2 drone, with runtime transposition from their declared roots after integration
- A merged 61-entry manifest that retains the 20 authored outputs and records procedural synthesis version, channels, levels, envelope metadata, and a fixed-gain peak policy
- A generated TypeScript runtime inventory refreshed from the same 41 definitions
- Lazy sample loading after audio unlock with synth fallback constructed only when loading, fetch, decode, or trigger state requires it

### Acceptance

- Starting from the 20-entry authored manifest, running `npm run samples:render` with `ffmpeg`, `ffprobe`, and Xiph `oggenc` available produces exactly 41 procedural Ogg files and a 61-entry merged manifest.
- Repeating the render under the same renderer and codec toolchain preserves stable IDs, inventory, channel counts, synthesis-version metadata, and encoded output.
- The procedural set contains exactly 10 mono low/percussion assets and 31 stereo assets, including 30 spatialized replacements; all decode as 48 kHz Ogg Vorbis and remain below the encoded peak safety threshold.
- Every spatial replacement records a Legacy Dry source label and distinct source ID, while the corresponding Legacy Dry asset/file is absent from the complete pack.
- The tonal cache uses C4 (MIDI 60) for eight assets and C2 (MIDI 36) for the low drone; preset mappings transpose from those roots rather than baking composition notes into the files.
- Runtime integration maps every intended remaining live patch without changing composition schema, timing, or preset IDs. Until an asset is ready, and after any sample failure, the same scheduled event uses the prior synth implementation.
- A sample that is ready before its first event constructs no fallback synth. A loading fallback stops receiving events after readiness but remains valid until voice disposal so lookahead-scheduled notes cannot be disconnected prematurely.
- The authored processor still rebuilds its 20 inputs independently, and the procedural renderer never mutates or reclassifies those raw masters.
- The canonical complete build discovers the authored count dynamically; adding a twenty-first source does not require a builder code change.
- Offline WAV remains on the deterministic synth renderer and MIDI remains sample-independent unless a later recorded decision explicitly changes that boundary.

### Scope boundary

This milestone does not add user sample import, a sample marketplace, streaming, stems, sample-based offline WAV rendering, or runtime procedural synthesis. It caches first-party patch definitions as build artifacts and preserves existing fallback behavior.

### Stopping condition

The primary agent reruns both asset commands and the complete repository quality suite; verifies the exact 20 + 41 inventory, manifest/runtime alignment, C-root transposition, loading and forced-failure fallback, base-path URLs, and no-clipping policy; performs desktop and mobile listening review; then commits and deploys the coherent checkpoint. Physical iOS and Android listening remains a separate release task.

## Milestone 11 — Desktop High Detail Rendering

### Goal

Make the optional desktop presentation tier materially richer, give mobile a lighter atmospheric backdrop, and keep the phone-first audio clock, interaction model, and serializable composition unchanged.

### Deliverables

- Wide-desktop Auto selection that also recognizes high-DPI PC and Mac displays, plus the existing explicit quality selector
- Denser High-only planet and star geometry
- Seeded role-specific procedural terrain normals layered over the existing displaced planet surfaces
- Planet illumination colored by the active star preset
- A restrained Three.js High-only bloom compositor with explicit render-target disposal
- A seeded High-only deep-space shader with sparse star layers, domain-warped multi-scale nebula filaments, dust lanes, knots, and compact spiral-galaxy profiles
- A separate inexpensive Low/Balanced sky shader with broad seeded wisps and one sparse star layer, but no High-only FBM, filament, galaxy, or bloom work
- Reduced-effects attenuation, clean Low/Balanced fallback, and no new runtime dependency or composition-schema field

### Acceptance

- A 1440-pixel-wide desktop viewport in Auto renders High, including at device-pixel ratio 2; a 390-by-844 phone viewport in Auto renders Low with the lightweight backdrop but without bloom or the detailed deep-space shader.
- The active star surface remains detailed under bloom rather than becoming a featureless glare source.
- Planet terrain reads through both color and normal-shaped light, and the lit side takes on the active star's color.
- The background shows layered filament, dust, star, and galaxy structure without reducing orbit, planet, gate, or inspector readability.
- Switching repeatedly between High and lower profiles leaves one bounded scene, releases compositor targets, preserves camera and composition intent, and produces no WebGL or console errors.
- Audio scheduling and audible-event causality remain independent from renderer frame time and visual quality.

### Scope boundary

This milestone does not add terrain simulation, physical shadow maps, WebGPU, composition-state lighting, user-authored environment controls, or mobile post-processing. Mobile receives only the bounded simple sky material; the detailed effects remain in the renderer-owned High option.

### Stopping condition

Format, typecheck, lint, unit tests, production build, and critical E2E pass; real-browser desktop High and phone Auto captures are inspected; profile switching and the console remain clean; and any remaining physical-device performance risk is reported without claiming it verified.

## Milestone 12 — Accessible Sound Library & Local Sample Import

### Goal

Expose the variety already present in the first-party pack, make safe variation an obvious creative action, and allow bounded device-local sample personalization without changing the canonical composition or export contracts.

### Deliverables

- One labelled selected-planet sound control with the active star's recommendations, the remaining role-compatible built-ins, descriptions, and local user sounds
- An undoable `SetPlanetSoundPreset` command that preserves the planet pattern and orbit and keeps tonal rings on the parent voice
- Deterministic planet and whole-system Surprise actions that advance generation revision, respect locks, and choose only existing role-safe palettes
- A dedicated local IndexedDB sound library containing Blob assets and stable IDs outside composition/share state
- Partial seven-slot user drum kits whose empty or failed slots retain event-for-event synth fallback
- Bounded tonal sample import for bass, chords, melody, and texture, with normalized-autocorrelation source-note analysis and manual correction
- Runtime registration through the existing lazy decoded-buffer cache, event ownership, overlap budgets, track strips, and synth fallback
- Explicit copy that custom live audio is device-local; offline WAV remains synth-rendered and MIDI remains sample-independent

### Acceptance

- Every role exposes at least three described built-in sound choices through semantic HTML on desktop and phone layouts.
- Selecting a different sound changes `soundPresetId` without rewriting rhythm, pitch intent, orbit, or stable IDs; undo and redo restore the exact voice.
- A short monophonic C-rooted fixture is detected as C within one semitone, the user can correct the result, and the imported sound becomes immediately selectable and playable.
- A beat kit can contain any non-empty subset of labelled slots, and an empty/missing/failed slot produces the safe synth occurrence rather than silence or disabling other loaded slots.
- Custom Blob data never enters composition JSON, share URLs, MIDI, history, or the first-party manifest. A save on the same device can resolve its stable local sound ID; another device falls back safely.
- Format, typecheck, lint, unit tests, production build, and critical browser flows pass without a new runtime dependency.

### Scope boundary

This milestone does not add a sample marketplace, cloud sync, destructive editing, timestretching, multisample mapping, automatic key detection for polyphonic material, sample-based offline WAV, stems, or custom audio inside share links. Pitch analysis targets short monophonic tonal sources and always exposes manual correction.

### Stopping condition

The primary agent verifies built-in sound switching, one tonal import, one partial drum kit, deterministic Surprise and undo behavior, local reload/fallback copy, and the complete repository quality suite. Physical-device listening and storage-quota behavior remain release checks.

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
- Orbit rates and unique spatial lanes
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
