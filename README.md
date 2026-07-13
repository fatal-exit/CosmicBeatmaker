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
- Energy, density, groove, space, and complexity macros with undo/redo
- Responsive phone and desktop layouts with semantic HTML canvas alternatives
- Browser-local saves, compact share links, and JSON safety backups
- Offline WAV and multitrack MIDI export
- Reduced-motion, reduced-particle, reduced-flash, and quality controls

## Run locally

Requirements: Node.js 22+ and a modern browser with WebGL and Web Audio.

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:4173>. Browser audio starts only after a user gesture.

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

Tone.js is the authoritative clock. The renderer samples transport ticks; it never advances musical time. Seeded probability decisions use stable identifiers and loop indices, so playback, visuals, MIDI, WAV, saves, and shared links resolve the same composition.

## Product principles

- Start with authored sound instead of an empty canvas.
- Give every audible event an identifiable visual cause.
- Reveal detailed sequencing only when requested.
- Mirror essential canvas actions with keyboard-accessible HTML controls.
- Preserve experimentation through safe generation, stable IDs, validation, and undo.

The complete product and engineering package lives in [`docs/`](docs/00_INDEX.md). [`PRODUCT.md`](PRODUCT.md) records the design register used for the interface.

## Current boundaries

The synthesizer fallback is the current sound source; curated samples and full effect-send routing are future mix work. Structural edits currently reschedule immediately rather than waiting for the next bar. Physical iOS/Android listening and performance passes and cross-browser verification beyond Chromium remain release tasks.

## Repository

Public source: <https://github.com/fatal-exit/CosmicBeatmaker>

Live app: <https://fatal-exit.github.io/CosmicBeatmaker/>

The project is intentionally backend-free: no account and no OpenAI API key are required to make, save, share, or export a system.
