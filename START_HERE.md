# Start Here

This pack is designed to be copied into the root of a new Cosmic Beatmaker repository.

## Recommended order

1. Place `AGENTS.md` at the repository root.
2. Place the numbered files inside `docs/`.
3. Open the repository in Codex.
4. Submit the prompt from `docs/11_FIRST_CODEX_TASK.md`.
5. Let Codex inspect the complete documentation pack before scaffolding.
6. Work milestone by milestone using `docs/09_IMPLEMENTATION_ROADMAP.md`.

## Why the pack is split

The files move from stable product intent toward increasingly concrete execution:

- Vision explains what the product is and is not.
- Requirements define what must ship.
- UX and music design describe the user-facing behavior.
- Architecture and data design constrain implementation.
- Rendering and audio plans protect mobile performance and timing.
- The roadmap sequences development around playable vertical slices.
- Acceptance criteria define when each feature is truly complete.

Do not feed Codex a new contradictory mega-prompt for every task. Update the relevant source-of-truth document when a durable decision changes.

## Immediate human decisions

The pack makes pragmatic default choices so implementation can begin:

- React + TypeScript + Vite
- Direct Three.js
- Tone.js
- Four-bar default composition
- Five musical planet roles
- Guided musical safety enabled by default
- Local saves and shareable encoded state
- No accounts, multiplayer, or runtime AI

Change these only deliberately and record the reason.
