# Rendering and Mobile Performance

## Rendering objective

Create a visually memorable, touch-friendly 3D solar system without making WebGPU, desktop-class GPUs, or expensive physical simulation prerequisites.

The scene should remain legible as an instrument first and spectacular second.

## Baseline renderer

Use Three.js `WebGLRenderer`.

Do not require WebGPU.

Recommended renderer configuration:

- Transparent or controlled dark background
- `powerPreference: "high-performance"` where appropriate
- Antialiasing conditional by quality profile
- Capped device pixel ratio
- Color management configured explicitly
- Shadows disabled by default on low and balanced profiles

## Camera

Use a constrained perspective or orthographic-like perspective camera.

Default:

- Angled top-down view
- Star centered
- Orbits readable as ellipses
- Limited zoom range
- Limited rotation
- Smooth focus transitions

Do not use a free-fly camera.

## Scene hierarchy

```text
Scene
  Background star field
  System root
    Star
    Orbit visual group
    Planet group
      Planet
      Pattern nodes
      Moon group
      Ring group
    Asteroid belt
  Event effects
  Selection and accessibility highlights
```

## Visual-to-audio mapping

- Planet angular position comes from transport phase.
- Pattern nodes flash at scheduled event times.
- Orbit pulses reflect current track activity.
- Muted objects visibly dim.
- Solo state reduces unrelated visual prominence.
- Locked objects show a small clear icon or ring mark.
- Selection uses outline, halo, or orbit emphasis rather than color alone.

## Picking and touch

Use raycasting with dedicated invisible hit meshes.

Minimum hit behavior:

- Planet hit area larger than visible mesh
- Moon hit area substantially larger than visible mesh
- Orbit shell hit area wide enough for touch
- Pattern nodes enlarged in Focus View
- Object selection resolvable even when visuals overlap

When multiple objects are under a tap:

1. Prefer currently selected object's children.
2. Prefer the closest screen-space target.
3. Allow repeated tap cycling only as a fallback.
4. Offer object-list selection through HTML.

## Direct manipulation

### Radial planet drag

Map pointer movement to the system plane.

- Determine candidate orbit radius.
- Snap to supported shells.
- Show preview label such as “1 bar.”
- Commit one undoable action on release.

### Tangential drag

- Convert angular delta to normalized phase.
- Snap according to current grid resolution.
- Provide visible and optional haptic snap feedback.
- Commit one history entry on release.

### Camera conflict prevention

- One-finger drag on a selected object edits it.
- One-finger drag on empty space may pan only if intentionally supported.
- Two-finger gesture controls zoom or limited camera rotation.
- Provide buttons for users who cannot use multi-touch.

## Geometry strategy

### Planets

- Low to moderate polygon count
- Shared base geometries where possible
- Material parameters and procedural texture variation
- Avoid high-resolution texture dependence
- Use simple atmosphere shells sparingly

### Rings

Use instanced meshes for fragments.

- Shared geometry and material
- Per-instance transform
- Optional per-instance emissive or color attribute
- Active state reflected visually
- Avoid one draw call per fragment

### Asteroids

Use instanced meshes.

- Small library of low-poly shapes
- Per-instance scale and rotation
- Seeded distribution matching musical events
- Lower counts on mobile quality profiles

### Pattern nodes and particles

Use sprites, points, or instancing.

Avoid creating and destroying objects every beat. Reuse pools.

## Post-processing

### Low

- No bloom
- No shadows
- Minimal particles
- Simple additive pulses

### Balanced

- Lightweight selective bloom or glow alternative
- Limited particles
- No dynamic shadows or one very cheap shadow source

### High

- Selective bloom
- Higher particle counts
- Additional atmospheric effects
- Optional soft shadows

The application must remain attractive without post-processing.

## Adaptive quality

Profiles:

- Low
- Balanced
- High
- Auto

Auto mode may consider:

- Device pixel ratio
- Screen size
- Renderer information
- Recent average frame time
- WebGL context capabilities

Adapt gradually and avoid oscillating between profiles.

Possible reductions:

1. Cap pixel ratio
2. Reduce star-field count
3. Reduce particles
4. Disable post-processing
5. Reduce asteroid count
6. Reduce atmosphere segments
7. Reduce update frequency for distant decorative elements

Never reduce audio scheduling quality.

## Performance budgets

Target rather than guarantee:

### Mid-tier mobile

- 30 FPS minimum during normal editing
- 45–60 FPS preferred
- Touch response visually acknowledged within 100 ms
- Draw calls kept well below a few hundred
- No unbounded geometry or particle growth
- Scene memory stable after repeated create-delete cycles

### Desktop

- 60 FPS under normal system complexity
- High profile remains optional

## System limits

Initial safe limits:

- 1 star
- 8 primary planets
- 3 moons per planet
- 1 ring per planet
- 1 asteroid belt
- 32 visible pattern nodes per planet maximum
- Pooled transient effects

The default generated system should use fewer than the maximum.

## Lifecycle

- Suspend or throttle visual rendering when the document is hidden.
- Preserve audio policy intentionally; pausing on hidden should be a product decision.
- Dispose geometries, materials, render targets, and textures.
- Handle resize with debouncing where appropriate.
- Respond to orientation changes.
- Attempt WebGL context restoration.
- Do not recreate the entire scene on each React render.

## Scene integration with React

React owns:

- Canvas mount
- Accessible UI
- High-level selection state
- Lifecycle boundaries

A `SceneController` owns:

- Renderer
- Scene
- Camera
- Three.js object registry
- Render loop
- Picking
- Object reconciliation

React passes state changes through a narrow adapter rather than representing every Three.js object as React components.

## Mobile testing checks

Test at minimum:

- Portrait phone
- Landscape phone
- Tablet portrait
- Tablet landscape
- Desktop narrow viewport
- Desktop wide viewport
- Reduced motion
- Browser zoom above 100%
- Touch emulation and at least one physical touch device

## Visual definition of done

- The current playhead and sounding object are obvious.
- Orbits remain readable at phone size.
- Selection works reliably without pixel-perfect taps.
- Quality reduction does not break the musical metaphor.
- Scene object counts remain stable after repeated edits.
- Audio continues correctly through visual frame drops.
