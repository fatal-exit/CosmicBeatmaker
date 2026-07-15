# State and Data Model

## Goals

The composition model must be:

- Serializable
- Versioned
- Deterministic
- Independent of rendering and audio libraries
- Suitable for undo and redo
- Suitable for local saving and URL sharing
- Sufficient for live playback, offline audio, and MIDI export

## Top-level model

```ts
export interface Composition {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;

  seed: string;
  bars: 4;
  beatsPerBar: 4;
  bpm: number;
  swing: number;

  star: StarState;
  harmony: HarmonyState;
  macros: MacroState;
  mix: MasterMixState;

  planets: PlanetState[];
  asteroidBelt?: AsteroidBeltState;

  generation: GenerationState;
}
```

New compositions keep a canonical four-bar harmony phrase. The active playback/export super-loop is derived from that phrase plus audible orbit periods and may be 4, 12, or up to 24 bars; it is not stored as a second composition length.

## Identifiers

Use stable opaque IDs for:

- Composition
- Star
- Planet
- Moon
- Ring
- Pattern event
- Saved preset instance

IDs must survive save, load, undo, redo, and export.

## Star state

```ts
export interface StarState {
  id: string;
  presetId: StarPresetId;
  visualSeed: number;
  intensity: number;
  locked: boolean;
  companion?: BinaryStarState;
}

export interface BinaryStarState {
  id: string;
  presetId: Exclude<StarPresetId, "black-hole">;
  visualSeed: number;
  intensity: number;
  rhythmMode: "interlock" | "mirror" | "call-response";
}
```

Star preset definitions live in content data, not inside saved compositions.
The optional companion is part of the same star lock domain. Planet affinity is
derived from stable composition order and the companion seed rather than stored
on every planet.

## Harmony state

```ts
export interface HarmonyState {
  rootMidi: number;
  scaleId: ScaleId;
  progressionId: ProgressionId;
  customProgression?: ChordDegree[];
  safeHarmony: boolean;
  voicingId: VoicingPresetId;
}
```

Store musical intent rather than only resolved pitches. Resolve concrete note values during scheduling and export.

## Macro state

```ts
export interface MacroState {
  energy: number; // 0..1
  density: number; // 0..1
  groove: number; // 0..1
  space: number; // 0..1
  complexity: number; // 0..1
}
```

Macros are user-visible state. Their transformations should be deterministic and should not cause uncontrolled mutation on every render.

Preferred model:

- Macro value changes update derived playback parameters.
- Explicit “Apply variation” or generation commands alter stored events.
- Avoid silently rewriting patterns every time a macro slider moves unless the behavior is defined and undoable.

## Planet state

```ts
export type PlanetRole = "beat" | "bass" | "chords" | "melody" | "texture";

export interface PlanetState {
  id: string;
  role: PlanetRole;
  name: string;
  soundPresetId: string;

  orbit: OrbitState;
  pattern: PatternState;
  expression: PlanetExpressionState;
  mix: TrackMixState;
  appearance: PlanetAppearanceState;

  moons: MoonState[];
  ring?: RingState;

  muted: boolean;
  soloed: boolean;
  locked: boolean;
}
```

`soundPresetId` may identify a built-in data preset or a locally registered user sound. User-audio Blob data is never embedded in `Composition`, history, share URLs, JSON, MIDI, or the schema. A local user-sound repository resolves that stable ID on the originating device; when it cannot, the existing role-safe synthesized voice is the runtime and offline fallback.

```ts
export type PlanetExpressionState =
  | {
      kind: "chords";
      voicingSpread: number; // 0 closed, 0.5 open, 1 wide
      chordComplexity: number; // 0..1
    }
  | {
      kind: "melody";
      pitchVariety: number; // 0..1
      contour: "ascending" | "alternating" | "descending";
    }
  | { kind: "default" };
```

Expression state is stored per planet because it is audible, undoable, and export-relevant. Playback derives the resulting chord voicings and melody pitch intents without destructively rewriting the saved rhythmic pattern.

## Orbit state

```ts
export interface OrbitState {
  loopBars: 0.25 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 6 | 8;
  phase: number; // normalized 0..<1
  inclination: number; // visual and optional pan mapping
  shellIndex: number; // deprecated; not authoritative scene placement
  direction: 1;
}
```

Direction remains forward. `loopBars` is the sole audible/visible period. Represent its exact catalog as quarter-bar integers for super-loop LCM math. `shellIndex` remains in the early schema shape temporarily but validation no longer maps it to rate or uses it to place the planet.

The renderer derives a unique lane for every planet by rate order and stable composition order or ID, then accumulates lane radii from role- and appearance-derived body, gate, ring, and moon envelopes. Those lanes, physical-class profiles, camera fit, and zoom are ephemeral projections and are never serialized. Planets at the same rate receive adjacent distinct lanes, with enough clearance for their differing visual sizes.

## Pattern state

Prefer events over a fixed global 64-step grid.

```ts
export interface PatternState {
  gridSize: 4 | 6 | 8 | 12 | 16 | 24 | 32;
  events: PatternEvent[];
  templateId?: string;
  humanize: number;
}
```

```ts
export interface PatternEvent {
  id: string;
  step: number;
  velocity: number;
  probability: number;
  durationSteps: number;

  pitch?: PitchIntent;
  drumVoice?: DrumVoiceId;
  chordAction?: ChordAction;
}
```

`step` is relative to the track's own loop and must satisfy:

```ts
0 <= step < gridSize;
```

The complete step-count catalog is 4, 6, 8, 12, 16, 24, and 32, but the UI exposes only the natural subset for the selected orbit: quarter bar → 4; half bar → 4/8; one or two bars → 8/16; four bars → 8/16/32; 1½ bars → 6/12; three bars → 12/24; six bars → 24; eight bars → 32. The 6/12/24 choices remain advanced.

A step-count edit maps each event by normalized orbit position, scales its duration, clears template provenance, and keeps the strongest event when multiple detailed events collapse onto one simpler step. Stable IDs and pitch intent survive when their event survives. An orbit-rate edit preserves the current steps-per-bar density, then chooses the nearest allowed grid for the new orbit; ties prefer the simpler grid.

Primary-planet orbit edits use the natural catalog above. The command carries the prior steps-per-bar density into the new period, selects the nearest allowed count, and proportionally remaps events. Eight-step moon and auxiliary patterns remain valid and are not rewritten by a parent orbit edit.

## Pitch intent

Store role-aware intent when possible.

```ts
export type PitchIntent =
  | { kind: "scaleDegree"; degree: number; octaveOffset: number }
  | { kind: "chordTone"; index: number; octaveOffset: number }
  | { kind: "root"; octaveOffset: number }
  | { kind: "fifth"; octaveOffset: number }
  | { kind: "absoluteMidi"; note: number };
```

In Safe Harmony mode, generated melodic content should avoid `absoluteMidi`.

## Moons

```ts
export interface MoonState {
  id: string;
  behaviorPresetId: MoonBehaviorPresetId;
  pattern: PatternState;
  orbitRatio: number;
  phase: number;
  level: number;
  probability: number;
  appearanceSeed: number;
  muted: boolean;
  locked: boolean;
}
```

Moons inherit parent harmony and sound family. `behaviorPresetId` selects a pure
runtime pattern projection that preserves the moon's event IDs, event count,
grid, and canonical saved pattern. Audio and scene apply that same projection
after macro/expression shaping and before star-level celestial transforms.

## Rings

```ts
export interface RingState {
  id: string;
  type: "hat" | "shaker" | "perc" | "gate" | "delay" | "filter";
  segments: 8 | 16;
  active: boolean[];
  phase: number;
  velocityVariation: number;
  probability: number;
  soundPresetId: string;
  level: number;
}
```

The `active` array length must equal `segments`.

Ring density remains derived from the number of `true` entries in `active`; it is not stored as a parallel field. Changing density deterministically rewrites that visible segment array in a parent-role-aware order. Playback derives melody ghost notes, chord arpeggios, bass octave pickups, or percussive texture from the parent role plus this existing ring state, so no duplicate hidden sequencer or schema field is required.

## Asteroid belt

```ts
export interface AsteroidBeltState {
  id: string;
  materialPresetId: string;
  gridSize: 16 | 32;
  events: PatternEvent[];
  population: number;
  clustering: number;
  turbulence: number;
  accentChance: number;
  level: number;
  locked: boolean;
  visualSeed: number;
}
```

The belt's musical events are authoritative. Asteroid positions are generated to
visually correspond to those events. `accentChance` derives a stable per-event
velocity boost from composition seed, belt ID, and event ID; it does not add
events or mutate their timing.

## Mix state

```ts
export interface TrackMixState {
  level: number;
  pan: number;
  filter: number;
  reverbSend: number;
  delaySend: number;
}

export interface MasterMixState {
  level: number;
  brightness: number;
  limiterEnabled: true;
}
```

All values should be normalized and validated.

## Generation state

```ts
export interface GenerationState {
  revision: number;
  generatorVersion: string;
  lockedDomains: Array<
    | "star"
    | "harmony"
    | "beat"
    | "bass"
    | "chords"
    | "melody"
    | "texture"
    | "moons"
    | "ring"
    | "asteroids"
  >;
}
```

Changing generator logic must not silently alter already saved compositions because saved state contains resolved patterns. The generator version is useful for debugging and intentional regeneration.

## Commands

All meaningful edits should be represented as typed commands.

Examples:

- `AddPlanet`
- `RemovePlanet`
- `DuplicatePlanet`
- `SetPlanetLoopBars`
- `RotatePattern`
- `SetPatternEvent`
- `SetMacro`
- `SetHarmony`
- `AddMoon`
- `SetRingSegment`
- `GenerateSystem`
- `RegeneratePlanet`
- `SetLock`
- `RenameComposition`

A command should contain enough information to:

- Validate the edit
- Apply it
- Describe it for UI feedback
- Undo it, either through inverse data or state snapshots

## Undo and redo

For Build Week, use bounded immutable snapshots if command inversion becomes a time risk.

Requirements:

- Keep at least 50 meaningful actions.
- Exclude ephemeral selection and camera changes.
- Coalesce continuous slider input into one history entry.
- Clear redo after a new divergent edit.
- Generation and delete actions must be undoable.
- Loading a different project resets history.

## Deterministic generation

Use a deterministic PRNG with derived sub-seeds.

Example namespace strategy:

```text
<root seed>/star
<root seed>/harmony
<root seed>/planet/beat/0
<root seed>/planet/bass/0
<root seed>/moon/<parent id>/0
<root seed>/ring/<planet id>
<root seed>/asteroids
```

This allows one unlocked domain to regenerate without altering locked domains.

Do not rely on object iteration order or `Math.random()` inside generation logic.

## Serialization

Serialized composition must:

- Include `schemaVersion`
- Include all audible state
- Include all share-relevant visual state
- Exclude runtime and transient state
- Be validated after decoding
- Be migratable

Use a runtime schema validator or explicit validation functions.

Schema version 2 introduces role-specific planet expression state. Version-1 compositions migrate deterministically: chord voicing spread is initialized from the saved global harmony voicing, chord complexity and melody pitch variety are initialized from the saved macro complexity, and other roles receive the default expression variant.

Schema version 3 adds the Black Hole preset and optional binary companion. A
version-2 composition migrates by advancing the schema version with no companion;
all prior musical state remains unchanged. Primary and companion presets must be
distinct so every binary save contributes two sound palettes; generation and
editing normalize same-preset requests deterministically before validation.

## Migrations

```ts
export type CompositionMigration = (
  input: unknown,
) => Composition | MigrationResult;
```

At minimum:

- Reject future unsupported versions with a useful error.
- Migrate older known versions.
- Preserve a backup when migrating local data.
- Test fixtures for every schema version introduced.

## Derived selectors

Examples:

- `selectAudiblePlanets`
- `selectResolvedChordAtBar`
- `selectResolvedEventsForWindow`
- `selectOrbitPhaseAtTransportTime`
- `selectCompositionSuperLoop`
- `derivePlanetOrbitLanes`
- `selectExportTrackList`
- `selectPerformanceBudget`
- `selectCanUndo`
- `selectCanRedo`

Keep expensive derived calculations memoized where useful.

## Validation invariants

- BPM within allowed range
- Exactly one star
- Planet count within supported maximum
- No duplicate IDs
- Every event step inside pattern bounds
- Planet rate edits to 1.5 or 3 bars produce a 12- or 24-step pattern grid
- Planet rate edits back to ordinary rates restore 12 steps to 16 and 24 to 32
- Ring segment count matches active array
- Values normalized
- Safe Harmony pitch intents valid
- Loop rate is one of 0.25, 0.5, 1, 1.5, 2, 3, 4, 6, or 8 bars
- Derived supported-rate super-loop does not exceed 24 bars
- Moon count within limit
- At least one audible primary planet in generated systems
- Serialized size below the chosen share limit
