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

### Scene layer

Responsibilities:

- Create and maintain Three.js objects
- Interpolate visual positions from transport time
- Perform picking and gesture mapping
- Display scheduled event flashes
- Apply adaptive quality
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

1. Schedule events ahead using Tone transport callbacks or a bounded lookahead scheduler.
2. Trigger voices at explicit audio times.
3. Emit lightweight visual-event messages with event IDs and scheduled times.
4. Let the scene display the corresponding visual pulse when transport time reaches that event.

Never detect a mesh crossing a visual marker and use that to trigger sound.

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
2. Render a chosen number of loops through offline audio.
3. Apply master processing.
4. Encode the resulting buffer as WAV.
5. Download with a sanitized project name.

### MIDI

1. Convert each track's events to absolute musical time.
2. Resolve harmony into concrete pitches.
3. Write tempo and time-signature metadata.
4. Create tracks by planet or role.
5. Write note duration and velocity.
6. Export a standard MIDI file.

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
