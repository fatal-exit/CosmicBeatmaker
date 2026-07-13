# Cosmic Beatmaker — Codex Project Instructions

## Mission

Build **Cosmic Beatmaker**, a mobile-first 3D groovebox where anyone can create a good-sounding musical loop by building a miniature solar system.

The product itself does **not** require an OpenAI API or runtime AI feature. Codex is the development partner.

## Source of truth

Read these before making architectural or product changes:

1. `docs/00_INDEX.md`
2. `docs/01_PRODUCT_VISION.md`
3. `docs/02_PRODUCT_REQUIREMENTS.md`
4. `docs/03_UX_AND_ACCESSIBILITY.md`
5. `docs/04_MUSIC_SYSTEM.md`
6. `docs/05_TECHNICAL_ARCHITECTURE.md`
7. `docs/06_STATE_AND_DATA_MODEL.md`
8. `docs/07_RENDERING_AND_MOBILE_PERFORMANCE.md`
9. `docs/08_AUDIO_AND_CONTENT_PLAN.md`
10. `docs/09_IMPLEMENTATION_ROADMAP.md`
11. `docs/10_TESTING_AND_ACCEPTANCE.md`
12. `docs/12_DECISIONS_AND_OPEN_QUESTIONS.md`

Use `docs/11_FIRST_CODEX_TASK.md` to begin implementation.

## Product rules

- A complete beginner should make a satisfying loop within one minute.
- One solar system represents one looping musical composition.
- The default experience must be musically safe, touch-friendly, and understandable without theory knowledge.
- Every audible event should have a visible cause.
- The audio clock is authoritative. Rendering must never drive musical timing.
- Progressive disclosure is mandatory: simple macro controls first, detailed sequencing second.
- WebGL through Three.js is the baseline. WebGPU is not required.
- Mobile usability is part of the MVP, not post-launch polish.
- Prefer a small polished system over broad unfinished features.

## Technical direction

- TypeScript with strict type checking.
- Vite-based web app.
- React for accessible DOM UI.
- Direct Three.js integration rather than React Three Fiber.
- Tone.js for transport, synthesis, scheduling, and offline rendering.
- Central serializable state model with deterministic seeded generation.
- Vitest for logic tests and Playwright for critical user flows.
- Static deployment; no required backend or account system.

## Engineering standards

- Keep simulation, audio scheduling, rendering, UI, and persistence separated.
- Keep core composition state serializable and versioned.
- Avoid hidden global mutable state.
- Prefer data-driven presets over hard-coded special cases.
- Add tests for deterministic generation, music constraints, serialization, and exports.
- Maintain usable keyboard focus and HTML alternatives to canvas-only controls.
- Do not introduce a dependency without recording why in `docs/12_DECISIONS_AND_OPEN_QUESTIONS.md`.
- Do not silently expand the MVP.

## Working method

For each milestone:

1. Restate the milestone goal and stopping condition.
2. Inspect the relevant docs and existing code.
3. Propose a focused implementation plan.
4. Implement in small coherent changes.
5. Run format, typecheck, tests, and production build.
6. Manually verify the milestone acceptance flow.
7. Update documentation when implementation changes a decision.
8. Stop at the milestone boundary and report remaining risks.

## GitHub publishing and checkpoints

- The canonical repository is `/Users/gugogon/Documents/GitHub/CosmicBeatmaker`.
- Create and maintain a public GitHub repository for the project.
- After each milestone, inspect the complete diff and run the milestone's required quality checks before committing and pushing it.
- After the milestone sequence, commit and push each later major coherent change after review and relevant verification.
- Use intentional commit messages that describe the delivered behavior; do not batch unrelated changes.
- Never commit secrets, dependency folders, build output, browser artifacts, or generated test output.
- Subagents may implement and verify assigned files, but the primary agent owns repository-wide checkpoint commits and pushes.

When requirements conflict, prioritize:

1. Musical timing and correctness
2. Beginner usability
3. Mobile interaction and performance
4. Data integrity and deterministic behavior
5. Visual polish
6. Stretch features
