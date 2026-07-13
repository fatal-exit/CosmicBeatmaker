# Documentation Index and Working Sequence

## Project

**Cosmic Beatmaker**  
A mobile-first 3D groovebox where people build a tiny solar system that becomes a musical loop.

## Canonical product sentence

> Build a solar system. Make a beat. No music theory required.

## Document sequence

### 1. Product intent

- `01_PRODUCT_VISION.md`  
  Audience, problem, promise, design pillars, positioning, and non-goals.

- `02_PRODUCT_REQUIREMENTS.md`  
  MVP capabilities, priorities, user stories, and release boundaries.

### 2. User experience and creative rules

- `03_UX_AND_ACCESSIBILITY.md`  
  First-run experience, mobile interaction, progressive disclosure, accessibility, and responsive layout.

- `04_MUSIC_SYSTEM.md`  
  Harmony guardrails, rhythm grammar, celestial-to-musical mappings, generation rules, and creative depth.

### 3. Engineering design

- `05_TECHNICAL_ARCHITECTURE.md`  
  Stack, module boundaries, timing architecture, persistence, exports, and repository layout.

- `06_STATE_AND_DATA_MODEL.md`  
  Serializable composition schema, commands, undo/redo, seeded generation, and versioning.

- `07_RENDERING_AND_MOBILE_PERFORMANCE.md`  
  Three.js scene design, input model, adaptive quality, budgets, and profiling targets.

- `08_AUDIO_AND_CONTENT_PLAN.md`  
  Audio voices, samples, mixing constraints, preset inventory, and asset production.

### 4. Execution

- `09_IMPLEMENTATION_ROADMAP.md`  
  Milestones and a nine-day build sequence.

- `10_TESTING_AND_ACCEPTANCE.md`  
  Automated tests, manual checks, device matrix, and definition of done.

- `11_FIRST_CODEX_TASK.md`  
  The first prompt to give Codex.

- `12_DECISIONS_AND_OPEN_QUESTIONS.md`  
  Accepted defaults and a controlled list of unresolved decisions.

## Requirement language

- **MUST**: required for the Build Week submission.
- **SHOULD**: strongly preferred, but can be cut to protect the MVP.
- **COULD**: stretch goal only.
- **WON'T**: explicitly excluded from this build.

## Product priority order

1. Stable musical timing
2. Good-sounding beginner defaults
3. Fast, legible touch interaction
4. A complete create-save-share-export loop
5. Clear audiovisual cause and effect
6. Visual spectacle
7. Advanced depth and stretch systems

## Change control

When implementation reveals a necessary change:

1. Record the proposed decision in `12_DECISIONS_AND_OPEN_QUESTIONS.md`.
2. Check whether it violates a MUST requirement or design pillar.
3. Update the most relevant source document.
4. Update affected tests and acceptance criteria.
5. Keep the old decision in the log with a short reason for superseding it.
