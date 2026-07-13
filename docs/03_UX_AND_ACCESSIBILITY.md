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

The next hint demonstrates orbit shells:

> Drag it inward for a shorter, faster loop.

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
- Floating action:
  - Add celestial object
- Bottom sheet:
  - Selection summary
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
- Drag selected planet tangentially: change phase
- Drag selected planet radially: change quantized orbit shell
- Pinch: zoom
- Two-finger drag or rotate: limited camera adjustment
- Tap empty space: deselect
- Long press: optional context menu, never required

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
- Tempo
- Energy
- Density
- Groove
- Space
- Complexity
- Add object
- Surprise Me
- Undo and redo

### Level 2: Shape

Visible after selecting an object:

- Role and sound
- Mute and solo
- Pattern preset
- Orbit length
- Regenerate
- Duplicate
- Delete
- Lock

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

## Focus View

Selecting “Edit pattern” opens a large circular sequencer.

Requirements:

- Large enough for phone editing
- Active events clearly distinguished by shape and brightness
- Drag event around orbit to change timing
- Tap empty subdivision to add an event
- Tap active event to select or remove
- Optional linear grid accessibility alternative
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
