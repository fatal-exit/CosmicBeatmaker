# Audio and Content Plan

## Audio product goal

Cosmic Beatmaker should sound authored, cohesive, and immediately rewarding without requiring a large sample library or deep synthesis interface.

The sound palette should showcase the creator's music and sound-design strengths while remaining technically manageable for offline export and mobile loading.

## Voice strategy

Use a hybrid of lightweight synthesis and curated embedded samples.

### Beat

- Kick
- Snare or clap
- Closed hat
- Open hat
- Rim or click
- Percussion accent

Use small one-shot samples with consistent loudness and carefully trimmed silence.

### Bass

Provide at least:

- Deep Sub
- Warm Pulse
- Rough Drive
- Cosmic Drone

Prefer synthesis or short multisamples that export reliably offline.

### Chords

Provide at least:

- Warm Pad
- Soft Keys
- Glass Chords
- Pulsing Synth

### Melody

Provide at least:

- Ice Bell
- Star Pluck
- Signal Lead
- Organic Mallet

### Texture

Provide at least:

- Dust
- Radio
- Nebula
- Mechanical
- Void Drone

Texture voices should be subtle and automatically gain-limited.

## Star sound palettes

Each star preset selects recommended sounds and effect defaults.

### Radiant

- Clean electronic drums
- Warm pulse bass
- Clear pluck
- Bright pad
- Moderate stereo delay

### Red Giant

- Soft impact drums
- Rounded bass
- Slow pad
- Organic mallet
- Long warm reverb

### Dwarf

- Small dry percussion
- Compact bass
- Bells and plucks
- Minimal room
- Lower density

### Neutron

- Metallic drums
- Pulse bass
- Digital stabs
- Sequenced lead
- Rhythmic gate

### Void

- Heavy low percussion
- Sub drone
- Dark pad
- Sparse signal lead
- Filtered noise and large space

## Asset constraints

- Keep initial download reasonable for mobile.
- Prefer mono one-shots where stereo is unnecessary.
- Normalize and trim assets.
- Use consistent sample rate.
- Avoid long uncompressed files.
- Preload the recommended starter palette first.
- Lazy-load alternative sound packs.
- Provide synthesized fallback voices.
- Track asset licenses and authorship in a manifest.

## Suggested asset manifest

```ts
export interface AudioAssetManifestEntry {
  id: string;
  role: PlanetRole | "ring" | "asteroid" | "ui";
  url: string;
  format: "ogg" | "mp3" | "wav";
  fallbackPresetId: string;
  preload: boolean;
  license: string;
  author: string;
}
```

Use browser-compatible compressed formats for delivery and decode into audio buffers.

## Audio routing

```text
Planet voice
  -> track filter
  -> track gain
  -> dry bus
  -> reverb send
  -> delay send

Moon voice
  -> parent-family bus
  -> quieter track gain

Ring and asteroid voices
  -> percussion texture bus

All buses
  -> master compressor or glue
  -> limiter
  -> master gain
```

## Gain staging

- Leave substantial headroom before master processing.
- Calibrate every preset at a reference velocity.
- Use per-role nominal levels.
- Scale generated systems based on active voice count.
- Cap effect feedback and wet levels.
- Validate offline renders for clipping.

## Scheduler behavior

- Schedule events from composition state using audio time.
- Use stable event IDs.
- Apply probability through seeded decisions per loop and event.
- Avoid using random values that differ between live playback and export unless intentionally documented.
- Decide whether probability repeats deterministically per export or evolves each loop; default to deterministic evolution derived from seed and loop index.

## Parameter changes

Immediate but smoothed:

- Level
- Filter
- Effects
- Pan

Quantized to beat or bar where needed:

- Instrument replacement
- Pattern replacement
- Harmony change
- Loop length
- Major regeneration

This avoids clicks and confusing mid-note changes.

## WAV export

Default options:

- 2, 4, or 8 repetitions
- Short master tail for effects
- 44.1 kHz or context-supported sample rate
- 16-bit PCM WAV
- Normalized only when necessary and without destroying dynamics

The exported name should include project name and BPM.

## MIDI export

Suggested track order:

1. Beat planet
2. Rings and asteroid percussion
3. Bass planets
4. Chord planets
5. Melody planets
6. Texture planets
7. Moon tracks where musically meaningful

Track names should include celestial names if the user renamed them.

## Preset production target

### Full systems

Create five carefully authored showcase presets:

- First Light
- Red Horizon
- Tiny Signals
- Pulsar Engine
- Event Horizon

Each should demonstrate a different creative identity and include at least one satellite or orbital structure.

### Rhythm templates

At least eight:

- Four on Floor
- Backbeat
- Half Time
- Broken Orbit
- 3-3-2
- Minimal Pulse
- Shuffled Dust
- Neutron Drive

### Ring patterns

At least six:

- Straight Eighths
- Straight Sixteenths
- Offbeat Eighths
- Broken Shaker
- Open-End Hat
- Sparse Metallic

### Moon behaviors

At least six:

- Echo
- Pickup
- Harmony
- Counterpulse
- Fill
- Ghost Accent

## UI sounds

Keep UI sounds quiet and disable them with a preference.

Possible sounds:

- Object added
- Snap to orbit
- Lock
- Undo
- Export complete

Do not make UI sounds compete with the composition.

## Content validation

For each sound preset:

- Test across the full supported pitch range.
- Test on phone speakers and headphones.
- Check loudness relative to peers.
- Check offline export.
- Check rapid triggering and voice stealing.
- Verify that long releases do not accumulate dangerously.
- Verify fallback behavior.

For each system preset:

- Listen at minimum and maximum macro values.
- Check no obvious clipping.
- Check phone-speaker intelligibility.
- Check that each visible object has a clear audible role.
