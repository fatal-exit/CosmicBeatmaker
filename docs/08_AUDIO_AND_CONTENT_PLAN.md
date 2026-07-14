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
- Preserve the authored channel layout; the 20 user-authored pilot sources and their processed outputs are stereo. Procedural low transients may remain mono, while baked spatial voices are stereo by design.
- Do not normalize or apply gain in the authored sample processor. Procedural spatialization uses only versioned fixed dry/wet gains and a fixed safety ceiling.
- Trim only qualified terminal silence according to the documented pilot policy; preserve internal gaps and authored reverb tails.
- Deliver web samples at a consistent 48 kHz sample rate.
- Avoid long uncompressed files.
- Lazy-load only the active track presets after audio unlock.
- Provide synthesized fallback voices.
- Track asset licenses and authorship in a manifest.

## First-party sample pack pilot

### Current local status

The authored pilot contains 20 user-created source inputs and 20 processed assets under `public/audio/cosmic-samples/`. That authored Ogg subset is 654,518 bytes from 12,571,120 source bytes, or 5.2% of the source size. The deterministic renderer adds 41 procedural runtime assets, bringing the merged manifest to 61 entries and 1,797,105 encoded bytes. Thirty generated upper-register assets are baked through stereo space reverb; their dry source variants are labeled Legacy Dry in build metadata and are not packaged. Asset generation, preset integration, auxiliary ring/asteroid coverage, lazy synth-fallback construction, deterministic rebuild verification, and the automated regression suite are complete. Physical iOS/Android listening remains pending.

### Repeatable processor

Run from any working directory:

```bash
npm run samples:build
```

The package command runs `scripts/build-samples.mjs`, which builds the authored subset and procedural extension in a sibling staging directory outside `public/`, validates the complete manifest/file/runtime contract, then promotes the pack directory and generated TypeScript inventory together. Promotion has rollback coverage, so a renderer or swap failure leaves the last good pack intact. The authored count is discovered rather than fixed at 20, allowing future WAV additions without changing the builder. Optional `--input <dir>` and `--output <dir>` flags support controlled authored-subset reruns through `npm run samples:authored -- --input <dir> --output <dir>`. The default input is the ignored local `sample inputs/` directory, and the default output is `public/audio/cosmic-samples/`.

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

### Deterministic procedural extension

The procedural renderer turns the remaining built-in patch designs into cached audio without adding new raw masters:

```bash
npm run samples:render
```

Run `npm run samples:build` first when rebuilding from an empty output directory, because the procedural renderer merges into the authored manifest rather than replacing it. It uses the same `ffmpeg`, `ffprobe`, and Xiph `oggenc` prerequisites.

The current procedural inventory contains:

- 28 drum assets across four style families: eight mono kick/low-percussion transients and 20 stereo spatialized snare, clap, hat, and rim voices
- Four auxiliary ring and asteroid assets: two stereo spatialized hat/shaker voices and two mono percussion voices
- Eight stereo spatialized tonal or texture assets rendered at C4 (MIDI 60)
- One stereo low drone rendered at C2 (MIDI 36)

Stable asset/channel identifiers, per-asset synthesis versions, and a seeded local pseudo-random generator determine the 48 kHz PCM16 renders. The non-shipping Legacy Dry patch sources retain synthesis version `1.0.0`, except the consonant integer-ratio FM source for Glass Chords at `1.1.0`. Thirty selected synth, keys, pad, texture, snare, clap, hat, rim, and ring voices advance to spatial synthesis version `2.0.0`. They pass through a deterministic Freeverb-style Schroeder network with stereo pre-delay, eight feedback combs, four serial all-pass diffusers, profile-specific damping, fixed dry/wet gain, and a -3.3 dBFS nominal soft ceiling. The algorithm runs only during the content build; it adds no runtime effect node or dependency.

Xiph `oggenc` then uses quality 5, discarded comments, and serial 0. Under the same renderer and codec toolchain, reruns reproduce the asset inventory and encoded output; manifest metadata records each synthesis version, legacy-dry source label and ID, spatial algorithm/profile, channel contract, level measurements, and peak policy. Builder validation requires exactly 30 spatialized replacements and rejects any manifest or pack that also contains one of their Legacy Dry IDs. Source and encoded duration, codec, channel, sample-rate, audibility, peak, and size bounds are validated before promotion. The command preserves every authored entry, replaces the procedural subset, removes only canonical procedural files, writes the merged manifest, and regenerates `src/content/generatedProceduralSampleAssets.ts`.

Procedural generation is a content-build optimization, not permission to remove runtime resilience. Synthesis remains the event-for-event fallback while a generated asset is loading or if fetch, decode, or trigger fails.

### Silence and encoding policy

- Detect silence below -60 dBFS.
- Trim only terminal silence lasting at least 120 ms.
- Retain 30 ms after the detected audible tail.
- Preserve internal silence, shorter terminal gaps, and long or reverberant tails.
- Apply no gain, peak normalization, or loudness normalization.
- Resample to 48 kHz and preserve the authored channel layout; all 20 user-authored sources and outputs are stereo. The separate procedural renderer emits 10 mono low/percussion assets and 31 stereo assets, including 30 baked spatial replacements.
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
    generatedBy: string;
    proceduralSynthesis?: {
      version: string;
      renderer: string;
      legacyDryAssetsPackaged: false;
      spatialAlgorithm: "stereo-schroeder-space-v1";
      spatializedAssets: 30;
      dryTransientChannels: 1;
      spatializedChannels: 2;
      tonalChannels: 2;
      peakPolicy: string;
    };
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
  sourceKind?: "procedural";
  synthesisVersion?: string;
}
```

The generated manifest retains processing, byte-size, source, output, level, license, and authorship metadata. Playback envelope metadata allows subtle sample-specific attack and release behavior without rewriting the raw audio: punchy transients use a near-immediate attack, softer or style-dependent sounds may fade in subtly, and the 2.182-second long samples release before their file boundary. The six lead files whose names include `short` retained their full 2.182 seconds because the processor found no terminal silence meeting the threshold and duration policy; their boundary release still prevents hard stops.

### Live playback and export boundary

- Authored and procedural sample voices load lazily for the active track preset after audio unlock. A page-lifetime cache coalesces each resolved first-party URL to one in-flight or decoded buffer handle across disposable voice generations.
- While a sample is loading, or after a fetch, decode, or trigger failure, the same scheduled event uses the synthesized fallback voice.
- A baked sample that is ready before its first event does not construct a fallback synth graph. If loading required synthesis, that graph remains idle after readiness until normal voice disposal so already-scheduled fallback events cannot be disconnected before their audio time.
- Runtime URLs resolve below the Vite repository base path rather than the domain root.
- Live playback may use the first-party samples, but offline WAV rendering remains synth-only for this pilot. Export uses a dedicated bounded shared instrument set per track; the per-occurrence cancellable instrument model is live-playback-only and must never allocate a complete long render up front.
- MIDI export remains on the existing canonical note-event path and has no sample dependency.

This boundary keeps live playback resilient and preserves the existing deterministic WAV and MIDI export paths while sample compatibility is proven.

### Active preset mapping

Authored tonal sources use C roots: low assets map from C2 (MIDI 36), mid assets from C3 (MIDI 48), and high assets from C4 (MIDI 60), with Tone transposing from those roots into the composition's active scale and chord voicing. `sub-short`, `chunk-bass-short`, and their long versions cover the four bass presets. The six imported lead variants cover all six selectable melody presets; they are authored masters rather than dry procedural sources and are not reprocessed by this renderer. Clean Orbit retains the compact imported techno kit, including the dark hat, while Metallic Array uses the imported crash as its current open-hat alternative; the other beat slots use their dedicated rendered kits with spatialized upper percussion and dry low-end transients. Soft Keys, Glass Chords, Pulsing Synth, Radio, Nebula, Mechanical, Void Drone, ring, and asteroid presets use purpose-built procedural renders. The active generated chord/keys/texture and upper-percussion mappings now point only to the `-space` assets. Hat, shaker, and percussion rings route to distinct generated voices, and newly added rings choose a type from their parent planet role. Warm Pad and Dust retain the imported reverb square/saw sources after comparison; their two generated spatial renders remain versioned alternatives rather than creating duplicate live samplers.

These are replaceable content mappings rather than composition-schema choices, so a more suitable future sample can replace any assignment without invalidating saves or changing pattern data.

Melody, chord, and bass rings reuse the parent's pitched preset rather than auxiliary percussion samples. Melody rings emit quiet adjacent ghosts, chord rings replace the parent voicing track with a full-orbit single-note arpeggio at the parent's level, and bass rings emit syncopated octave or occasional fifth pickups. The existing dedicated hat, shaker, and percussion assets remain assigned to beat and texture rings. When a live pattern rebuild occurs during playback, the scheduler admits the remaining events in the current source cycle immediately so a new ring does not wait for the next orbit boundary.

### Future arrivals

The authored processor is intentionally inventory-agnostic. New first-party WAVs can be added to the ignored input directory and incorporated by rerunning the same command. Procedural arrivals are added as versioned renderer definitions and regenerated through the separate command. Stable ID collision checks across both sets, generated metadata, stale-output cleanup, and manifest/runtime alignment tests keep the pack scalable; assigning any new asset to a sound preset remains an intentional reviewed content decision.

### Local user-sound library

User imports are a separate device-local runtime library rather than additions to the first-party build pack. Audio Blobs and their small metadata records are stored in a dedicated IndexedDB database. A composition continues to store only `soundPresetId`, so the canonical schema, URL share size, deterministic MIDI, and first-party manifest remain unchanged.

Beat imports may fill any subset of the seven existing drum voices; each file is bounded to 12 MB and four seconds, and the combined kit is bounded to 24 MB. An unmapped or unavailable slot uses the established synthesized fallback for that occurrence. Tonal imports are bounded to 12 MB and 12 seconds, downmixed only for analysis, and inspected with normalized autocorrelation over a loud stable window. The detected MIDI source note is shown for correction before the sound is registered. Tone then transposes from that confirmed source root into the composition's already-resolved Safe Harmony MIDI notes; the source file is not destructively rewritten to C.

Local sample playback uses the existing decoded-buffer cache, per-event voice ownership, overlap limits, track strip, and fallback path. Drum files are limited to four seconds. Unsupported, oversized, silent, or undecodable inputs fail with plain-language feedback. Custom audio is live-playback-only: offline WAV continues to use the equivalent bounded synth voice, MIDI remains sample-independent, and share recipients without the local library hear a safe synth rather than silence.

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

Beat/texture ring and asteroid voices
  -> percussion texture bus

Melody/chord/bass ring voices
  -> quieter parent-family bus

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
- Keep one repeating callback per source cycle, but retain every later event as a cancellable absolute-tick Tone Transport one-shot until that event's own callback. Admit each `trackId:eventId` and source-cycle occurrence once, bound the occurrence ledger to 4,096 entries, and trip on unsafe callback bursts, timeline regression, invalid time, 16 consecutive late callbacks, or four consecutive voice-trigger errors.
- Keep tempo and mix-only updates on direct runtime paths. When captured structural scheduling data changes, revoke all repeats and pending exact-tick one-shots, cancel only event-owned voice attacks still strictly ahead of the raw audible clock, and directly admit the replacement pattern across Tone's processed lookahead frontier. Reuse compatible voices and track strips; removed or preset-incompatible voices reject new attacks but retain already-started notes through their natural tails. Reserve generation-gate fades for pause, stop, and health failure.
- Cap overlap at six sources per unique drum voice and sixteen per pitched sample voice. Event-owned reservations are released immediately when a future attack is cancelled, so rapid edits cannot create phantom polyphony pressure.
- Keep master gain at 72% of the requested composition level before a -3 dB limiter.
- On pause, stop, or health failure, clear scheduling, fade master and generation output to silence over 15 ms, retire the current voice generation, and cancel pending visual messages. Explicit play rebuilds from the raw non-lookahead tick after pause or tick zero after stop; no invalidated event may survive into the next epoch.
- Bound visual-event timeouts independently. Dropping an overloaded visual pulse must not drop or reschedule audio.

This profile prioritizes stable authored playback over minimum monitoring latency because the MVP has no live note-entry surface. It does not replace physical iOS/Android listening, interruption/resume, Bluetooth-route, or thermal-throttling tests.

## Parameter changes

Immediate but smoothed:

- Tempo
- Level
- Filter
- Effects
- Pan

Playhead-relative live replacement:

- Macro-derived patterns
- Chord and melody expression
- Pattern steps
- Ring segments and density
- Instrument and pattern replacement
- Harmony and loop-length changes

These edits never pause or rewind transport. Removed future steps are revoked, newly enabled future steps trigger once when the playhead reaches them, and edits behind the playhead take effect on the next orbit.

Explicit whole-project replacement:

- Major regeneration

Major regeneration is a discrete project action rather than a continuous performance control. It still invalidates future scheduled work before the replacement composition takes over; already-started notes may finish their natural tails.

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
