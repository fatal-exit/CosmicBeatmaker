# Decisions and Open Questions

This is a living log. Durable changes should be recorded here and reflected in the relevant source document.

## Accepted product decisions

### D-001 — Product focus

**Decision:** Cosmic Beatmaker is a mobile-first four-bar-phrase cosmic groovebox with polymetric orbits, not a full DAW.

**Reason:** A focused loop instrument can be polished within Build Week and is easier for non-musicians to understand.

### D-002 — No runtime AI requirement

**Decision:** The product will not require an OpenAI API or a live AI feature.

**Reason:** The creative system is already distinctive, and Codex is the development tool rather than a product dependency.

### D-003 — Beginner-safe defaults

**Decision:** Safe Harmony, pentatonic melody defaults, curated progressions, rhythm templates, and automatic mix limits are enabled by default.

**Reason:** The first-session promise depends on users being able to experiment without frequently producing unpleasant results.

### D-004 — Progressive disclosure

**Decision:** Plain-language macro controls appear first; pattern, harmony, and effects details live in expandable deeper views.

**Reason:** Beginner accessibility and musician depth can coexist without duplicating the whole interface.

### D-005 — One authoritative composition model

**Decision:** Live playback, rendering, save, share, WAV, and MIDI all derive from the same versioned serializable state.

**Reason:** This protects determinism and avoids drift between features.

## Accepted technical decisions

### D-006 — Three.js WebGL baseline

**Decision:** Use direct Three.js with `WebGLRenderer`. Do not require WebGPU.

**Reason:** Mobile compatibility and predictable browser coverage are core requirements.

### D-007 — React for UI, direct Three.js for scene

**Decision:** Use React for accessible HTML UI and a separate imperative Three.js scene controller.

**Reason:** This keeps accessibility strong without representing every scene object through React.

### D-008 — Tone.js for audio

**Decision:** Use Tone.js for transport, scheduling, voices, effects, and offline rendering.

**Reason:** It reduces build-week risk while preserving an architecture that keeps canonical state library-independent.

### D-009 — Static application

**Decision:** Use local persistence and shareable encoded state without a required backend.

**Reason:** Accounts and server infrastructure do not strengthen the core experience enough for the initial build.

### D-010 — Four-bar default (rate catalog superseded by D-020)

**Decision:** New systems retain a four-bar canonical harmony phrase. Individual planet orbit periods are governed by D-020.

**Reason:** Four bars are enough for musical identity while remaining visually and technically manageable.

### D-011 — Zustand command store and bounded snapshots

**Decision:** Use Zustand for the application store, with composition and ephemeral UI state held separately. All meaningful composition edits pass through pure typed commands and a bounded snapshot history of at least 50 actions.

**Reason:** Zustand keeps React integration small while explicit commands preserve validation, deterministic undo/redo, and library-independent domain state.

### D-012 — Styling and product palette (palette superseded by D-028)

**Decision:** Use one responsive semantic DOM tree with vanilla CSS custom properties. The restrained dark product palette uses OKLCH tokens anchored by warm coral and a cyan state accent; it avoids the expected purple sci-fi dashboard treatment.

**Reason:** Plain CSS keeps the mobile shell small and accessible, while a restrained product vocabulary leaves the musical scene as the focus.

### D-013 — Focused runtime dependencies

**Decision:** Use `three` for the WebGL scene, `tone` for transport and synthesis, `@tonejs/midi` for Standard MIDI File generation, `fflate` for compact share-state compression, `zod` for runtime schema validation, and `zustand` for state.

**Reason:** Each package removes a major Build Week risk behind an adapter and none owns canonical composition state.

### D-014 — Deterministic probability and structural quantization

**Decision:** Probabilistic events evolve deterministically from composition seed, event ID, and loop index. Stop resets the loop index; pause and resume preserve it; exports begin at loop zero. Loop-length, harmony, voice, and regeneration changes apply at the next bar boundary.

**Reason:** Live playback, visual pulses, and exports must make the same decisions while avoiding abrupt structural changes mid-phrase.

### D-015 — MVP schema restrictions (superseded by D-020)

**Decision:** The initial schema-version-1 restriction allowed four-bar compositions, forward orbits, and track loop lengths of half, one, two, or four bars. D-020 supersedes the rate and saved-shell restrictions before a stable save-compatibility promise.

**Reason:** This aligns the canonical contract with the explicit MVP cuts before parallel work depends on it.

### D-016 — Static GitHub Pages deployment

**Decision:** Build the Vite application with the repository base path and deploy `dist` from `main` through the official GitHub Pages Actions workflow.

**Reason:** The application is intentionally backend-free, and an automated public deployment provides a repeatable Build Week demo without adding runtime infrastructure.

### D-017 — Procedural materials without full-screen bloom (superseded for High by D-027)

**Decision:** Use small custom Three.js `ShaderMaterial` surfaces for planets and stars. Planet uniforms derive from musical role and stable seed namespaces; star uniforms derive from the authored mood preset. Create glow only on selected scene elements with lightweight transparent additive shell meshes. Do not add an `EffectComposer` or full-screen bloom pass for this milestone.

**Reason:** Role- and preset-specific shader parameters create a recognizable visual system without high-resolution texture assets or a terrain simulator. Seed-derived static parameters keep save, share, reload, and regeneration visually deterministic, while time remains an ephemeral render input. Additive shells avoid the extra render targets, full-scene passes, memory pressure, and fill-rate cost of post-processing bloom on mobile. Quality profiles can omit decorative shells and expensive shader motion, but the central star retains a readable surface floor, silhouette, and attenuated compact corona so reduced effects never erase the system's visual anchor. Reduced-motion or reduced-flash preferences can attenuate animation and pulses without removing selection, transport, or audible-event cues. This approach adds no runtime dependency and keeps the scene attractive when optional effects are disabled.

### D-018 — Canonical orbit gates and audio-clock spawn alignment

**Decision:** Render planet and moon orbit gates as runtime projections of their existing `PatternState.events`. Common rhythm preset choices replace planet events through the normal command path, while step-level Focus View edits operate on the same data; there is no separate gate sequence. Resting gate angles are a deterministic nominal preview derived from pattern step, loop, and phase. The scheduler's visual event message identifies the exact event and its swing- and humanize-adjusted transport tick; when that occurrence is admitted, the renderer corrects and pulses the matching gate at the audio-clock-derived phase. A gate trigger is therefore a semantic audio-clock event rather than a mesh intersection detected by a render frame. When a planet is added during playback, sample the authoritative transport tick, normalize it within the composition's active super-loop, and derive the planet's current orbit position from that tick, its loop length, and its stored phase. Show a short-lived highlighted marker at the computed spawn position.

Do not serialize gate runtime state, spawn markers, creation wall-clock time, sampled transport ticks, or effect expiry. Existing pattern events, orbit data, the canonical four-bar harmony phrase, and seeds are sufficient to derive the active super-loop; this milestone adds no spawn field. Any future need for persisted spawn semantics requires a separate recorded decision and schema migration.

**Reason:** One canonical event collection keeps preset selection, Focus View editing, macro projection, undo, playback, export, and visible gates synchronized. A nominal preview keeps gates stable before playback, while keying the occurrence-time correction and pulse to the scheduled event preserves audio-visual causality through swing, humanize, probability, and frame drops. Deriving a newly reconciled planet's position from the same audio clock as every existing orbit prevents a mid-playback object from appearing to start its own local timeline. Keeping the marker and sampled timing ephemeral preserves deterministic save and share behavior, avoids meaningless wall-clock data, and lets quality and reduced-effect preferences simplify the transient without hiding where the object entered.

### D-019 — Manifest-driven Ogg sample pilot with synth safety

**Decision:** Publish the first-party web sample pilot as manifest-driven Ogg Vorbis assets encoded at quality 5 and 48 kHz with Xiph `oggenc`. The 20 user-authored sources and their processed outputs are stereo; the authored processor preserves channel layout, applies no gain or normalization, and trims only terminal silence lasting at least 120 ms below -60 dBFS while retaining 30 ms after the audible tail. Raw WAV inputs remain untouched, ignored, and uncommitted. Generated Ogg assets and their manifest are committed outputs.

Use `scripts/process-samples.mjs` as the repeatable processor. It requires `ffmpeg`, `ffprobe`, and Xiph `oggenc` on `PATH`, recursively discovers WAV inputs, assigns stable collision-checked IDs, removes stale outputs, and records source, output, processing, level, license, authorship, and playback-envelope metadata. Per-sample attack and release metadata shapes playback without rewriting the source: punchy transients retain near-immediate attack, softer or style-dependent samples may use a subtle fade-in, and long 2.182-second samples release before the file boundary.

Live Tone sample voices load lazily for active presets after audio unlock. Synthesis plays the same scheduled event while a sample is loading and after any fetch, decode, or trigger failure. Offline WAV rendering remains synth-only for this pilot, and MIDI stays on the existing canonical note-event export path.

**Reason:** Ogg Vorbis quality 5 materially reduces mobile delivery size while keeping the first-party source character, stereo image, and tails. A manifest and deterministic processor make the current pack reviewable and future arrivals repeatable without committing large raw masters. Avoiding normalization preserves authored gain relationships, while envelope metadata provides restrained stylistic shaping without destructively editing sources. Lazy loading limits startup work, synthesis prevents missing samples from creating silence, base-aware URLs remain compatible with GitHub Pages, and retaining the established synth-based export paths avoids expanding offline-rendering risk during the pilot.

### D-020 — Exact polymetric rates, unique visual lanes, and super-loop export

**Decision:** Support planet orbit periods of exactly 0.25, 0.5, 1, 1.5, 2, 3, 4, 6, and 8 bars. Represent those periods as 1, 2, 4, 6, 8, 12, 16, 24, and 32 quarter-bar units and compute synchronization with integer greatest-common-divisor/least-common-multiple math. The canonical four-bar harmony phrase remains part of the timing period, so the active audible sources and harmony resynchronize on a derived super-loop; 3- and 4-bar orbits meet after 12 bars, 6- and 8-bar orbits meet after 24, and the supported catalog is bounded at 24 bars.

One stored `loopBars` value drives both the planet's visible angular period and its musical pattern period. Live scheduling, visible event causality, offline WAV, and MIDI compile from that same period and super-loop. Export defaults to one complete super-loop and offers 1×, 2×, or 4× repetitions of the whole boundary, with exact bar and musical-duration copy.

Spatial placement is independent from musical rate. Every planet receives a unique runtime orbit lane derived by rate order and stable composition order/ID; planets at the same rate receive neighboring distinct lanes and never share a path through one another. The lane is a rendering projection rather than audible or serialized composition intent. Camera scale and user zoom remain independent from rate and fit the expanded lane set; essential planet/star silhouette outlines remain available when zoomed out, while broad bloom and decorative additive effects remain separate from the star's compact identification corona.

The early test build updates schema-version-1 validation in place: `loopBars` accepts the exact catalog, the old rate-to-shell interpretation is removed, and serialized `shellIndex` is deprecated/relaxed rather than treated as authoritative placement. Pre-milestone local saves and share links are intentionally not guaranteed to remain compatible; no migration layer is carried solely to preserve the rejected shared-shell model. D-020 supersedes the rate and shell restrictions in D-010 and D-015.

**Reason:** Integer quarter-bar math avoids floating-point LCM errors, and one derived super-loop keeps live playback, visual phase, probability indexing, WAV, and MIDI on the same boundary. Whole-super-loop export never cuts a long orbit before it returns to the beginning. Separating musical rate from spatial lane preserves the rate metaphor without allowing planets to overlap on a shared track, while bounded 24-bar synchronization and explicit 1×/2×/4× export choices constrain scheduler, render, and file-size cost.

### D-021 — Balanced audio runtime with bounded fail-silent health guards

**Decision:** Use Tone's balanced worker-clock context with device-class scheduling profiles: desktop uses 120 ms lookahead, 30 ms cadence, and an 80 ms lateness threshold; mobile uses 180 ms, 45 ms, and 120 ms. The scheduler admits each source-cycle occurrence once, drops stale/duplicate callbacks, bounds callback bursts and its occurrence ledger, and halts on invalid time, timeline regression, 16 consecutive late callbacks, more than 128 callbacks in 50 ms, ledger overflow at 4,096 keys, or four consecutive voice-trigger errors.

Reconcile runtime voices by stable track ID and role/preset compatibility so pattern or mix changes do not reload compatible nodes. Cap each unique drum sample at six scheduled overlapping sources and each pitched sample voice at sixteen. Apply a 0.72 master-headroom factor into a -3 dB limiter. On a health failure, clear scheduling, fade master output to zero over 15 ms, release voices, and pause transport; explicit play may attempt a clean rebuild. Bound visual callback queues independently and allow visual pulse drops without changing audio scheduling.

**Reason:** Cosmic Beatmaker is a sequenced groovebox rather than a live monitoring instrument, so modest lookahead is safer than minimum latency on mobile. Fixed callback, ledger, voice, and output bounds prevent delayed timers, duplicated callbacks, sample tails, or repeated trigger failures from escalating into an audible backlog or sustained overload. Stable-node reconciliation reduces churn and decode pressure while the audio-clock-only admission path preserves rendering independence. Physical-device interruption, route-change, thermal, and listening tests remain mandatory because browser automation cannot validate them.

### D-022 — Versioned procedural sample cache with synth fallback

**Decision:** Cache the remaining first-party procedural patch designs as 41 deterministic 48 kHz Ogg Vorbis assets: 28 mono drum transients, four mono auxiliary transients, eight stereo C4 tonal/texture assets, and one stereo C2 drone. Merge them with the 20 user-authored outputs into one 61-entry manifest while retaining their distinct provenance. Procedural asset generation does not reclassify, rewrite, or replace the authored source inputs.

Use `npm run samples:render` after the authored manifest exists; the default `npm run samples:build` path invokes a transactional orchestrator that processes imported masters and procedural renders outside `public/`, validates the complete pack, and promotes the pack plus generated runtime inventory with rollback. The authored count is discovered so future first-party WAV additions do not require an orchestration change. Definitions, stable asset/channel IDs, and synthesis version seed deterministic PCM16 offline synthesis; fixed quality-5, comment-free, serial-0 Xiph encoding makes output reproducible under the same renderer and codec toolchain. Record procedural synthesis version, channel contract, level measurements, envelope metadata, and peak policy in the manifest, and generate the TypeScript runtime inventory from the same definitions.

The rendered drum, chord, texture, ring, and asteroid active subset has explicit runtime preset mappings. Warm Pad and Dust retain the preferred imported reverb square/saw sources, leaving their two procedural candidates as inactive versioned alternatives. Imported dark-hat and crash sounds remain active in beat-kit slots, while hat, shaker, and percussion ring types route to their three dedicated procedural voices. The prior synth implementation remains the event-for-event loading and error fallback, but a sample that is ready before its first event does not construct that heavier graph. A fallback created during loading becomes idle after readiness and remains valid until normal voice disposal so lookahead-scheduled notes cannot be disconnected before their audio time. Offline WAV remains synth-rendered and MIDI remains sample-independent.

**Reason:** Pre-rendering fixed first-party patches bounds mobile CPU work and runtime voice complexity without changing musical timing or serialized composition intent. Lazy fallback construction avoids most duplicate graphs while retaining a loading-time graph protects audio already scheduled through the lookahead window. Stable definitions and versioned deterministic generation keep the cache reviewable and reproducible without maintaining additional raw masters. Separate provenance preserves the authored pack's processing contract, C-rooted tonal files retain normal runtime transposition, and the established synth path prevents a missing or undecodable cache asset from becoming silence.

### D-023 — Parent-role-aware rings with visible derived density

**Decision:** Keep the existing serialized `RingState.active` segment array as the sole ring rhythm. Ring Density deterministically changes the number and role-safe fill order of those visible active segments; no separate density field or hidden ring sequence is stored. During canonical compilation, beat and texture rings remain auxiliary percussion, melody rings derive short quiet pitch-matched ghost notes immediately before or after nearby motif events, bass rings derive syncopated octave pickups with restrained fifth variation, and chord rings replace the parent chord source with a single-note chord-tone arpeggio so sustained hits and arpeggios never stack. Tonal rings reuse the parent's pitched sound preset, while every derived event retains its ring-segment ID for live playback, WAV, MIDI, and visible fragment pulses. A live schedule rebuild also admits the unsounded remainder of the current source cycle so newly added or edited rings begin without waiting for another orbit.

**Reason:** A planetary ring should meaningfully extend the selected planet rather than sounding like the same percussion layer on every role. Deriving behavior from existing parent intent preserves Safe Harmony and keeps a beginner-facing density control predictable. Reusing the active segment array avoids another schema migration and ensures the canvas, accessible inspector, undo history, serialization, live scheduling, and exporters all describe the same audible events.

### D-024 — Whole-subdivision polymeter pattern grids

**Decision:** When a primary planet changes to a 1.5- or 3-bar orbit, replace a 16-step pattern grid with 12 steps and a 32-step grid with 24 steps. Existing 12- and 24-step detail tiers remain unchanged. The rate-change command keeps events whose step remains inside the new grid and deterministically omits overflow; if every event would be removed, it wraps the earliest event into the new grid so an active planet does not become silent. When the planet returns to an ordinary rate, restore the corresponding detail tier from 12 to 16 or from 24 to 32 while preserving surviving event IDs and step positions. The transformed pattern remains custom because it no longer exactly represents its prior named template, and omitted events are not regenerated.

**Reason:** Twelve and 24 steps divide both supported polymetric periods into a whole number of subdivisions per bar. Retaining 16 or 32 subdivisions across those periods creates awkward fractional subdivisions that sound out of rhythm even though the transport boundary itself remains exact, while leaving 12 or 24 steps behind after returning to an ordinary rate creates the inverse problem. Simplifying and restoring the detail tier preserves familiar surviving events and musical causality without generating replacement notes or expanding the MVP sequencing model.

### D-025 — Per-planet chord and melody expression

**Decision:** Schema version 2 stores role-specific expression state on every planet, and deterministic generation advances to version 2.1.0. Chord planets expose Closed, Open, and Wide voicing spread plus continuous chord complexity; the canonical compiler turns main chord-planet triggers into bounded full voicings while chord-ring events remain individual arpeggio notes. Melody planets expose pitch variety plus ascending, alternating, or descending contour; these settings deterministically project saved pitch intents at compile time without rewriting their rhythm. Version-1 saves migrate using the saved harmony voicing and macro complexity. Live playback, WAV, MIDI, save/share, and undo all consume the same expression state. The Legacy Dry `glass-chords-c4` procedural source advances independently to synthesis version 1.1.0 with restrained integer-ratio FM partials; D-029 defines its version-2 shipping replacement.

**Reason:** Per-planet controls let beginners shape harmonic width and melodic direction in plain language while preserving Safe Harmony and visible rhythmic causality. Compile-time projection keeps the serialized model compact and prevents playback/export drift. Separating the visual Surface label from Sound also prevents appearance names such as “Harmonic strata” from implying an abrasive synth preset.

### D-026 — Cancellable live-event handoff and uninterrupted groovebox editing

**Decision:** Keep one repeating Tone Transport callback per compiled source cycle, but do not hand that callback's complete future orbit directly to a Tone voice. An event exactly on the cycle boundary may trigger from the repeat callback; every later event remains an absolute-tick Tone `scheduleOnce` registration owned by the scheduler until its own callback. Pending one-shot IDs, visual timeouts, and a stable `trackId:eventId` plus monotonic source-cycle admission key are bounded, deduplicated, revision-fenced, and cleared together. When a live replacement occurs inside Tone's processed lookahead, the scheduler directly admits every still-unsounded event between the raw audio clock and the scheduling frontier at its exact audio time, including events across an orbit boundary; later events remain cancellable one-shots.

Tempo is a direct Tone Transport parameter and does not enter the structural live-schedule key. Level, pan, filter, and master level update stable runtime nodes. Every range control publishes each native input event while the pointer is held; pointer release only closes its Undo history group. Live global macro projection, chord or melody expression, pattern steps, ring segments or density, ring/source topology, preset, harmony, mute/solo, and other compiled changes replace only the unsounded remainder at the authoritative raw tick. The transport and visible playhead do not pause or rewind: newly enabled future steps trigger once when reached, removed future steps do not trigger, and edits on or behind the playhead wait for the next orbit.

Each lookahead-admitted attack owns an isolated synth or sampler handle and a cancellable overlap-budget reservation behind a stable track strip. A structural edit first revokes scheduler registrations, then disposes only handles whose start time is strictly ahead of the raw clock. A note on or behind that boundary keeps sounding through its tracked natural tail and two render quanta of disposal grace. Compatible voices, track strips, the transport epoch, and its output gate remain intact. Removed or preset-incompatible voices reject new attacks, cancel future handles, and dispose only after their already-started notes finish; replacements receive the new future pattern immediately. Resolved first-party sample URLs share one page-lifetime load/decode handle, so event isolation does not multiply fetch or decode work.

Only explicit pause, stop, disposal, or health failure may terminate sounding notes. Those paths fade master and the isolated transport-generation output to zero over 15 ms, clear registrations and pending visuals, and retire the epoch behind bounded cleanup. Pause is scheduled at Tone's lookahead frontier so it can cancel a just-queued start, then reanchors the transport to the fractional raw tick; stop rewinds to tick zero. A recovery that trips health again remains paused. Lazy `AudioEngine` creation is generation-guarded and disposal is rechecked after deferred browser audio unlock so a React Strict Mode unmount cannot install or leak an unowned graph.

**Reason:** The former source-cycle callback scheduled up to a full orbit of synth and sampler attacks ahead of the audible clock. Clearing Transport callbacks could not retract that already-admitted Tone work, so edits layered offset old and new cycles and pause or stop could leave future attacks alive. Fading a complete voice generation on every edit prevented ghosts but audibly cut notes, which is also incorrect for a groovebox. Exact-tick scheduler ownership plus per-event voice ownership closes both failure modes: stale future work is retractable, active notes are untouched, and the evolving pattern takes effect when the uninterrupted playhead reaches it. Cancellable reservations keep rapid drags bounded, raw-clock continuation avoids lookahead gaps, and decoded-buffer reuse keeps the solution practical on mobile. Offline WAV export deliberately retains bounded shared per-track synths because it has no live replacement path and schedules the complete render synchronously.

### D-027 — Quality-tiered deep space and desktop High compositor

**Decision:** Upgrade the existing renderer-only High quality profile into an optional desktop presentation tier. Auto resolves to High from a wide desktop viewport, including high-DPI desktop displays, while narrow desktop/tablet remains Balanced and phone viewports remain Low. The user can still choose any profile explicitly.

High uses denser planet and star geometry, high-frequency role-specific procedural surface normals layered over the existing seeded vertex displacement, and incident planet lighting colored from the active star preset. It adds one Three.js `EffectComposer` chain with `RenderPass`, restrained `UnrealBloomPass`, and `OutputPass`, plus a seed- and star-palette-derived inverted sky shader containing multi-scale warped nebula filaments, dark dust lanes, compact knots, sparse star layers, and two spiral-galaxy profiles.

Low and Balanced keep direct `WebGLRenderer` output and bind a separate inexpensive material to the same bounded sky sphere. That shader uses three value-noise samples for broad seeded wisps and one sparse star layer; it has no FBM loop, galaxy profile, detailed filament/dust work, or post-processing target. Switching out of High disposes the compositor targets and swaps to this simpler material. Reduced-effects mode attenuates both backdrop tiers and existing transient effects, but retains the central star model and its compact corona.

All quality-tier state is ephemeral scene state. No geometry tier, bloom state, background time, render target, normal sample, or stellar-light runtime value enters composition state, undo, save/share, audio scheduling, or export. Visual quality may reduce or fail independently without changing the authoritative audio clock. The implementation uses Three.js post-processing modules already shipped by the existing `three` dependency and adds no package.

**Reason:** The earlier D-017 additive-shell boundary protected the mobile baseline but left the explicit desktop High option materially similar to Balanced. A bounded desktop-only compositor and detailed procedural sky satisfy the presentation goal without imposing bloom targets or high-frequency fragment work on phones, while the simple material prevents mobile from falling back to an empty background. Seeded shader parameters keep static scene identity reproducible, star-colored incident light ties appearance to the authored mood, and keeping the entire feature renderer-only preserves deterministic musical behavior and serialization.

### D-028 — Magenta-violet product palette

**Decision:** Retain D-012's responsive semantic DOM tree and vanilla CSS custom properties, but replace its coral-led product palette with a restrained magenta-violet system. Plum-tinted near-black neutrals define the shell, magenta identifies primary actions and brand emphasis, violet identifies active events and playback state, and lavender provides the focus treatment. Celestial role and mood colors remain separate semantic tokens so the new brand palette does not erase musical identity or make state depend on one hue. This decision supersedes only the palette portion of D-012.

**Reason:** The product's visual direction has evolved toward a more cosmic purple and magenta identity. Keeping the saturated colors rare, contrast-checked, and tied to interaction preserves the focused instrument hierarchy and avoids the neon-purple control-panel anti-reference while removing orange from global UI emphasis.

### D-029 — Baked spatial replacements for dry procedural upper voices

**Decision:** Supersede D-022's channel inventory and dry upper-voice cache with 30 version-2 spatial replacements. Keep each selected procedural synth, keys, pad, texture, snare, clap, closed/open hat, rim, and ring hat/shaker patch as a non-shipping source labeled `Legacy Dry …`; give its shipping replacement a distinct `-space` ID. The manifest records the legacy-dry source ID/name, `legacyDryAssetPackaged: false`, spatial algorithm/profile, and synthesis version. The transactional builder requires exactly 30 such replacements and rejects a pack containing any corresponding Legacy Dry ID.

Render the replacement offline through a deterministic stereo Schroeder network with short decorrelated pre-delay, eight feedback comb filters, four serial all-pass diffusers, profile-specific damping and tail length, fixed dry/wet gain, and a fixed soft ceiling. Preserve kicks, low percussion, the procedural low drone, and the 20 imported masters without this additional pass. The six selectable melody/lead samples are imported authored masters rather than procedural dry sources, so their existing spatial content remains unchanged. Runtime presets point to the spatial assets; no reverb node, new dependency, composition field, or timing path is added at runtime.

**Reason:** The generated upper voices were perceptually too dry beside the imported material. Baking one restrained, versioned space treatment makes the palette cohesive while keeping the audio-clock and mobile CPU budgets unchanged. Distinct shipping IDs and a hard manifest exclusion make stale dry files detectable instead of leaving ambiguous alternatives in the deploy tree, while preserving low-end attacks avoids smearing kick and percussion timing.

### D-030 — Role-derived planet classes and size-aware visual lanes

**Decision:** Derive a planet's physical visual class from its existing musical role without adding composition fields: beat is a rocky world, bass is an oblate gas giant, chords is a super-Earth, melody is an ice world, and texture is a dwarf world. Each class owns a clearly separated bounded radius band, silhouette scale, ring gap, fragment scale, and ring tilt. The saved `appearance.size` still contributes deterministic within-class variation, while the procedural material and sound labels remain separate concerns.

Keep rate/ID lane ordering from D-020, but accumulate actual lane center radii from the neighboring planets' current scene envelopes. That envelope includes the scaled body, visible event gates, parent-scaled ring, and moon orbit when present. Ring and moon edits therefore recalculate visual spacing and camera fit without changing `loopBars`, phase, audio scheduling, composition history, save/share state, or exports. The camera fit and asteroid-belt projection consume the same outer envelope.

**Reason:** The former fixed lane step and nearly equal rendered radii made the five surface types read as color variants and allowed large rings or gas giants to crowd neighboring paths. Role-derived physical classes strengthen visible musical identity without expanding the schema, while one shared metrics source keeps body geometry, rings, touch clearance, lane spacing, camera fit, and tests consistent. Separating lane ordering from lane distance preserves the exact musical-rate model and deterministic duplicate-rate behavior.

### D-031 — Accessible sound choice and device-local user samples

**Decision:** Expose the complete role-compatible first-party sound palette through one semantic selected-planet control. Group the active star's recommendations first, describe every sound in musical language, and apply a sound change through an undoable `SetPlanetSoundPreset` command without changing pattern, pitch intent, orbit, or identity. A tonal ring follows its parent to the new voice. Planet and whole-system Surprise remain explicit deterministic generation actions over the existing kits and respect planet/domain locks.

Allow bounded user audio through a separate local sound library. Store audio Blobs and metadata in a dedicated IndexedDB database and register their stable preset/asset IDs with the existing live voice factory; keep Blob data out of `Composition`, schema migrations, history, project JSON, URL shares, MIDI, the first-party manifest, and repository assets. Beat planets may map any subset of the seven existing drum voices. Bass, chord, melody, and texture imports accept one monophonic sample, estimate its source MIDI note through normalized autocorrelation, and require an editable confirmation before Tone transposes from that root into the canonical Safe Harmony MIDI notes.

Keep custom samples live-playback-only. They use the existing page-lifetime decoded-buffer cache, cancellable event instruments, overlap budgets, track strip, and per-occurrence synth fallback. Missing drum slots, failed local storage, missing local IDs on another device, decode failures, and share recipients all fall back to the role-safe synth rather than silence. Offline WAV remains synth-rendered and MIDI remains sample-independent. No new runtime dependency is added.

**Reason:** The content pack already contains substantial role and star variety, including 30 baked spatial replacements, but the main inspector did not expose that choice. A familiar semantic selector makes the existing authored value available without adding synthesis complexity. Keeping user Blobs outside canonical state protects deterministic save/share/export behavior and URL size, while source-note analysis plus manual correction makes one-shot tonal samples useful across the system's C-based calibration without pretending to solve polyphonic key detection. Reusing the established cache, safety limits, and fallback voice keeps personalization bounded on mobile.

### D-032 — Beginner surface and scoped Surprise actions

**Decision:** Default to three circular whole-system controls: Energy, Activity (the plain-language label for stored Density), and Space. Advanced expands the same semantic range controls to Energy, Density, Groove, Space, Complexity, and master Volume. Keep expression, deep orbit, sync, duplication, deletion, and local-sample detail behind the shared Advanced state. Keep the selected planet's current sound and role-compatible sound chooser visible in the beginner inspector.

Expose whole-system Surprise on the welcome screen and beside the scene's Add object action, and expose a separate Surprise on every selected planet. Whole-system Surprise regenerates all unlocked musical layers and bounded hidden values; planet Surprise changes only that unlocked planet and its attachments. Both advance deterministic generation revision, preserve locks, remain undoable, and use existing safe content.

**Reason:** The first thirty seconds should present one musical world, three expressive choices, and two clearly scoped creation actions instead of workstation density. Sharing one persisted disclosure state across macro, navigator, inspector, and mobile sheet avoids inconsistent expertise modes while preserving the complete existing toolset.

### D-033 — Direct gate editing and selectable orbit detail

**Decision:** A selected planet renders one editable gate for every canonical pattern step. Tap toggles a gate, tangential drag on its orbit arc rotates the entire pattern phase, and radial drag on an active melodic gate changes that event's relative safe-scale degree. The Focus View supplies equivalent semantic step buttons and labelled pitch nudges.

Expose only musically natural click-in choices for the current orbit: 4 for ¼ bar; 4/8 for ½ bar; 8/16 for one or two bars; and 8/16/32 for four bars. Advanced polymetric rates expose 6/12 for 1½ bars, 12/24 for three bars, 24 for six bars, and 32 for eight bars. This orbit-aware mapping supersedes D-020's fixed 16→12 and 32→24 tier conversion: an orbit edit now preserves steps-per-bar density and snaps to the nearest allowed count, preferring the simpler choice on a tie.

Resizing maps events by normalized orbit position, scales duration, clears template provenance, and deterministically keeps the strongest event when multiple events collapse onto one gate. In ordinary grids, four main beat landmarks receive the strongest visual treatment and their offbeat eighths receive a secondary treatment; 6/12/24 grids emphasize each triplet beat boundary. Hit regions remain larger than rendered gates.

**Reason:** Fewer visible decisions make a rhythm understandable before adding detail, while proportional remapping preserves the user's musical idea. Beat hierarchy teaches timing through cause and effect, and separate DOM controls ensure the canvas gestures are never the only essential path. The existing serializable event model and audio-authoritative compiler already support these grid sizes, so no new dependency or renderer-driven timing state is required.

### Current implementation note for D-014

D-026 supersedes D-014's next-bar replacement behavior for live performance controls. Deterministic probability, transport reset/resume behavior, export loop indexing, and intentional playhead-relative macro, expression, step, ring, loop-length, harmony, voice, and pattern editing are implemented. Major regeneration remains an explicit whole-project action rather than a continuous performance control.

## Open questions before implementation

### Q-001 — State library (resolved by D-011)

Default recommendation: Zustand with an explicit command/history layer.

Question:

- Does the project use Zustand, or a smaller custom external store?

Decision deadline: Milestone 0.

### Q-002 — UI styling (resolved by D-012)

Default recommendation: plain CSS with custom properties and scoped component styles.

Question:

- CSS Modules, vanilla CSS, or another lightweight approach?

Decision deadline: Milestone 0.

### Q-003 — Sample delivery format (resolved by D-019)

Question:

- Which combination of OGG, MP3, and synthesized fallback provides the best practical mobile support and download size?

Decision deadline: before audio content production in Milestone 2.

### Q-004 — Offline rendering fallback

Question:

- If a selected browser cannot reliably offline-render all sample voices, should the app offer real-time recording as a fallback or disable WAV export with a clear explanation?

Decision deadline: early Milestone 5.

### Q-005 — Share encoding (resolved)

Candidates:

- Compressed JSON in URL fragment
- Compact custom binary or schema
- Seed-only for untouched systems plus full state for edited systems

Decision: Full versioned composition JSON compressed with `fflate`, base64url encoded in a codec-versioned URL fragment, and validated before opening. Seed-only links are deferred until pristine provenance is modeled.

### Q-006 — Probability behavior (resolved by D-014)

Question:

- Should probabilistic events repeat identically every loop, evolve deterministically by loop index, or expose both modes?

Default recommendation: evolve deterministically by loop index.

Decision deadline: Milestone 2.

### Q-007 — Planet naming

Question:

- Automatically generate thematic names, use role labels by default, or both?

Default recommendation: role label plus generated optional name.

Decision deadline: Milestone 2.

### Q-008 — Advanced mode boundary

Question:

- Is Safe Harmony a simple toggle, or is there a broader Guided/Advanced mode?

Default recommendation: keep one interface and use expandable sections, with Safe Harmony as a specific toggle.

Decision deadline: Milestone 4.

## Deferred questions

These should not block the MVP:

- Binary star behavior
- Eight-bar harmonic phrases; 8-bar planet orbits are already supported by D-020
- Unusual time signatures
- Comets and celestial event arrangement
- Audio stems
- Hardware MIDI
- PWA installation
- Community gallery
