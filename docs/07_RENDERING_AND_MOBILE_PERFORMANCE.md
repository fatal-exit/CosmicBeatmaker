# Rendering and Mobile Performance

## Rendering objective

Create a visually memorable, touch-friendly 3D solar system without making WebGPU, desktop-class GPUs, or expensive physical simulation prerequisites.

The scene should remain legible as an instrument first and spectacular second.

## Baseline renderer

Use Three.js `WebGLRenderer`.

Do not require WebGPU.

Recommended renderer configuration:

- Controlled, preset-coordinated colored atmosphere with dark silhouette pockets
- `powerPreference: "high-performance"` where appropriate
- Antialiasing conditional by quality profile
- Capped device pixel ratio
- Color management configured explicitly
- Shadows disabled by default on low and balanced profiles

## Visual art direction

- Treat the scene as a vivid low-poly space tableau, not an empty black void or
  a wireframe HUD.
- Coordinate one limited palette across atmosphere, stars, planets, orbit
  accents, and surrounding DOM chrome for each stellar preset. Derive the
  foreground bodies from a complementary family instead of reusing the
  backdrop colors, and preserve role separation through bounded hue, value,
  terrain, and silhouette changes.
- Keep the unlit sky chromatic rather than black. Distribute fine star and dust
  texture across the field, then place narrow nebula lanes, compact galaxies,
  and small irregular satellite clouds as recognizable local structures. Do
  not cover the viewport with undifferentiated FBM, fluid-noise webs, or large
  empty dark blobs.
- Run decorative sky drift, glints, and asteroid motion from a renderer-only
  visual clock so the space remains alive while transport is stopped. The
  audio clock remains authoritative for musical positions and events, and
  reduced-motion mode freezes decorative motion.
- Keep planet bodies filled and readable before outlines, bloom, or tiny surface
  detail. Selection and event feedback remain separate value/shape cues.
- Give each musical role deterministic terrain identity: cratered beat worlds,
  banded bass giants, stepped chord strata, crystalline melody planes, and
  eroded texture worlds.
- Retain the palette and principal silhouettes on Low and Balanced quality;
  remove frequency, particles, and post-processing before removing identity.
- Keep all atmospheric, terrain, palette, and typography choices outside the
  authoritative audio clock and serializable composition model.

## Camera

Use a constrained perspective or orthographic-like perspective camera.

Default:

- Angled top-down view
- Star centered
- Orbits readable as ellipses
- Limited zoom range
- Limited horizontal rotation and vertical tilt
- Smooth focus transitions
- Automatic framing that can fit one unique orbit lane per planet

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
- Essential star and planet silhouette outlines remain visible when expanded lane counts require zooming out; optional additive glow is a separate quality effect.

## Picking and touch

Use raycasting with dedicated invisible hit meshes.

Minimum hit behavior:

- Planet hit area larger than visible mesh
- Moon hit area substantially larger than visible mesh
- Selected orbit path and radial rate-control hit area wide enough for touch
- Pattern nodes enlarged in Focus View
- Object selection resolvable even when visuals overlap
- Inactive gate hit meshes excluded from picking until the user explicitly enables Gate edit mode

When multiple objects are under a tap:

1. Prefer currently selected object's children.
2. Prefer the closest screen-space target.
3. Allow repeated tap cycling only as a fallback.
4. Offer object-list selection through HTML.

## Direct manipulation

### Radial planet drag

Map pointer movement to the system plane.

- Determine candidate orbit radius.
- Map the gesture to the ordered supported rate catalog.
- Show preview label such as “1 bar.”
- Commit one undoable action on release.

After the rate change, derive a unique lane for every planet by rate order and stable composition order or ID. Accumulate lane radii from each planet's real visual envelope so larger bodies, rings, gates, and moon systems receive more clearance. Duplicate-rate planets use adjacent distinct lanes. Lane radius is not musical duration, and changing rate must not mutate camera zoom or rotation.

### Tangential drag

- Available only while Gate edit mode is explicitly enabled
- Convert angular delta to normalized phase.
- Snap according to current grid resolution.
- Provide visible and optional haptic snap feedback.
- Commit one history entry on release.
- Provide one-slot Earlier/Later and Reset HTML controls as the precise alternative.

### Camera conflict prevention

- One-finger drag on a selected object edits it.
- Gate taps and tangential phase rotation do nothing while Gate edit mode is off; active gates may still select their parent without changing it.
- One-finger drag on empty space may pan only if intentionally supported.
- Two-finger gesture controls zoom or limited camera rotation and tilt.
- Provide buttons for users who cannot use multi-touch.

## Geometry strategy

### Planets

- Low to moderate polygon count
- Shared base geometries where possible
- Material parameters and procedural texture variation
- Role-derived physical classes with clearly separated radius bands: bass gas giants are largest, chord super-Earths are medium-large, melody ice worlds and beat rocky worlds are smaller, and texture dwarf worlds are smallest
- Class-specific silhouettes, including an oblate gas-giant profile, remain deterministic scene projections of existing role and appearance data rather than new composition state
- Avoid high-resolution texture dependence
- Use simple atmosphere shells sparingly
- High may use denser shared geometry plus fragment-space procedural surface normals for terrain relief; this is visual shading, not a physics or terrain-simulation system

### Rings

Use instanced meshes for fragments.

- Shared geometry and material
- Per-instance transform, with orbit radius, fragment dimensions, and tilt scaled from the parent planet's physical class and rendered body size
- Optional per-instance emissive or color attribute
- Active state reflected visually
- Avoid one draw call per fragment

### Asteroids

Use instanced meshes.

- Small library of low-poly shapes
- Per-instance scale and rotation
- Seeded distribution matching musical events
- Deterministic renderer-only orbital drift and low-poly spin, with stable
  instance parameters and no per-frame allocation
- Freeze decorative drift under reduced motion while preserving event-caused
  flashes and the authored belt silhouette
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
- One lightweight seeded sky shader with a chromatic base, distributed near/far
  stars, narrow directional dust bands, and inexpensive continuous drift. Its
  structured field is bounded to two value-noise samples per fragment, with no
  FBM, analytic galaxies, dust knots, or post-processing targets
- The central star retains its surface, silhouette, and an attenuated compact corona; quality reduction must never remove the model itself

### Balanced

- Lightweight selective bloom or glow alternative
- Limited particles
- No dynamic shadows or one very cheap shadow source
- The same lightweight structured backdrop with denser star strata and a
  slightly stronger presentation level

### High

- A restrained HDR bloom compositor using the existing Three.js post-processing modules
- Higher particle counts
- A seeded procedural deep-space shader with distributed star layers and
  glints, localized warped nebula filaments, dust lanes, compact galaxy
  profiles, and small irregular Magellanic-cloud cues
- Slow whole-field warp and parallax use the renderer-only visual clock rather
  than musical transport; reduced motion pins that clock
- Star-preset-colored incident light on planet surfaces
- Higher celestial geometry and procedural normal detail
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

The current automatic policy uses the browser viewport rather than the narrower
center-canvas width. Phone widths resolve to Low, viewports below 1440 CSS pixels
resolve to Balanced, and viewports at 1440 CSS pixels or wider resolve to High.
This preserves audio and interaction headroom on common 1280/1366-class laptop
windows while retaining the complete High presentation on wide desktops.
Explicit user selection still wins at every width.

Adapt gradually and avoid oscillating between profiles.

Possible reductions:

1. Cap pixel ratio
2. Reduce star-field count
3. Reduce particles
4. Disable post-processing
5. Replace the detailed deep-space shader with the simple mobile shader
6. Disable the procedural deep-space backdrop
7. Reduce asteroid count
8. Reduce atmosphere segments
9. Reduce update frequency for distant decorative elements

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

- 1 authoritative star aggregate, with at most 2 rendered stellar bodies when a
  binary companion is present
- 8 primary planets
- 8 unique derived planet lanes
- 24 bars maximum supported active super-loop
- 3 moons per planet
- 1 ring per planet
- 1 asteroid belt
- 32 visible pattern nodes per planet maximum
- Pooled transient effects

The Black Hole uses a bounded procedural event horizon, photon ring, and
accretion-disk assembly. The binary companion reuses the existing stellar
geometry/material system. When a companion is present, both stellar bodies are
scaled down as one central aggregate and their barycentric centers retain a
surface-to-surface gap; the single-star silhouette remains larger. Low quality
reduces disk detail and optional glow; neither feature adds a full-screen
gravitational-lensing pass or changes audio scheduling quality.

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
