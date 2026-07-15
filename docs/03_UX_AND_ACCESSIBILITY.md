# UX and Accessibility

## Experience model

The app uses one 3D scene with a responsive HTML interface layered around it.

The scene provides delight and direct manipulation. The HTML interface provides precision, accessibility, discoverability, and mobile reliability.

The canvas must never be the only route to an essential action.

## First-run flow

### Screen 1: Enter the cosmos

Primary action:

> Start creating

This user gesture unlocks audio and enters the app.

Secondary actions:

- Surprise Me, which unlocks audio and builds a complete safe system
- Explore a demo
- Load a shared system
- Open a saved system

### Screen 2: Choose a mood

Show five large visual cards:

- Radiant
- Warm
- Delicate
- Pulsing
- Void

Each card maps to a star preset, harmony tendency, instrument palette, effect profile, and visual identity.

Do not begin with root notes, scales, or synthesis terminology.

### Screen 3: Guided first edit

The starter system already contains:

- One beat planet
- One harmonic planet
- Optional ring pulse

The tutorial asks the user to perform one action:

> Add a bass planet

The new part should immediately complement the existing system.

The next hint demonstrates orbit rate:

> Choose a shorter rate for a faster visible orbit and musical pattern.

After this, onboarding ends and the app remains fully usable.

## Main screen layout

### Portrait phone

- Top bar:
  - Project name
  - Play or pause
  - Undo
  - Main menu
- Main canvas:
  - Fixed angled top-down solar system
- Floating actions:
  - Surprise Me for the whole system
  - Add celestial object
- Bottom sheet:
  - Selection summary
  - Surprise for the selected planet
  - Main creative controls
  - Expand for Orbit Lab
- Persistent master volume and stop inside the main menu or top-level transport

### Desktop

- Top transport bar
- Central scene
- Left object list or system navigator
- Right selection inspector
- Bottom macro controls or compact performance bar

### Tablet

Use desktop-like side panels in landscape and the portrait bottom-sheet model in portrait.

## Camera and gestures

The editing model should feel almost 2D even though the scene is 3D.

### Allowed gestures

- Tap: select
- Choose Gate edit, then tap an empty or active gate: enable or disable that step
- While Gate edit is on, drag the selected orbit arc tangentially: rotate every gate together
- Drag an active melody gate radially: move its note through the safe scale
- Drag selected planet tangentially: change phase
- Drag selected planet radially: change quantized orbit rate; the renderer derives a unique spatial lane separately
- Pinch: zoom
- Two-finger drag or rotate: limited horizontal rotation and vertical tilt
- Tap empty space: deselect
- Long press: optional context menu, never required

Gate edit is an explicit temporary mode. Outside that mode, active gates remain
visible as musical causes, inactive slots are visually suppressed, and neither
gate taps nor orbit-arc rotation can change the pattern. The inspector and Orbit
Lab provide labelled Earlier, Later, and Reset controls that move the complete
pattern by exactly one gate slot and are the preferred precision path.

### Avoid

- Free-fly camera
- Single-finger camera orbit while objects are editable
- Small draggable points without enlarged hit regions
- Essential double-tap gestures
- Gesture-only deletion
- Unbounded zoom

## Progressive disclosure

### Level 1: Play

Always visible:

- Play or pause
- Energy
- Activity
- Space
- Add object
- Surprise Me for the whole unlocked system
- Undo, with additional transport controls where viewport space allows

The phone and beginner layouts use these three circular macro controls. An explicit Advanced toggle expands the macro surface to Energy, Density, Groove, Space, Complexity, and master Volume. Every knob remains a semantic range input with keyboard and screen-reader behavior.

### Level 2: Shape

Visible after selecting an object:

- Role and sound
- Mute and solo
- Surprise for this planet
- Pattern preset
- Orbit rate, with familiar choices first and deeper polymetric choices progressively disclosed
- Lock
- Orbit-appropriate gate counts: 4/8 for a half-bar orbit, 8/16 for one or two bars, and 8/16/32 for four bars
- Ring density when the selected planet has a ring

The default inspector uses plain labels such as Loop speed and keeps the role-compatible sound chooser available without theory controls. Advanced planet controls reveal local sample import depth, detailed orbit rates and system sync, orbit-appropriate 6-, 12-, and 24-step polyrhythms, Chord and Melody Shape controls, surface detail, duplicate, and delete. The UI never presents a step count that creates an unnecessarily awkward density for the selected orbit.

Sound and visual surface labels must remain distinct. Material names such as “Harmonic strata” describe appearance only and must not be presented as, or confused with, the selected sound preset.

### Level 3: Orbit Lab

Expanded detailed editor:

- Circular step or event pattern
- Pitch choices
- Probability
- Velocity
- Note length
- Filter
- Reverb send
- Delay send
- Pattern rotation
- Per-track swing or humanization

### Level 4: Harmony Lab

Advanced system panel:

- Root
- Scale
- Progression
- Voicing
- Octave range
- Safe Harmony toggle

## Plain-language macro behavior

Macros must produce predictable musical results.

### Energy

Raises rhythmic activity, velocity, brightness, and visual response while respecting mix limits.

### Density

Adds or removes events using role-aware pattern mutation. It should not simply randomize every step.

### Groove

Moves between straight and syncopated rhythm tendencies. The end of the range may introduce shuffle or stronger swing.

### Space

Controls note duration, reverb, delay, and arrangement openness.

### Complexity

Introduces variation, moon activity, probabilistic events, additional chord tones, and pattern length diversity.

## Object creation flow

The first choice is the musical role:

- Beat
- Bass
- Chords
- Melody
- Texture

After role selection, present three recommended sound cards. Include a small “More sounds” action.

The celestial appearance can be generated from the role and sound preset. Users should not need to select planet geology before understanding the musical consequence.

When a selected planet has a ring, the inspector exposes one plain-language Density control. Its active-segment count and role-specific musical result are described in text, and the visible fragments update with the control.

## Sound library and local samples

The selected planet always names its current sound and exposes one semantic sound select that groups the active star's recommended sounds first, then the remaining built-in role-compatible sounds, then any sounds imported on this device. Changing the sound does not rewrite the planet's notes, rhythm, orbit, or visible identity.

The local import control uses progressive disclosure:

- Beat planets can build a partial kit through individually labelled kick, snare, clap, closed-hat, open-hat, rim, and percussion file inputs. Empty slots retain the safe synthesized voice.
- Bass, chord, melody, and texture planets can import one tonal sample. The app analyses its likely source note, presents that note in an editable labelled select, and transposes from the confirmed root into the existing Safe Harmony note map.
- Import status and analysis results use a polite live region. File inputs, root correction, submission, and the resulting sound select remain keyboard accessible.
- Copy explains that custom live audio remains on the current device. Share recipients and offline WAV use safe synthesized fallbacks, while MIDI remains sample-independent.

Surprise remains a separate explicit action. The planet action changes one unlocked planet's sound, orbit, and pattern; the whole-system action changes all unlocked musical layers. Both are undoable and respect visible locks.

## Focus View

Selecting “Edit pattern” opens a large circular sequencer.

Requirements:

- Large enough for phone editing
- Active events clearly distinguished by shape and brightness
- Inactive subdivisions stay very quiet; strong beat landmarks remain readable without making every empty slot compete with active events
- Main beat gates use the strongest landmark treatment; offbeat eighths use a clear secondary treatment; fine subdivisions remain quieter
- The natural subset of 4/8/16/32 remains visible for the current ordinary orbit, with 6/12 on 1½ bars and 12/24 on 3 bars available when Advanced is active
- Resizing remaps the existing pattern around the orbit and resolves collapsed events deterministically instead of randomizing it
- Tap empty subdivision to add an event
- Tap active event to select or remove
- After a gate edit, show a short non-modal timing readout such as “Bar 1 · Beat 2 + ½” and explain whether it is on the beat, halfway between beats, or a fine subdivision
- Show an overall beat-alignment summary so a user targeting every beat can find one accidental between-beat placement without describing syncopation as inherently wrong
- Provide labelled Earlier, Later, and Reset gate-offset buttons that move the complete pattern by one slot
- A linear semantic grid is always available as the keyboard and screen-reader alternative
- Active melody gates have labelled Lower and Raise controls for the safe scale
- Playback head and current event clearly indicated
- Haptic feedback when snapping, when available

## Empty, loading, and error states

- Audio loading should show named stages rather than an indefinite spinner.
- Failed audio assets should fall back to a basic synthesized voice.
- A failed share code should offer a safe starter system.
- Export should show progress and remain cancellable.
- Local-save failures should provide a downloadable JSON fallback.

## Accessibility

### Visual

- Minimum contrast appropriate to the selected theme
- Shape and motion in addition to color
- Reduced-motion mode
- Reduced-flash mode
- Reduced-particle mode
- Adjustable visual intensity
- Text size that respects browser scaling
- No tiny permanent labels inside the canvas

### Motor and RSI considerations

- Large targets
- Minimal repeated dragging
- Tap alternatives for radial drag actions
- Stepper buttons for precise orbit changes
- Buttons for bounded horizontal camera rotation and vertical tilt
- Hold-to-repeat only as an optional accelerator
- Undo instead of confirmation dialogs for reversible actions
- Avoid requiring chords or multi-finger gestures for core creation

### Screen readers and keyboard

- Maintain an HTML object list mirroring the current system.
- Each object entry announces role, sound, loop length, mute state, and lock state.
- Provide keyboard actions for select, add, delete, nudge phase, change loop length, mute, solo, and open inspector.
- Use live regions sparingly for major changes such as “Bass planet added” or “System regenerated.”
- Do not announce every musical event.

## Beginner language

Prefer:

- Mood
- Faster loop
- Slower loop
- More notes
- Less busy
- Brighter
- More spacious
- Stable
- Adventurous

Reveal theory labels in supporting text:

> Floating  
> D major pentatonic · I–V–vi–IV

## Usability stop conditions

The UX is not ready if:

- A new user starts with an empty silent scene.
- A user must understand scales before adding a melody.
- Camera movement frequently steals object drags.
- A phone user cannot comfortably select a moon or ring.
- A generated change cannot be undone.
- The current sounding object is unclear.
- Advanced controls dominate the initial screen.
