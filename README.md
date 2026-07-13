# Cosmic Beatmaker

Build a solar system. Make a beat. No music theory required.

Cosmic Beatmaker is a mobile-first 3D groovebox created for OpenAI Build Week. A star sets the mood and harmony; planets play beats, bass, chords, melodies, and textures; moons add embellishment; rings sequence regular pulses; and asteroids create controlled irregular percussion. The same musical clock drives both sound and motion.

## What works

- Guided first-minute flow with five beginner-friendly moods
- Five deterministic showcase systems
- Five role-aware musical parts with safe harmony and mix guardrails
- Audio-authoritative transport with play, pause, stop, tempo, mute, and solo
- Three.js solar-system scene with transport-driven orbits and event pulses
- Add, select, duplicate, delete, lock, regenerate, rotate, and resize orbits
- Planetary rings, asteroid percussion, and a precise Focus View step editor
- Live deterministic, role-safe patterns derived from energy, density, groove, space, and complexity, with undo/redo
- Responsive phone and desktop layouts with semantic HTML canvas alternatives
- Browser-local saves, compact share links, and JSON safety backups
- Offline WAV and multitrack MIDI export
- Reduced-motion, reduced-particle, reduced-flash, and quality controls
- Stable seeded procedural planet materials and mood-specific star shaders with a selective additive glow shell
- Canonical pattern-derived orbit gates with common rhythm presets and Focus View step customization
- Audio-clock-aligned planet spawning with a transient highlighted entry marker
- Accessible 44-pixel zoom, rotate, and reset controls with bounded wheel, pinch, and empty-space camera gestures
- Accessible planet deletion with a bounded quality-aware destruction burst, reduced-effects variants, and one-step undo
- Exact polymetric orbit rates from ¼ to 8 bars, unique visual lanes, and complete-super-loop WAV/MIDI export
- Locally implemented 61-asset Ogg pack with 20 user-authored sounds, 41 deterministic procedural renders, lazy live playback, and synth fallback
- Device-aware balanced audio scheduling, bounded callback/voice health guards, stable runtime voice reuse, and fail-silent overload recovery

## Current milestone

Milestone 7 — Visual Material & Interaction Polish is delivered in checkpoint `6474aee`, including deterministic macro-derived patterns, procedural celestial materials, selective additive glow, outlined bodies, animated gates, transport-aligned spawning, and responsive camera navigation.

Milestone 8 — First-Party Sample Pack Pilot is delivered in the same checkpoint with 20 manifest-backed, user-authored stereo 48 kHz Ogg Vorbis assets, lazy Tone playback, per-sample attack/release metadata, and synth fallback. Physical iOS and Android performance and listening checks remain explicit unverified release tasks; browser automation does not establish physical-device FPS or audio quality.

Milestone 9 — Exact Polymeter & Unique Orbit Lanes is also delivered in `6474aee`. The nine supported rates are 0.25, 0.5, 1, 1.5, 2, 3, 4, 6, and 8 bars. Live scheduling, visible orbit periods, WAV, and MIDI share one exact super-loop boundary, while every planet receives a distinct derived spatial lane so duplicate-rate planets never share a path. The supported catalog resynchronizes within 24 bars; exports default to one complete super-loop.

Milestone 10 — Procedural Runtime Sample Cache is complete in this revision. It adds 41 deterministic 48 kHz Ogg Vorbis assets to the 20 user-authored assets for a 61-entry manifest: 32 mono transients and nine stereo tonal/texture sounds, with eight tonal assets rooted at C4 and the low drone at C2. Preset mappings cover the rendered drum, chord, texture, ring, and asteroid voices. Ready samples avoid constructing a fallback synth graph, while loading or failed assets retain event-for-event synthesis. Deterministic rebuild and automated regression checks pass; physical-device listening remains a release task.

The current audio-stability profile uses Tone's balanced worker clock with 120 ms desktop / 180 ms mobile lookahead, fixed master headroom before a -3 dB limiter, bounded scheduled sample voices, duplicate/late-callback admission guards, and a 15 ms fail-silent fade if the scheduler detects an unsafe backlog or repeated trigger failure. The app synchronizes its transport UI to the resulting safety pause and shows a recoverable toast. Physical-device listening and interruption recovery still require release testing.

## Run locally

Requirements: Node.js 22+ and a modern browser with WebGL and Web Audio.

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:4173>. Browser audio starts only after a user gesture.

To rebuild the ignored first-party WAV inputs and the deterministic procedural extension into the committed Ogg manifest and assets, install `ffmpeg`, `ffprobe`, and Xiph `oggenc`, then run `npm run samples:build`. The complete pack is built outside `public/`, validated, and promoted with rollback so a failed rebuild cannot damage the last good pack. New authored WAVs are discovered without changing the expected authored count in code. To regenerate only the 41 procedural assets from an existing authored manifest, run `npm run samples:render`. The procedural renderer also refreshes `src/content/generatedProceduralSampleAssets.ts`.

## Verify

```bash
npm run format:check
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

The Playwright suite runs the onboarding and complete first-minute create/save flow in desktop Chromium and a Pixel 7 profile.

## Architecture

The application keeps musical state serializable and separates responsibilities:

- `src/domain` — schema, deterministic generation, harmony, rhythm, serialization
- `src/audio` — pure event compilation, Tone scheduling, transport, synth voices, WAV/MIDI export
- `src/scene` — Three.js reconciliation, picking, quality profiles, audio-clock animation
- `src/state` — Zustand command history and ephemeral interface state
- `src/persistence` — validated IndexedDB saves and compressed share-state URLs
- `src/ui` — accessible React controls and responsive product workflows

Tone.js is the authoritative clock. The renderer samples transport ticks; it never advances musical time. Each planet's saved orbit rate drives both its visible period and musical pattern period. Exact integer least-common-multiple math derives the active super-loop, and seeded probability decisions use stable identifiers and super-loop indices, so playback, visuals, MIDI, WAV, saves, and shared links resolve the same composition.

## Product principles

- Start with authored sound instead of an empty canvas.
- Give every audible event an identifiable visual cause.
- Reveal detailed sequencing only when requested.
- Mirror essential canvas actions with keyboard-accessible HTML controls.
- Preserve experimentation through safe generation, stable IDs, validation, and undo.

The complete product and engineering package lives in [`docs/`](docs/00_INDEX.md). [`PRODUCT.md`](PRODUCT.md) records the design register used for the interface.

## Current boundaries

The current 20 user-authored and 41 procedural sample assets are implemented for live playback, while synthesis remains their loading/error fallback and the offline WAV rendering path; MIDI remains sample-independent. Full effect-send routing, next-bar structural replacement quantization, detailed audio-health diagnostics, and physical interruption/resume validation remain future reliability and mix work. Physical iOS/Android listening and performance passes and cross-browser verification beyond Chromium remain release tasks.

## Repository

Public source: <https://github.com/fatal-exit/CosmicBeatmaker>

Live app: <https://fatal-exit.github.io/CosmicBeatmaker/>

The project is intentionally backend-free: no account and no OpenAI API key are required to make, save, share, or export a system.
