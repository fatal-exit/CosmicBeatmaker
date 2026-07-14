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
- Closed, Open, and Wide chord settings produce ordered, bounded voicings with no adjacent dissonant clusters.
- Chord complexity adds only safe separated chord or scale tones, and pitched chord-pattern events still compile as full chords.
- Melody pitch variety remains bounded, while ascending, descending, and alternating contour projections are deterministic.

### Rhythm

- Template anchors remain present under safe density changes.
- Event steps remain in bounds.
- Pattern rotation wraps correctly.
- Swing calculation remains bounded.
- Probability decisions are deterministic for seed, loop, and event.
- Rings maintain segment-array invariants.
- Ring density deterministically activates the requested number of visible segments in a role-safe order.
- Melody rings produce quieter pitch-matched notes adjacent to motif notes, chord rings replace sustained parent voicings with articulated single-note arpeggios, and bass rings produce syncopated octave pickups. A chord ring added during playback joins the remainder of the current cycle without waiting for a full orbit boundary.
- Asteroid clustering stays within configured density limits.
- The exact orbit catalog is `[0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8]` bars and round-trips without floating approximation.
- Quarter-bar integer LCM yields 12 bars for 3 + 4, 24 bars for 6 + 8, and never exceeds 24 bars for the supported catalog.
- Changing a planet to 1.5 or 3 bars simplifies 16-step patterns to 12 and 32-step patterns to 24, keeps surviving event IDs and steps stable, and never leaves a previously active planet silent.
- Changing that planet back to an ordinary rate restores 12-step patterns to 16 and 24-step patterns to 32 while keeping surviving event IDs and steps stable.

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
- Schema-version-1 expression migration derives stable role-appropriate defaults from saved harmony and macro state.
- Encoded state remains under the agreed size target for typical systems.

### Export

- MIDI contains tempo.
- MIDI track count and names are correct.
- Note timing, velocity, and duration match source events.
- Percussion mapping remains stable.
- Offline render duration includes expected loops and effect tail.
- WAV and MIDI default to one complete active super-loop; 2× and 4× repeat only whole super-loops.
- Rendered audio does not exceed clipping threshold.

## Integration tests

### Audio engine

- Starts only after user gesture.
- Play, pause, resume, and stop preserve expected position.
- Pattern replacement occurs at defined quantization boundary.
- Muting and soloing update without clicks.
- Tempo changes do not desynchronize visual phase.
- Audio continues correctly during artificial render slowdown.
- Desktop/mobile runtime profiles apply their exact lookahead, cadence, and late-event thresholds.
- Duplicate and stale callbacks cannot retrigger the same source or replay an audible backlog.
- Future within-cycle events remain transport-owned exact-tick one-shots until their own callbacks; replacing a schedule clears those one-shots and retained callbacks are revision-fenced.
- Rapid tempo sweeps do not rebuild registrations or voices. Rapid global-macro, chord-expression, melody-expression, primary-step, ring-step, ring-density, and source-topology edits retain one transport epoch and output gate, cancel only future per-event handles, and never release an already-started note.
- Live pattern edits preserve the current transport tick and playing state. Newly enabled steps ahead of the playhead trigger once at their tick, including across the already-processed lookahead frontier; removed future steps do not trigger, and edited past steps wait for the next source cycle.
- Pause and stop clear repeats, pending one-shots, and pending visuals, synchronously remove the current voice generation from routing, fade its isolated gate, and prevent immediate resume from exposing a pre-pause attack; stop restarts probability and scheduling from tick zero.
- Callback bursts, ledger overflow, timeline regression, and repeated trigger errors fail silent within bounded state.
- Runtime voice reconciliation reuses compatible track strips and voices across structural edits. Removed or preset-incompatible voices reject new attacks and dispose only after active natural tails; preset changes re-admit unsounded lookahead hits into the replacement voice. Per-URL decoded sample caching bounds event-owned samplers to one fetch/decode per first-party asset.
- Scheduled sample overlap never exceeds the six-source drum or sixteen-source pitched budgets, and cancelling/rescheduling more than the budget capacity releases every stale reservation immediately.
- The master applies 0.72 headroom before a -3 dB limiter and health failure fades to zero over 15 ms.

### Sample content pipeline

- The authored processor produces exactly 20 user-authored outputs before the procedural merge.
- The procedural renderer adds exactly 41 assets for a 61-entry merged manifest without mutating the authored inputs or entries.
- Exactly 30 procedural upper voices carry the stereo space-reverb contract, point back to a source labeled Legacy Dry, and ship under distinct `-space` IDs; none of the corresponding Legacy Dry IDs or files appears in the pack.
- The canonical builder discovers future authored additions dynamically, stages outside the deploy tree, and restores the prior pack and runtime inventory after an injected promotion failure.
- Procedural reruns under the same renderer and codec toolchain preserve stable IDs, inventory, channel contracts, synthesis-version metadata, and encoded output.
- The procedural inventory contains 10 mono low/percussion assets and 31 stereo assets, including the 30 spatialized replacements, all at 48 kHz with safe encoded peaks.
- The generated TypeScript inventory and manifest agree on every procedural ID, URL, duration, category, attack, and release value.
- Unsafe IDs, stale procedural paths, non-finite or silent PCM, duration/format drift, and excessive encoded size fail before promotion.
- Until runtime preset integration is complete, unmapped patches continue using synth voices. Once mapped, loading and forced sample failures still trigger the same scheduled event through the synth fallback.
- Offline WAV output remains deterministic and synth-based through bounded shared track voices; a real browser WAV download completes without allocating one instrument graph per compiled occurrence. MIDI remains independent of sample availability.
- Each role exposes at least three described built-in sounds, and a `SetPlanetSoundPreset` edit preserves pattern/orbit state while updating a tonal ring to the parent sound.
- Monophonic pitch analysis identifies reference sine tones within a semitone and rejects silence instead of claiming a root.
- A registered local pitched sound or partial drum kit resolves through the same live preset and asset lookup while built-in manifest behavior remains unchanged.

### Scene reconciliation

- Add creates exactly one runtime object set.
- Delete disposes runtime resources.
- Undo restores scene and audio object.
- Repeated create-delete cycles do not increase object count.
- Selection and mute appearance match state.
- Every planet has a unique deterministic orbit lane; duplicate-rate planets occupy neighboring lanes and do not share a path.
- Role-derived body radii preserve the gas giant > super-Earth > ice world > rocky world > dwarf world hierarchy, gas giants retain an oblate silhouette, and ring radius/fragments scale with the parent body.
- Adjacent lane center distances are at least the sum of both planets' current visual envelopes plus the shared lane gap; adding or removing rings and moons recalculates spacing deterministically.
- Rate changes preserve camera zoom/rotation, while auto-fit and essential outlines keep expanded lanes legible.
- Wide desktop Auto and explicit High create the denser geometry tier, detailed deep-space shader, procedural normal detail, and bloom compositor; changing to Balanced or Low disposes High-only targets, binds the lightweight nebula/star shader, and leaves composition and transport state unchanged.
- Star-preset changes update both the incident planet-light color and the seeded deep-space palette without introducing serialized renderer state.
- Whenever composition state contains a star descriptor, reconciliation and the render loop maintain one attached central-star model with a visible surface, silhouette, and compact corona; a null or detached runtime is recreated or reattached independently of planet lane spacing and reduced-effects state.

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
6. Change orbit rate.
7. Add ring.
8. Save.

Acceptance:

- No technical terminology required.
- No dead end.
- Works at phone viewport.
- Meaningful sound change after each edit.

### Sound-choice flow

1. Select a melody planet through the semantic object list.
2. Change its labelled Instrument or kit select to another built-in sound.
3. Expand Use your own sample, choose a short tonal file, and review the detected source note.
4. Correct the note if needed, add the sound, and confirm it becomes the selected option.
5. Select a beat planet and confirm Build your own drum kit exposes individually labelled slots.

Acceptance:

- Built-in selection remains keyboard-usable without opening theory or expression controls.
- The selected planet keeps the same pattern and orbit.
- Pitch analysis status is announced and the source note is keyboard-editable.
- Local custom audio is clearly described as device-local with synth fallback for share and WAV.
- The flow has no unlabelled file input and every control meets the 44-pixel target policy.

### Beginner controls and gate-detail flow

1. Use welcome-screen Surprise Me and confirm a complete system starts playing.
2. Confirm only Energy, Activity, and Space are present in the default macro surface.
3. Select a planet, use its separate Surprise action, and confirm neighboring planets keep their stable state.
4. Confirm a half-bar orbit offers 4/8 steps, one- and two-bar orbits offer 8/16, and a four-bar orbit offers 8/16/32; open the circular pattern editor after a change.
5. Enable Advanced, confirm six macro controls, then confirm 1½ bars offers 6/12 polyrhythm steps and three bars offers 12/24.
6. Toggle a gate in the scene and semantic grid, rotate the selected orbit arc, and nudge an active melody gate with both radial drag and labelled pitch buttons.

Acceptance:

- Whole-system and per-planet Surprise are distinct, undoable, deterministic, and lock-aware.
- Step resizing preserves normalized rhythmic landmarks and never leaves an out-of-range event.
- Beat landmarks are visibly strongest, offbeat eighths use a secondary emphasis, and fine subdivisions remain legible without competing.
- Simple step choices and every semantic editor target meet the 44-pixel touch policy at phone size.
- Advanced mode alone exposes the orbit-appropriate 6/12/24 polyrhythms and the full six-control macro surface.

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

1. Export the default one-super-loop WAV.
2. Export MIDI.
3. Download JSON.
4. Reopen JSON if import is supported.

Acceptance:

- Files download.
- The panel states the exact super-loop bars and musical duration; WAV has that content plus its disclosed effects tail and no clipping.
- MIDI opens in at least one external DAW or MIDI inspector.
- Track names are useful.

### Accessibility flow

1. Navigate primary UI by keyboard.
2. Select object through HTML list.
3. Change orbit rate with semantic buttons or the deeper-rate select.
4. Mute and unmute.
5. Enable reduced motion.
6. Open Focus View.
7. Change the step count, toggle a gate, and change a melody gate pitch without using the canvas.

Acceptance:

- Focus order is logical.
- Focus visible.
- Canvas manipulation has DOM alternatives.
- Reduced motion removes unnecessary movement without hiding state.

### Polymeter flow

1. Open the stable complete demo containing a 4-bar planet.
2. Select another planet through semantic HTML controls.
3. Choose the deeper 3-bar orbit rate.
4. Confirm the visible rate label and 12-bar system sync.
5. Open export.

Acceptance:

- The selected control explains that rate changes both the visible orbit period and musical pattern period.
- The export panel defaults to 1× and states 12 bars plus the exact tempo-derived musical duration.
- The flow passes in desktop Chromium and the Pixel 7 profile with 44-pixel semantic controls.

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
- High-detail compositor render-target allocation and disposal across repeated High/Balanced switching
- Desktop High frame time with the deep-space shader, bloom, eight planets, rings, and active pulses

Stress scenario:

- 8 planets
- 3 moons on several planets
- Rings on eligible planets
- Asteroid belt
- Active visual effects
- Inspector interaction during playback

High-detail visual acceptance:

- Auto resolves to High at a wide desktop viewport, including device-pixel ratio 2, while the 390-by-844 phone viewport resolves to Low.
- High shows sparse distant stars, multi-scale nebula filaments with dust breaks, at least one readable compact galaxy profile, restrained stellar bloom, and star-colored light on planet terrain.
- The active star retains visible surface texture rather than clipping to a featureless white disc, and bloom does not obscure orbit gates, planets, selection outlines, or status text.
- The resting Void star remains dark but visibly distinct from deep space, including with reduced effects, and profile switching cannot leave the system origin without its star body and outline.
- Low and Balanced allocate no full-screen compositor and use the inexpensive broad-wisp/sparse-star shader rather than the detailed FBM, filament, dust-knot, and galaxy shader; the mobile scene remains attractive and readable.
- WebGL shader compilation, profile switching, resize, and context restoration produce no console errors.

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
- Reduced motion and touch alternatives, including camera rotation and tilt buttons, work.
- The demo can be completed reliably without developer tools.
