# Decisions and Open Questions

This is a living log. Durable changes should be recorded here and reflected in the relevant source document.

## Accepted product decisions

### D-001 — Product focus

**Decision:** Cosmic Beatmaker is a mobile-first four-bar cosmic groovebox, not a full DAW.

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

### D-010 — Four-bar default

**Decision:** New systems contain four bars. Tracks can loop at half, one, two, or four bars.

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

### D-015 — MVP schema restrictions

**Decision:** Schema version 1 supports four-bar compositions, forward orbits, and track loop lengths of half, one, two, or four bars. Eight-bar and reverse-orbit state require a future migration.

**Reason:** This aligns the canonical contract with the explicit MVP cuts before parallel work depends on it.

### D-016 — Static GitHub Pages deployment

**Decision:** Build the Vite application with the repository base path and deploy `dist` from `main` through the official GitHub Pages Actions workflow.

**Reason:** The application is intentionally backend-free, and an automated public deployment provides a repeatable Build Week demo without adding runtime infrastructure.

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

### Q-003 — Sample delivery format

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
- Eight-bar systems
- Unusual time signatures
- Comets and celestial event arrangement
- Audio stems
- Hardware MIDI
- PWA installation
- Community gallery
