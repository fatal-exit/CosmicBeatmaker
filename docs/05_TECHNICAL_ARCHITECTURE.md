# Technical Architecture

## Stack

### Application

- TypeScript
- Vite
- React
- CSS custom properties and scoped component styles
- No heavy component framework required

### 3D

- Three.js
- `WebGLRenderer` baseline
- Direct scene integration rather than React Three Fiber
- Instanced rendering for repeated ring, asteroid, star-field, and particle geometry
- Optional post-processing only in higher quality profiles

### Audio

- Tone.js
- Tone transport as the authoritative clock
- Tone instruments, samplers, effects, and offline rendering
- WAV encoder utility
- MIDI generation library such as `@tonejs/midi`

### State and testing

- Central serializable store
- Zustand or a small equivalent store adapter
- Explicit command history for undo and redo
- Vitest
- Playwright
- ESLint and Prettier

## Architectural principles

1. Audio scheduling is independent from rendering.
2. Composition data contains no Three.js or Tone.js runtime objects.
3. Runtime objects are derived from serializable state.
4. UI actions dispatch typed commands.
5. Seeded generation is pure and testable.
6. Exports use the same composition model as live playback.
7. Visual quality can degrade without changing musical behavior.
8. A failed visual effect must never disrupt the transport.

## High-level modules

```text
src/
  app/
    App.tsx
    routes/
    shell/
  state/
    store.ts
    commands.ts
    history.ts
    selectors.ts
  domain/
    composition/
    harmony/
    rhythm/
    generation/
    validation/
    serialization/
  audio/
    AudioEngine.ts
    TransportController.ts
    Scheduler.ts
    VoiceFactory.ts
    MixBus.ts
    OfflineRenderer.ts
    MidiExporter.ts
  scene/
    CosmicScene.ts
    SceneController.ts
    camera/
    picking/
    objects/
    effects/
    quality/
  ui/
    transport/
    onboarding/
    inspector/
    orbit-lab/
    harmony-lab/
    library/
    export/
    accessibility/
  persistence/
    LocalCompositionRepository.ts
    shareCodec.ts
    migrations.ts
  content/
    starPresets.ts
    soundPresets.ts
    rhythmTemplates.ts
    progressionPresets.ts
  tests/
```

## Application layers

### Domain layer

Pure logic only:

- Types
- Harmony calculations
- Rhythm templates and mutations
- Seeded generation
- Composition validation
- Serialization
- Migrations
- MIDI event preparation

No DOM, Three.js, Tone.js, or browser-storage dependencies.

The domain owns pure performance projectors for moon behavior, asteroid accents,
and celestial star relationships. They derive behavior from serializable state,
stable IDs, planet affinity, and the already-derived macro/expression pattern.
Moon behavior runs before the Black Hole half-speed and binary companion rhythm
relationship. Audio compilation and scene descriptors call the same projectors;
neither layer carries a private version of any transform.

### State layer

Responsibilities:

- Hold current serializable composition
- Hold ephemeral UI state separately
- Dispatch commands
- Maintain undo and redo history
- Expose derived selectors
- Coordinate save status

### Audio layer

Responsibilities:

- Unlock audio
- Build runtime voices from presets
- Schedule events ahead of playback
- Maintain transport state
- Apply live parameter changes safely
- Render offline audio
- Export MIDI

The audio layer subscribes to relevant state changes but does not own the canonical composition.

Black Hole systems insert one bounded shared processing rack before the limiter.
The rack supplies octave-down playback intent, restrained digital degradation,
and a larger reverb field. It is global to the star mood rather than one
expensive effect graph per planet, and offline rendering uses the same profile.
Other star moods remain effectively bypassed.

### Scene layer

Responsibilities:

- Create and maintain Three.js objects
- Interpolate visual positions from transport time
- Perform picking and gesture mapping
- Display scheduled event flashes
- Apply adaptive quality
- Own and dispose the High-only bloom compositor and quality-tiered procedural deep-space backdrops
- Never schedule audio

### UI layer

Responsibilities:

- Accessible DOM controls
- Onboarding
- Object creation
- Inspectors
- Macro controls
- Save, load, share, and export
- Device-appropriate layout

### Persistence layer

Responsibilities:

- Local save index
- Versioned composition storage
- Share encoding and decoding
- Migrations
- Downloadable JSON fallback

## Audio timing architecture

### Canonical clock

Tone transport time is canonical while playing.

For each animation frame:

1. Read the current transport position.
2. Convert musical position to normalized phase for each orbit.
3. Update visual transforms.
4. Render.

For audio:

1. Derive the active super-loop with exact integer least-common-multiple math over quarter-bar units, including the canonical four-bar harmony phrase.
2. Compile each active source into a bounded rate-cycle event template and register one repeating Tone transport callback per source; never expand a global super-loop into an unbounded future timeline.
3. Trigger voices at explicit audio times.
4. Emit lightweight visual-event messages with event IDs and scheduled times.
5. Let the scene display the corresponding visual pulse when transport time reaches that event.

Never detect a mesh crossing a visual marker and use that to trigger sound.

The same stored `loopBars` drives audio recurrence and visible angular phase. Spatial orbit lanes are a deterministic scene projection derived from rate order, stable planet order or ID, and role-derived visual envelopes for the body, gates, rings, and moons; they are not timing data. Each planet receives a unique lane, including duplicate-rate planets, and larger visual classes receive more clearance. Camera fit and user zoom remain independent renderer state.

### Current audio stability profile

Tone uses a balanced worker-clock context rather than minimum latency. Desktop scheduling uses 120 ms lookahead, a 30 ms update interval, and an 80 ms late-event threshold. Mobile detection uses 180 ms, 45 ms, and 120 ms respectively to tolerate main-thread stalls and browser power management.

The live scheduler registers one bounded source-cycle repeat per source. A cycle callback triggers only an event exactly on that boundary; every later event in the cycle remains owned by Tone Transport as a cancellable absolute-tick `scheduleOnce` registration until its own lookahead callback. During a live edit, events between the raw audible playhead and Tone's already-processed scheduling frontier are admitted directly at their exact audio-clock time, including events across a source-cycle boundary, while later events remain cancellable one-shots. The scheduler owns and revokes pending IDs, admits each `trackId:eventId` plus source-cycle occurrence once, revision-fences retained callbacks, and aborts registration synchronously if health trips. It skips late or duplicate callbacks and stops scheduling if it detects invalid time, timeline regression, more than 128 callbacks in 50 ms, 16 consecutive late callbacks, a 4,096-entry occurrence-ledger overflow, or four consecutive voice-trigger errors. Visual timeouts are separately bounded and may be dropped without dropping audio.

Tempo is a direct Tone Transport parameter and is deliberately absent from the structural schedule key. Mix-only changes update stable track strips, and unchanged master targets do not enqueue redundant parameter automation. For a structural edit, the scheduler revokes its future registrations and each compatible runtime voice retracts only event-owned attacks whose start time is still strictly ahead of the raw clock. Notes on or behind that boundary keep their isolated synth or sampler through the natural tail. Stable-ID voices, track strips, the transport epoch, and its output gate remain in place; a removed or preset-incompatible voice rejects new attacks and retires only after its active tails finish, while the replacement voice receives the newly compiled future events. Each live event handle and source-budget reservation is bounded and cancellable, with one cleanup timer per voice and two render quanta of disposal grace. Resolved sample URLs share one page-lifetime load/decode handle, so per-event samplers do not multiply fetch or decode work. Offline WAV export has no live-edit cancellation requirement and therefore uses one bounded shared synth graph per track rather than allocating a live event instrument for every occurrence in the complete render.

Output applies a 0.72 master-headroom factor before a -3 dB limiter. Pause and stop fade both master output and the isolated current generation to zero over 15 ms, clear every repeat and pending one-shot, synchronously remove that generation from trigger routing, and cancel pending visual events. Resume derives a clean schedule from the raw, non-lookahead audio-clock tick preserved by pause; stop rebuilds from tick zero. If the health guard trips, the scheduler performs the same fail-silent invalidation before pausing transport, and a later explicit play attempts a clean runtime rebuild. `App` generation-guards lazy engine creation, while `AudioEngine` rechecks disposal after a deferred unlock, so a Strict Mode unmount cannot leave an unowned audio graph. The failure path is audio-clock-only and fail-silent. `App` consumes the engine's health-failure callback so its transport state changes to paused and a recoverable toast explains that playback stopped safely. Deeper diagnostics and physical interruption recovery remain release-test work.

## Runtime synchronization

Use adapters:

- `CompositionToAudioRuntime`
- `CompositionToSceneRuntime`

Each adapter reconciles state changes by stable IDs.

Examples:

- Adding a planet creates an audio voice and scene object.
- Muting updates audio gain and scene appearance.
- Changing pattern updates future schedule and node visuals.
- Deleting disposes audio and graphical resources.

## State boundaries

### Serializable state

- Composition
- Preset choices
- Patterns
- Harmony
- Mix values
- Visual appearance parameters that affect sharing
- Seed
- Schema version

### Ephemeral state

- Current selection
- Open bottom sheet
- Hover state
- Pointer gesture
- Export progress
- Audio loading state
- Current quality profile
- High-only compositor targets and deep-space shader time
- Camera interpolation
- Active visual pulse list

Do not put Three.js vectors, materials, audio nodes, or browser handles into serializable state.

## Persistence

### Local saves

Use IndexedDB for composition records and metadata.

Use localStorage only for small preferences:

- Onboarding completed
- Last quality setting
- Reduced effects preference
- Last-opened composition ID

### Share format

Preferred URL model:

```text
/#/system/<encoded-state>
```

or

```text
/#s=<encoded-state>
```

Encoded state should:

- Include schema version
- Omit ephemeral UI state
- Be compressed where practical
- Include checksum or safe decode validation
- Fall back gracefully when invalid

A seed-only link is allowed for generated, unedited systems. Edited systems need complete encoded state.

## Export architecture

### WAV

1. Clone or normalize composition state.
2. Derive the exact active super-loop shared with live scheduling.
3. Render 1×, 2×, or 4× complete super-loops through offline audio, defaulting to 1×.
4. Apply master processing and a short explicit tail after the musical boundary.
5. Encode the resulting buffer as WAV.
6. Download with a sanitized project name.

### MIDI

1. Convert each track's events to absolute musical time through the same selected whole-super-loop count.
2. Resolve harmony into concrete pitches.
3. Write tempo and time-signature metadata.
4. Create tracks by planet or role.
5. Write note duration and velocity.
6. Export a standard MIDI file.

Both exporters show the exact bar count and musical duration before export. MIDI ends on the boundary; WAV adds only its disclosed effects tail afterward.

## Error handling

- Audio asset failure: use a synthesized fallback voice.
- Unsupported post-processing: disable effect.
- Invalid shared state: open recommended starter and explain.
- Storage quota failure: offer JSON download.
- Offline-render failure: allow real-time recording as fallback if implemented.
- WebGL context loss: pause visual rendering, preserve audio and state, attempt recovery.
- Audio context interruption: show a clear resume action.

## Repository commands

The scaffold should define:

```bash
npm run dev
npm run build
npm run preview
npm run typecheck
npm run lint
npm run test
npm run test:e2e
```

Codex must run typecheck, unit tests, and production build before completing a milestone.

## Dependency policy

Prefer stable, focused dependencies.

A dependency is justified when it:

- Removes a large implementation risk
- Is browser-compatible
- Is tree-shakeable or acceptably small
- Does not force WebGPU
- Does not own canonical composition state
- Can be replaced behind an adapter

Record new dependencies in the decision log.
