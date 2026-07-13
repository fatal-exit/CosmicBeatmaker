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
- Preserve the authored channel layout; the current 20 pilot sources and outputs are stereo.
- Do not normalize or apply gain in the sample processor. Author loudness in the source or runtime mix instead.
- Trim only qualified terminal silence according to the documented pilot policy; preserve internal gaps and authored reverb tails.
- Deliver web samples at a consistent 48 kHz sample rate.
- Avoid long uncompressed files.
- Lazy-load only the active track presets after audio unlock.
- Provide synthesized fallback voices.
- Track asset licenses and authorship in a manifest.

## First-party sample pack pilot

### Current local status

The pilot contains 20 first-party assets and a generated manifest under `public/audio/cosmic-samples/`. The generated Ogg set is 654,518 bytes from 12,571,120 source bytes, or 5.2% of the source size. The repeatable processor and lazy live-playback path are implemented locally. Primary verification, checkpoint commit, push, and deployment remain pending. Physical iOS and Android listening is not yet verified.

### Repeatable processor

Run from any working directory:

```bash
npm run samples:build
```

The package command runs `node scripts/process-samples.mjs`. Optional `--input <dir>` and `--output <dir>` flags support controlled reruns through `npm run samples:build -- --input <dir> --output <dir>`. The default input is the ignored local `sample inputs/` directory, and the default output is `public/audio/cosmic-samples/`.

Rerun prerequisites available on `PATH`:

- `ffmpeg`
- `ffprobe`
- Xiph `oggenc`

The processor:

- Recursively discovers every WAV below the input directory in stable path order.
- Derives stable, collision-checked IDs from relative paths.
- Reads source and output metadata with `ffprobe` and level data with `ffmpeg`.
- Regenerates the manifest and removes stale generated Ogg files.
- Preserves unknown future filenames under an `other` category rather than dropping them.
- Writes only generated outputs and never modifies the raw input WAVs.

Raw WAV inputs remain local and uncommitted. Generated Ogg assets and their manifest are the reviewable repository artifacts.

### Silence and encoding policy

- Detect silence below -60 dBFS.
- Trim only terminal silence lasting at least 120 ms.
- Retain 30 ms after the detected audible tail.
- Preserve internal silence, shorter terminal gaps, and long or reverberant tails.
- Apply no gain, peak normalization, or loudness normalization.
- Resample to 48 kHz and preserve the authored channel layout; all 20 current sources and outputs are stereo.
- Encode with Xiph `oggenc` at Ogg Vorbis quality 5, discard comments, and use serial 0 for repeatable output.

### Generated manifest contract

```ts
export interface FirstPartySampleManifest {
  schemaVersion: 1;
  pack: {
    id: "cosmic-first-party";
    codec: "Ogg Vorbis";
    sampleRate: 48000;
    quality: 5;
    generatedBy: "node scripts/process-samples.mjs";
    trimPolicy: {
      thresholdDb: -60;
      minimumTerminalSilenceSeconds: 0.12;
      tailPaddingSeconds: 0.03;
    };
  };
  samples: AudioAssetManifestEntry[];
}

export interface AudioAssetManifestEntry {
  id: string;
  name: string;
  category: string;
  url: string;
  sourceFile: string;
  durationSeconds: number;
  sourceDurationSeconds: number;
  trimmedSeconds: number;
  channels: number;
  sampleRate: 48000;
  sourcePeakDb: number | null;
  encodedPeakDb: number | null;
  attackSeconds: number;
  releaseSeconds: number;
}
```

The generated manifest retains processing, byte-size, source, output, level, license, and authorship metadata. Playback envelope metadata allows subtle sample-specific attack and release behavior without rewriting the raw audio: punchy transients use a near-immediate attack, softer or style-dependent sounds may fade in subtly, and the 2.182-second long samples release before their file boundary. The six lead files whose names include `short` retained their full 2.182 seconds because the processor found no terminal silence meeting the threshold and duration policy; their boundary release still prevents hard stops.

### Live playback and export boundary

- Tone sample voices load lazily for the active track preset after audio unlock.
- While a sample is loading, or after a fetch, decode, or trigger failure, the same scheduled event uses the synthesized fallback voice.
- Runtime URLs resolve below the Vite repository base path rather than the domain root.
- Live playback may use the first-party samples, but offline WAV rendering remains synth-only for this pilot.
- MIDI export remains on the existing canonical note-event path and has no sample dependency.

This boundary keeps live playback resilient and preserves the existing deterministic WAV and MIDI export paths while sample compatibility is proven.

### Provisional preset substitutions

The pilot intentionally substitutes the supplied assets across the current live preset catalog so they can be evaluated in musical context before the final content pass. Tonal sources are authored on C: low assets map from C2 (MIDI 36), mid assets from C3 (MIDI 48), and high assets from C4 (MIDI 60), with Tone transposing from those roots into the composition's active scale and chord voicing. `sub-short` and `chunk-bass-short` cover compact bass presets; their long versions cover rough, drone, and sustained bass roles; and the reverb square-saw sources provisionally cover chord and texture presets. The six new lead mappings are `signal-lead` to high-long, `ice-bell` to high-short, `midnight-lead` to mid-long, `star-pluck` to mid-short, `deep-signal` to low-long, and `organic-mallet` to low-short. All six presets are selectable and used by mood palettes. These are replaceable content mappings rather than composition-schema choices, so a more suitable future sample can replace any assignment without invalidating saves or changing pattern data.

### Future arrivals

The processor is intentionally inventory-agnostic. New first-party WAVs can be added to the ignored input directory and incorporated by rerunning the same command. Stable ID collision checks, generated metadata, stale-output cleanup, and manifest/runtime alignment tests keep the pack scalable; assigning a new asset to a sound preset remains an intentional reviewed content decision.

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

### Current live stability profile

- Use Tone's balanced worker clock with 120 ms lookahead / 30 ms cadence on desktop and 180 ms / 45 ms on mobile.
- Treat callbacks more than 80 ms late on desktop or 120 ms late on mobile as stale; skip them rather than replaying an audible catch-up burst.
- Admit each compiled source-cycle occurrence once per repeat, bound the occurrence ledger to 4,096 entries, and trip on unsafe callback bursts, timeline regression, invalid time, 16 consecutive late callbacks, or four consecutive voice-trigger errors.
- Reuse compatible runtime voices across pattern and mix edits; rebuild transport registrations only when captured scheduling data changes.
- Cap overlap at six sources per unique drum sample and sixteen per pitched sample voice.
- Keep master gain at 72% of the requested composition level before a -3 dB limiter.
- On a health trip, clear scheduling, fade to silence over 15 ms, release voices, and pause. Explicit play may attempt a clean rebuild; a health failure must never sustain an overload tone.
- Bound visual-event timeouts independently. Dropping an overloaded visual pulse must not drop or reschedule audio.

This profile prioritizes stable authored playback over minimum monitoring latency because the MVP has no live note-entry surface. It does not replace physical iOS/Android listening, interruption/resume, Bluetooth-route, or thermal-throttling tests.

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

- One complete active super-loop by default, with 1×, 2×, or 4× whole-super-loop repetitions
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
