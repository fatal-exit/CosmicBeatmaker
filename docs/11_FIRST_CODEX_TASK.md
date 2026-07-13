# First Codex Task

Copy the prompt below into Codex after placing this documentation pack in a new repository.

---

Read `AGENTS.md` and every file in `docs/` before changing the repository.

Your goal for this task is **Milestone 0 only: Repository and contracts** from `docs/09_IMPLEMENTATION_ROADMAP.md`.

Create a Vite application using React and strict TypeScript. Establish the documented architecture without implementing the complete product.

Required outputs:

1. Scaffold the repository and package scripts for:
   - development
   - production build
   - preview
   - typecheck
   - lint
   - formatting
   - unit tests
   - Playwright end-to-end tests

2. Create the initial module structure described in `docs/05_TECHNICAL_ARCHITECTURE.md`.

3. Implement the first version of the serializable domain types from `docs/06_STATE_AND_DATA_MODEL.md`, including:
   - Composition
   - StarState
   - HarmonyState
   - MacroState
   - PlanetState
   - OrbitState
   - PatternState
   - MoonState
   - RingState
   - AsteroidBeltState
   - mix and generation state

4. Implement:
   - stable ID creation
   - a deterministic seeded PRNG with derived sub-seeds
   - basic runtime validation for a composition
   - a function that creates a minimal valid starter composition
   - a central store holding composition and ephemeral UI state separately
   - a bounded undo/redo history foundation

5. Create a minimal responsive application shell with:
   - title
   - placeholder canvas region
   - transport placeholder
   - accessible object-list placeholder
   - mobile bottom-sheet placeholder
   - visible development diagnostics showing current seed and schema version

6. Add unit tests for:
   - deterministic PRNG behavior
   - starter composition validity
   - serialization round-trip
   - undo and redo of one simple command

7. Add a minimal Playwright smoke test that opens the application and confirms the shell loads.

8. Update `docs/12_DECISIONS_AND_OPEN_QUESTIONS.md` with:
   - exact dependency choices
   - any deliberate differences from the documented architecture
   - unresolved blockers

Constraints:

- Do not implement Three.js rendering, Tone.js audio, full onboarding, export, or detailed visual design in this task.
- Do not add a backend.
- Do not add runtime AI.
- Do not put Three.js or Tone.js objects into the domain store.
- Do not broaden the MVP.
- Prefer simple maintainable foundations over speculative abstraction.

Before implementation, summarize the proposed files and dependency choices. Then implement. Run format, typecheck, lint, unit tests, Playwright smoke test, and production build. Fix failures.

Stop when the Milestone 0 stopping condition is satisfied. Report:

- What was created
- Commands run and results
- Important decisions
- Remaining risks before Milestone 1
- Exact recommended next task

---
