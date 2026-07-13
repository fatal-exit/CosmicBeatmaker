# Testing and Acceptance

## Testing philosophy

The highest-risk failures are:

1. Bad or unstable musical timing
2. Generated systems that sound incoherent
3. Touch interactions that fail on phones
4. State that cannot be restored or exported
5. Visual performance that interferes with editing
6. Accessibility regressions hidden by the canvas

Automated tests should focus heavily on pure domain logic. Manual testing should focus on audio perception, touch behavior, and device performance.

## Unit tests

### Seeded generation

- Same seed and generator version produce identical composition state.
- Different seeds produce meaningful variation.
- Regenerating one unlocked domain preserves locked domains.
- No use of `Math.random()` inside generation.
- Validation repair remains deterministic.

### Harmony

- Scale degrees resolve correctly.
- Chord tones resolve correctly for every progression.
- Safe Harmony produces in-scale notes.
- Bass note ranges remain valid.
- Harmony changes transpose or re-resolve notes safely.
- Voice-leading output remains within configured bounds.

### Rhythm

- Template anchors remain present under safe density changes.
- Event steps remain in bounds.
- Pattern rotation wraps correctly.
- Swing calculation remains bounded.
- Probability decisions are deterministic for seed, loop, and event.
- Rings maintain segment-array invariants.
- Asteroid clustering stays within configured density limits.

### State

- Commands produce expected state.
- Undo and redo restore exact audible state.
- Slider edits coalesce correctly.
- Delete and regeneration are undoable.
- IDs remain stable.
- Derived selectors return correct audible objects.

### Serialization

- Save and load round-trip exactly.
- Share encode and decode round-trip.
- Invalid input fails safely.
- Unknown future schema version produces a useful error.
- Migration fixtures produce valid current state.
- Encoded state remains under the agreed size target for typical systems.

### Export

- MIDI contains tempo.
- MIDI track count and names are correct.
- Note timing, velocity, and duration match source events.
- Percussion mapping remains stable.
- Offline render duration includes expected loops and effect tail.
- Rendered audio does not exceed clipping threshold.

## Integration tests

### Audio engine

- Starts only after user gesture.
- Play, pause, resume, and stop preserve expected position.
- Pattern replacement occurs at defined quantization boundary.
- Muting and soloing update without clicks.
- Tempo changes do not desynchronize visual phase.
- Audio continues correctly during artificial render slowdown.

### Scene reconciliation

- Add creates exactly one runtime object set.
- Delete disposes runtime resources.
- Undo restores scene and audio object.
- Repeated create-delete cycles do not increase object count.
- Selection and mute appearance match state.

### Persistence

- Local save list reflects create, rename, duplicate, and delete.
- A storage failure offers JSON fallback.
- Shared state opens without overwriting local work unexpectedly.

## End-to-end flows

### First-minute flow

1. Open app.
2. Start audio.
3. Choose mood.
4. Hear starter system.
5. Add bass planet.
6. Change orbit shell.
7. Add ring.
8. Save.

Acceptance:

- No technical terminology required.
- No dead end.
- Works at phone viewport.
- Meaningful sound change after each edit.

### Generation flow

1. Open existing system.
2. Lock harmony and melody.
3. Regenerate unlocked parts.
4. Undo.
5. Redo.
6. Copy share link.
7. Open in clean browser context.

Acceptance:

- Locked data unchanged.
- Undo returns exact previous system.
- Shared system sounds and looks equivalent.

### Export flow

1. Export four-loop WAV.
2. Export MIDI.
3. Download JSON.
4. Reopen JSON if import is supported.

Acceptance:

- Files download.
- WAV has correct approximate duration and no clipping.
- MIDI opens in at least one external DAW or MIDI inspector.
- Track names are useful.

### Accessibility flow

1. Navigate primary UI by keyboard.
2. Select object through HTML list.
3. Change orbit length with buttons.
4. Mute and unmute.
5. Enable reduced motion.
6. Open Focus View.

Acceptance:

- Focus order is logical.
- Focus visible.
- Canvas manipulation has DOM alternatives.
- Reduced motion removes unnecessary movement without hiding state.

## Manual listening matrix

For at least 20 seeds:

- Listen on headphones.
- Listen on phone speaker.
- Test minimum and maximum density.
- Test minimum and maximum energy.
- Change every harmony preset.
- Regenerate one role.
- Add moons and ring.
- Confirm no obvious clipping, harshness, or low-frequency collapse.

Track failures by category:

- Harmony
- Groove
- Register
- Mix
- Repetition
- Excess density
- Visual mismatch

A target of at least 80% immediately usable seeds is required before polish.

## Device and browser matrix

Minimum practical matrix:

- Desktop Chromium
- Desktop Firefox
- Desktop Safari where available
- iOS Safari on physical device
- Android Chromium on physical device
- Narrow portrait viewport
- Tablet-sized viewport

WebGPU is irrelevant to the pass condition. WebGL and Web Audio are the baseline.

## Performance checks

Measure:

- Average frame time
- Worst interaction latency
- Draw calls
- Triangle count
- Active audio voices
- Audio glitches
- Heap or resource growth after repeated edits
- Initial audio-ready time
- Share-state size
- Export duration

Stress scenario:

- 8 planets
- 3 moons on several planets
- Rings on eligible planets
- Asteroid belt
- Active visual effects
- Inspector interaction during playback

## Accessibility checks

- Semantic button names
- Form labels
- Keyboard access
- Focus visibility
- Contrast
- Browser text zoom
- Reduced motion
- No color-only distinction
- Master stop available
- No essential flashing
- Touch target size

Use automated accessibility tooling as support, not as a substitute for manual checks.

## Release definition of done

The submission is ready only when:

- Production build passes.
- Typecheck, lint, unit tests, and critical E2E tests pass.
- The first-minute user flow works on physical mobile hardware.
- Audio timing does not depend on frame rate.
- Five showcase systems are present.
- At least 20 generated seeds have been reviewed.
- Save, share, WAV, and MIDI flows work.
- No known issue risks data loss.
- Reduced motion and touch alternatives work.
- The demo can be completed reliably without developer tools.
