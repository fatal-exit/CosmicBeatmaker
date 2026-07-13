# Decisions and Open Questions

This is a living log. Durable changes should be recorded here and reflected in the relevant source document.

## Accepted product decisions

### D-001 — Product focus

**Decision:** Cosmic Beatmaker is a mobile-first four-bar-phrase cosmic groovebox with polymetric orbits, not a full DAW.

**Reason:** A focused loop instrument can be polished within Build Week and is easier for non-musicians to understand.

### D-002 — No runtime AI requirement

**Decision:** The product will not require an OpenAI API or a live AI feature.

**Reason:** The creative system is already distinctive, and Codex is the development tool rather than a product dependency.

### D-003 — Beginner-safe defaults

**Decision:** Safe Harmony, pentatonic melody defaults, curated progressions, rhythm templates, and automatic mix limits are enabled by default.

**Reason:** The first-session promise depends on users being able to experiment without frequently producing unpleasant results.

### D-004 — Progressive disclosure

**Decision:** Plain-language macro controls appear first; pattern, harmony, and effects details live in expandable deeper views.

**Reason:** Beginner accessibility and musician depth can coexist without duplicating the whole interface.

### D-005 — One authoritative composition model

**Decision:** Live playback, rendering, save, share, WAV, and MIDI all derive from the same versioned serializable state.

**Reason:** This protects determinism and avoids drift between features.

## Accepted technical decisions

### D-006 — Three.js WebGL baseline

**Decision:** Use direct Three.js with `WebGLRenderer`. Do not require WebGPU.

**Reason:** Mobile compatibility and predictable browser coverage are core requirements.

### D-007 — React for UI, direct Three.js for scene

**Decision:** Use React for accessible HTML UI and a separate imperative Three.js scene controller.

**Reason:** This keeps accessibility strong without representing every scene object through React.

### D-008 — Tone.js for audio

**Decision:** Use Tone.js for transport, scheduling, voices, effects, and offline rendering.

**Reason:** It reduces build-week risk while preserving an architecture that keeps canonical state library-independent.

### D-009 — Static application

**Decision:** Use local persistence and shareable encoded state without a required backend.

**Reason:** Accounts and server infrastructure do not strengthen the core experience enough for the initial build.

### D-010 — Four-bar default (rate catalog superseded by D-020)

**Decision:** New systems retain a four-bar canonical harmony phrase. Individual planet orbit periods are governed by D-020.

**Reason:** Four bars are enough for musical identity while remaining visually and technically manageable.

### D-011 — Zustand command store and bounded snapshots

**Decision:** Use Zustand for the application store, with composition and ephemeral UI state held separately. All meaningful composition edits pass through pure typed commands and a bounded snapshot history of at least 50 actions.

**Reason:** Zustand keeps React integration small while explicit commands preserve validation, deterministic undo/redo, and library-independent domain state.

### D-012 — Styling and product palette

**Decision:** Use one responsive semantic DOM tree with vanilla CSS custom properties. The restrained dark product palette uses OKLCH tokens anchored by warm coral and a cyan state accent; it avoids the expected purple sci-fi dashboard treatment.

**Reason:** Plain CSS keeps the mobile shell small and accessible, while a restrained product vocabulary leaves the musical scene as the focus.

### D-013 — Focused runtime dependencies

**Decision:** Use `three` for the WebGL scene, `tone` for transport and synthesis, `@tonejs/midi` for Standard MIDI File generation, `fflate` for compact share-state compression, `zod` for runtime schema validation, and `zustand` for state.

**Reason:** Each package removes a major Build Week risk behind an adapter and none owns canonical composition state.

### D-014 — Deterministic probability and structural quantization

**Decision:** Probabilistic events evolve deterministically from composition seed, event ID, and loop index. Stop resets the loop index; pause and resume preserve it; exports begin at loop zero. Loop-length, harmony, voice, and regeneration changes apply at the next bar boundary.

**Reason:** Live playback, visual pulses, and exports must make the same decisions while avoiding abrupt structural changes mid-phrase.

### D-015 — MVP schema restrictions (superseded by D-020)

**Decision:** The initial schema-version-1 restriction allowed four-bar compositions, forward orbits, and track loop lengths of half, one, two, or four bars. D-020 supersedes the rate and saved-shell restrictions before a stable save-compatibility promise.

**Reason:** This aligns the canonical contract with the explicit MVP cuts before parallel work depends on it.

### D-016 — Static GitHub Pages deployment

**Decision:** Build the Vite application with the repository base path and deploy `dist` from `main` through the official GitHub Pages Actions workflow.

**Reason:** The application is intentionally backend-free, and an automated public deployment provides a repeatable Build Week demo without adding runtime infrastructure.

### D-017 — Procedural materials without full-screen bloom

**Decision:** Use small custom Three.js `ShaderMaterial` surfaces for planets and stars. Planet uniforms derive from musical role and stable seed namespaces; star uniforms derive from the authored mood preset. Create glow only on selected scene elements with lightweight transparent additive shell meshes. Do not add an `EffectComposer` or full-screen bloom pass for this milestone.

**Reason:** Role- and preset-specific shader parameters create a recognizable visual system without high-resolution texture assets or a terrain simulator. Seed-derived static parameters keep save, share, reload, and regeneration visually deterministic, while time remains an ephemeral render input. Additive shells avoid the extra render targets, full-scene passes, memory pressure, and fill-rate cost of post-processing bloom on mobile. Quality profiles can omit optional shells and expensive shader motion, and reduced-motion or reduced-flash preferences can attenuate animation and pulses without removing selection, transport, or audible-event cues. This approach adds no runtime dependency and keeps the scene attractive when optional effects are disabled.

### D-018 — Canonical orbit gates and audio-clock spawn alignment

**Decision:** Render planet and moon orbit gates as runtime projections of their existing `PatternState.events`. Common rhythm preset choices replace planet events through the normal command path, while step-level Focus View edits operate on the same data; there is no separate gate sequence. Resting gate angles are a deterministic nominal preview derived from pattern step, loop, and phase. The scheduler's visual event message identifies the exact event and its swing- and humanize-adjusted transport tick; when that occurrence is admitted, the renderer corrects and pulses the matching gate at the audio-clock-derived phase. A gate trigger is therefore a semantic audio-clock event rather than a mesh intersection detected by a render frame. When a planet is added during playback, sample the authoritative transport tick, normalize it within the composition's active super-loop, and derive the planet's current orbit position from that tick, its loop length, and its stored phase. Show a short-lived highlighted marker at the computed spawn position.

Do not serialize gate runtime state, spawn markers, creation wall-clock time, sampled transport ticks, or effect expiry. Existing pattern events, orbit data, the canonical four-bar harmony phrase, and seeds are sufficient to derive the active super-loop; this milestone adds no spawn field. Any future need for persisted spawn semantics requires a separate recorded decision and schema migration.

**Reason:** One canonical event collection keeps preset selection, Focus View editing, macro projection, undo, playback, export, and visible gates synchronized. A nominal preview keeps gates stable before playback, while keying the occurrence-time correction and pulse to the scheduled event preserves audio-visual causality through swing, humanize, probability, and frame drops. Deriving a newly reconciled planet's position from the same audio clock as every existing orbit prevents a mid-playback object from appearing to start its own local timeline. Keeping the marker and sampled timing ephemeral preserves deterministic save and share behavior, avoids meaningless wall-clock data, and lets quality and reduced-effect preferences simplify the transient without hiding where the object entered.

### D-019 — Manifest-driven Ogg sample pilot with synth safety

**Decision:** Publish the first-party web sample pilot as manifest-driven Ogg Vorbis assets encoded at quality 5 and 48 kHz with Xiph `oggenc`. The current 20 authored sources and generated assets are stereo; the processor preserves authored channel layout, applies no gain or normalization, and trims only terminal silence lasting at least 120 ms below -60 dBFS while retaining 30 ms after the audible tail. Raw WAV inputs remain untouched, ignored, and uncommitted. Generated Ogg assets and their manifest are committed outputs.

Use `scripts/process-samples.mjs` as the repeatable processor. It requires `ffmpeg`, `ffprobe`, and Xiph `oggenc` on `PATH`, recursively discovers WAV inputs, assigns stable collision-checked IDs, removes stale outputs, and records source, output, processing, level, license, authorship, and playback-envelope metadata. Per-sample attack and release metadata shapes playback without rewriting the source: punchy transients retain near-immediate attack, softer or style-dependent samples may use a subtle fade-in, and long 2.182-second samples release before the file boundary.

Live Tone sample voices load lazily for active presets after audio unlock. Synthesis plays the same scheduled event while a sample is loading and after any fetch, decode, or trigger failure. Offline WAV rendering remains synth-only for this pilot, and MIDI stays on the existing canonical note-event export path.

**Reason:** Ogg Vorbis quality 5 materially reduces mobile delivery size while keeping the first-party source character, stereo image, and tails. A manifest and deterministic processor make the current pack reviewable and future arrivals repeatable without committing large raw masters. Avoiding normalization preserves authored gain relationships, while envelope metadata provides restrained stylistic shaping without destructively editing sources. Lazy loading limits startup work, synthesis prevents missing samples from creating silence, base-aware URLs remain compatible with GitHub Pages, and retaining the established synth-based export paths avoids expanding offline-rendering risk during the pilot.

### D-020 — Exact polymetric rates, unique visual lanes, and super-loop export

**Decision:** Support planet orbit periods of exactly 0.25, 0.5, 1, 1.5, 2, 3, 4, 6, and 8 bars. Represent those periods as 1, 2, 4, 6, 8, 12, 16, 24, and 32 quarter-bar units and compute synchronization with integer greatest-common-divisor/least-common-multiple math. The canonical four-bar harmony phrase remains part of the timing period, so the active audible sources and harmony resynchronize on a derived super-loop; 3- and 4-bar orbits meet after 12 bars, 6- and 8-bar orbits meet after 24, and the supported catalog is bounded at 24 bars.

One stored `loopBars` value drives both the planet's visible angular period and its musical pattern period. Live scheduling, visible event causality, offline WAV, and MIDI compile from that same period and super-loop. Export defaults to one complete super-loop and offers 1×, 2×, or 4× repetitions of the whole boundary, with exact bar and musical-duration copy.

Spatial placement is independent from musical rate. Every planet receives a unique runtime orbit lane derived by rate order and stable composition order/ID; planets at the same rate receive neighboring distinct lanes and never share a path through one another. The lane is a rendering projection rather than audible or serialized composition intent. Camera scale and user zoom remain independent from rate and fit the expanded lane set; essential planet/star silhouette outlines remain available when zoomed out, while optional additive glow is still a separate quality effect.

The early test build updates schema-version-1 validation in place: `loopBars` accepts the exact catalog, the old rate-to-shell interpretation is removed, and serialized `shellIndex` is deprecated/relaxed rather than treated as authoritative placement. Pre-milestone local saves and share links are intentionally not guaranteed to remain compatible; no migration layer is carried solely to preserve the rejected shared-shell model. D-020 supersedes the rate and shell restrictions in D-010 and D-015.

**Reason:** Integer quarter-bar math avoids floating-point LCM errors, and one derived super-loop keeps live playback, visual phase, probability indexing, WAV, and MIDI on the same boundary. Whole-super-loop export never cuts a long orbit before it returns to the beginning. Separating musical rate from spatial lane preserves the rate metaphor without allowing planets to overlap on a shared track, while bounded 24-bar synchronization and explicit 1×/2×/4× export choices constrain scheduler, render, and file-size cost.

### D-021 — Balanced audio runtime with bounded fail-silent health guards

**Decision:** Use Tone's balanced worker-clock context with device-class scheduling profiles: desktop uses 120 ms lookahead, 30 ms cadence, and an 80 ms lateness threshold; mobile uses 180 ms, 45 ms, and 120 ms. The scheduler admits each source-cycle occurrence once, drops stale/duplicate callbacks, bounds callback bursts and its occurrence ledger, and halts on invalid time, timeline regression, 16 consecutive late callbacks, more than 128 callbacks in 50 ms, ledger overflow at 4,096 keys, or four consecutive voice-trigger errors.

Reconcile runtime voices by stable track ID and role/preset compatibility so pattern or mix changes do not reload compatible nodes. Cap each unique drum sample at six scheduled overlapping sources and each pitched sample voice at sixteen. Apply a 0.72 master-headroom factor into a -3 dB limiter. On a health failure, clear scheduling, fade master output to zero over 15 ms, release voices, and pause transport; explicit play may attempt a clean rebuild. Bound visual callback queues independently and allow visual pulse drops without changing audio scheduling.

**Reason:** Cosmic Beatmaker is a sequenced groovebox rather than a live monitoring instrument, so modest lookahead is safer than minimum latency on mobile. Fixed callback, ledger, voice, and output bounds prevent delayed timers, duplicated callbacks, sample tails, or repeated trigger failures from escalating into an audible backlog or sustained overload. Stable-node reconciliation reduces churn and decode pressure while the audio-clock-only admission path preserves rendering independence. Physical-device interruption, route-change, thermal, and listening tests remain mandatory because browser automation cannot validate them.

### Current implementation note for D-014

Deterministic probability, transport reset/resume behavior, and export loop indexing are implemented. Structural composition replacements currently reschedule immediately; next-bar replacement quantization remains a known reliability task.

## Open questions before implementation

### Q-001 — State library (resolved by D-011)

Default recommendation: Zustand with an explicit command/history layer.

Question:

- Does the project use Zustand, or a smaller custom external store?

Decision deadline: Milestone 0.

### Q-002 — UI styling (resolved by D-012)

Default recommendation: plain CSS with custom properties and scoped component styles.

Question:

- CSS Modules, vanilla CSS, or another lightweight approach?

Decision deadline: Milestone 0.

### Q-003 — Sample delivery format (resolved by D-019)

Question:

- Which combination of OGG, MP3, and synthesized fallback provides the best practical mobile support and download size?

Decision deadline: before audio content production in Milestone 2.

### Q-004 — Offline rendering fallback

Question:

- If a selected browser cannot reliably offline-render all sample voices, should the app offer real-time recording as a fallback or disable WAV export with a clear explanation?

Decision deadline: early Milestone 5.

### Q-005 — Share encoding (resolved)

Candidates:

- Compressed JSON in URL fragment
- Compact custom binary or schema
- Seed-only for untouched systems plus full state for edited systems

Decision: Full versioned composition JSON compressed with `fflate`, base64url encoded in a codec-versioned URL fragment, and validated before opening. Seed-only links are deferred until pristine provenance is modeled.

### Q-006 — Probability behavior (resolved by D-014)

Question:

- Should probabilistic events repeat identically every loop, evolve deterministically by loop index, or expose both modes?

Default recommendation: evolve deterministically by loop index.

Decision deadline: Milestone 2.

### Q-007 — Planet naming

Question:

- Automatically generate thematic names, use role labels by default, or both?

Default recommendation: role label plus generated optional name.

Decision deadline: Milestone 2.

### Q-008 — Advanced mode boundary

Question:

- Is Safe Harmony a simple toggle, or is there a broader Guided/Advanced mode?

Default recommendation: keep one interface and use expandable sections, with Safe Harmony as a specific toggle.

Decision deadline: Milestone 4.

## Deferred questions

These should not block the MVP:

- Binary star behavior
- Eight-bar harmonic phrases; 8-bar planet orbits are already supported by D-020
- Unusual time signatures
- Comets and celestial event arrangement
- Audio stems
- Hardware MIDI
- PWA installation
- Community gallery
