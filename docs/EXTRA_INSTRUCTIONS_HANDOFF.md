# Cosmic Beatmaker — Additional User Instructions

This file preserves the instructions added in conversation after the original documentation package was supplied.

## Canonical project location

All new work must happen in the GitHub working repository:

`/Users/gugogon/Documents/GitHub/CosmicBeatmaker`

The prior location at `/Users/gugogon/Documents/Codex/2026-07-13/i` was a misfire and is not the canonical working copy. Do not continue implementation there.

The source package at `/Users/gugogon/Downloads/cosmic-beatmaker-codex-pack.zip` must remain preserved and should not receive edits.

## Expanded implementation scope

- Do not stop after Milestone 0 or Milestone 1.
- Complete and verify milestones sequentially, then continue into as many later milestones as can be responsibly achieved in the working session.
- Preserve each milestone's architecture, testing, accessibility, mobile, timing, and quality requirements while continuing forward.
- Prioritize a coherent, working product over broad unfinished feature coverage.

## Multi-agent execution

- Delegate and fan out implementation across a team of subagents.
- Keep available agent slots productively occupied when work can be divided into non-overlapping ownership areas.
- Follow the project's warning that canonical composition schema, transport contracts, state store, scene reconciliation, and save format must be settled before parallel work depending on them begins.
- Review and verify every subagent contribution before accepting it.
- Every `spawn_agent` call must set `fork_turns` explicitly, using `"none"` by default.

## GitHub publishing

- Create a public GitHub repository for Cosmic Beatmaker.
- Commit and push coherent progress checkpoints as implementation proceeds.
- Inspect changes and run the relevant quality checks before publishing each checkpoint.
- Do not commit secrets, generated dependency folders, build output, or test artifacts.

## README

- Write a polished project README suited to an OpenAI Build Week submission.
- Explain the product promise: “Build a solar system. Make a beat. No music theory required.”
- Cover the interaction metaphor, beginner-safe music system, technical architecture, local development, verification commands, current milestone status, accessibility/mobile goals, and Build Week context.
- Keep claims aligned with what has actually been implemented.

## Status at relocation

- The complete documentation package has been copied into the GitHub working repository.
- Early Milestone 0 scaffold work from the misfired location may be imported into the GitHub working repository: package/config files, initial composition types, seeded PRNG, and stable-ID utilities.
- No dependencies have been installed yet.
- No Git repository or public GitHub repository has been created yet.
- No commits or pushes have occurred.
