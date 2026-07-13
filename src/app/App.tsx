import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { AudioEngine, ScheduledVisualEvent } from "../audio";
import { getCompositionSuperLoop } from "../audio/CompositionCompiler";
import {
  SHOWCASE_SYSTEMS,
  type ShowcaseSystemDefinition,
} from "../content/showcaseSystems";
import type {
  AsteroidBeltState,
  Composition,
  LoopBars,
  MoonState,
  PlanetRole,
  PlanetState,
  RingState,
  StarPresetId,
} from "../domain/composition";
import {
  generateCompleteSystem,
  generatePlanetForRole,
  regenerateUnlockedSystem,
} from "../domain/generation";
import {
  applyGateRhythmPreset,
  inferGateRhythmPreset,
  type GateRhythmPresetId,
} from "../domain/rhythm";
import { createId } from "../domain/serialization/ids";
import {
  LocalCompositionRepository,
  type CompositionSummary,
} from "../persistence/LocalCompositionRepository";
import {
  createShareUrl,
  readShareStateFromHash,
} from "../persistence/shareCodec";
import type { VisualPulse } from "../scene/contracts";
import {
  selectCanRedo,
  selectCanUndo,
  selectComposition,
  selectSelectedPlanet,
} from "../state/selectors";
import { useAppStore } from "../state/store";
import { AddObjectPanel } from "../ui/add/AddObjectPanel";
import { ObjectList } from "../ui/accessibility/ObjectList";
import { ExportPanel } from "../ui/export/ExportPanel";
import {
  downloadBlob,
  downloadCompositionJson,
  sanitizeFilename,
} from "../ui/export/downloads";
import { FocusView } from "../ui/focus/FocusView";
import { PlanetInspector } from "../ui/inspector/PlanetInspector";
import {
  formatOrbitLoop,
  ORBIT_RATE_OPTIONS,
  parseOrbitRate,
} from "../ui/inspector/orbitRateOptions";
import { LibraryPanel } from "../ui/library/LibraryPanel";
import { MacroControls } from "../ui/macros/MacroControls";
import { ProjectMenu } from "../ui/menu/ProjectMenu";
import { Onboarding } from "../ui/onboarding/Onboarding";
import { ScenePolishOverlay } from "../ui/scene/ScenePolishOverlay";
import { TransportBar } from "../ui/transport/TransportBar";

type OpenPanel = "menu" | "add" | "library" | "export" | "mobile-editor" | null;

const repository = new LocalCompositionRepository();
const SceneCanvas = lazy(async () => {
  const module = await import("../ui/scene/SceneCanvas");
  return { default: module.SceneCanvas };
});

function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type });
}

function ringTypeForRole(role: PlanetRole): RingState["type"] {
  if (role === "beat") return "hat";
  if (role === "texture") return "shaker";
  return "perc";
}

function makeRing(role: PlanetRole): RingState {
  return {
    id: createId("ring"),
    type: ringTypeForRole(role),
    segments: 16,
    active: Array.from({ length: 16 }, (_, step) => step % 2 === 0),
    phase: 0,
    velocityVariation: 0.18,
    probability: 1,
    soundPresetId: "orbital-hat",
    level: 0.34,
  };
}

function makeAsteroidBelt(): AsteroidBeltState {
  return {
    id: createId("asteroids"),
    materialPresetId: "dust-percussion",
    gridSize: 16,
    events: [2, 7, 11, 15].map((step) => ({
      id: createId("event"),
      step,
      velocity: step === 15 ? 0.72 : 0.46,
      probability: 0.72,
      durationSteps: 0.5,
      drumVoice: "perc",
    })),
    population: 0.48,
    clustering: 0.35,
    turbulence: 0.12,
    accentChance: 0.2,
    level: 0.24,
    locked: false,
    visualSeed: Date.now() % 100_000,
  };
}

function makeMoon(parent: PlanetState): MoonState {
  const step = Math.max(1, Math.floor(parent.pattern.gridSize * 0.375));
  return {
    id: createId("moon"),
    behaviorPresetId:
      parent.role === "beat"
        ? "accent"
        : parent.role === "bass"
          ? "pickup"
          : parent.role === "chords"
            ? "harmony"
            : parent.role === "melody"
              ? "echo"
              : "counterpulse",
    pattern: {
      gridSize: parent.pattern.gridSize,
      humanize: Math.min(0.12, parent.pattern.humanize + 0.02),
      events: [
        {
          id: createId("event"),
          step,
          velocity: 0.58,
          probability: 0.76,
          durationSteps: 0.5,
          ...(parent.role === "beat"
            ? { drumVoice: "clap" as const }
            : {
                pitch: {
                  kind: "scaleDegree" as const,
                  degree: parent.role === "bass" ? 0 : 2,
                  octaveOffset: parent.role === "bass" ? 1 : 0,
                },
              }),
        },
      ],
    },
    orbitRatio: 2,
    phase: 0.125,
    level: 0.42,
    probability: 0.78,
    appearanceSeed: Date.now() % 100_000,
    muted: false,
    locked: false,
  };
}

function clonePlanet(planet: PlanetState): PlanetState {
  const clone = structuredClone(planet);
  clone.id = createId("planet");
  clone.name = `${planet.name} Echo`;
  clone.pattern.events = clone.pattern.events.map((event) => ({
    ...event,
    id: createId("event"),
  }));
  clone.moons = clone.moons.map((moon) => ({
    ...moon,
    id: createId("moon"),
    pattern: {
      ...moon.pattern,
      events: moon.pattern.events.map((event) => ({
        ...event,
        id: createId("event"),
      })),
    },
  }));
  if (clone.ring) clone.ring.id = createId("ring");
  clone.orbit.phase = (clone.orbit.phase + 0.125) % 1;
  return clone;
}

function starterForMood(presetId: StarPresetId): Composition {
  const generated = generateCompleteSystem(`mood-${presetId}`, {
    name: presetId === "radiant" ? "First Light" : "New Cosmic System",
    starPresetId: presetId,
    createdAt: new Date().toISOString(),
  });
  return {
    ...generated,
    planets: generated.planets.filter(
      (planet) => planet.role === "beat" || planet.role === "chords",
    ),
  };
}

export function App() {
  const composition = useAppStore(selectComposition);
  const selectedPlanet = useAppStore(selectSelectedPlanet);
  const canUndo = useAppStore(selectCanUndo);
  const canRedo = useAppStore(selectCanRedo);
  const ui = useAppStore((state) => state.ui);
  const saveStatus = useAppStore((state) => state.saveStatus);
  const dispatch = useAppStore((state) => state.dispatch);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const replaceComposition = useAppStore((state) => state.replaceComposition);
  const selectObject = useAppStore((state) => state.selectObject);
  const beginHistoryGroup = useAppStore((state) => state.beginHistoryGroup);
  const commitHistoryGroup = useAppStore((state) => state.commitHistoryGroup);
  const setOnboardingStep = useAppStore((state) => state.setOnboardingStep);
  const setAudioStatus = useAppStore((state) => state.setAudioStatus);
  const setPlaying = useAppStore((state) => state.setPlaying);
  const setSaveStatus = useAppStore((state) => state.setSaveStatus);
  const setQuality = useAppStore((state) => state.setQuality);
  const setReducedEffects = useAppStore((state) => state.setReducedEffects);
  const setReducedFlash = useAppStore((state) => state.setReducedFlash);

  const audioRef = useRef<AudioEngine | null>(null);
  const audioLoadRef = useRef<Promise<AudioEngine> | null>(null);
  const sharedLoadedRef = useRef(false);
  const initializedRef = useRef(false);
  const exportAbortRef = useRef<AbortController | null>(null);
  const pulseQueueRef = useRef<VisualPulse[]>([]);
  const [pulseRevision, setPulseRevision] = useState(0);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [saves, setSaves] = useState<CompositionSummary[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<
    "idle" | "working" | "error"
  >("idle");
  const [exportMessage, setExportMessage] = useState("");
  const [repetitions, setRepetitions] = useState<1 | 2 | 4>(1);
  const superLoopBars = getCompositionSuperLoop(composition).bars;

  const handleVisualEvent = useCallback((event: ScheduledVisualEvent) => {
    pulseQueueRef.current.push({
      occurrenceId: event.occurrenceId,
      entityId: event.trackId,
      eventId: event.eventId,
      scheduledTick: event.startTick,
      scheduledAudioTime: event.scheduledAudioTime,
      velocity: event.velocity,
    });
    if (pulseQueueRef.current.length > 128) {
      pulseQueueRef.current.splice(0, pulseQueueRef.current.length - 128);
    }
    setPulseRevision((revision) => revision + 1);
  }, []);

  const handleAudioHealthFailure = useCallback(() => {
    setPlaying(false);
    setAudioStatus("ready");
    setToast("Audio paused to prevent an overload. Press Play to recover.");
  }, [setAudioStatus, setPlaying]);

  const drainVisualPulses = useCallback(
    () => pulseQueueRef.current.splice(0),
    [],
  );

  const ensureAudioEngine = useCallback((): Promise<AudioEngine> => {
    if (audioRef.current) return Promise.resolve(audioRef.current);
    audioLoadRef.current ??= import("../audio").then(({ AudioEngine }) => {
      const engine = new AudioEngine({
        onVisualEvent: handleVisualEvent,
        onHealthFailure: handleAudioHealthFailure,
      });
      engine.setComposition(useAppStore.getState().compositionHistory.present);
      audioRef.current = engine;
      return engine;
    });
    return audioLoadRef.current;
  }, [handleAudioHealthFailure, handleVisualEvent]);

  useEffect(
    () => () => {
      audioRef.current?.dispose();
      audioRef.current = null;
      audioLoadRef.current = null;
    },
    [],
  );

  useEffect(() => {
    audioRef.current?.setComposition(composition);
  }, [composition]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const shared = readShareStateFromHash();
    if (shared?.success) {
      sharedLoadedRef.current = true;
      replaceComposition(shared.composition);
      window.setTimeout(
        () => setToast("Shared system opened. Start creating to hear it."),
        0,
      );
      return;
    }
    if (shared && !shared.success) {
      window.setTimeout(
        () => setToast(`${shared.message} A safe starter is ready instead.`),
        0,
      );
    }
    if (localStorage.getItem("cosmic-onboarding-version") === "1") {
      replaceComposition(generateCompleteSystem("first-light"));
      setOnboardingStep("complete");
    }
  }, [replaceComposition, setOnboardingStep]);

  useEffect(() => {
    localStorage.setItem("cosmic-quality", ui.quality);
    localStorage.setItem("cosmic-reduced-effects", String(ui.reducedEffects));
    localStorage.setItem("cosmic-reduced-flash", String(ui.reducedFlash));
  }, [ui.quality, ui.reducedEffects, ui.reducedFlash]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!openPanel && !focusOpen) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".topbar, .workspace, .macro-bar, .mobile-bottom-sheet",
      ),
    );
    for (const element of background) element.inert = true;

    const dialog = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-modal="true"]',
    );
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const frame = window.requestAnimationFrame(() => {
      dialog?.querySelector<HTMLElement>(focusableSelector)?.focus();
    });
    const handleModalKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenPanel(null);
        setFocusOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleModalKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleModalKey);
      for (const element of background) element.inert = false;
      previousFocus?.focus();
    };
  }, [focusOpen, openPanel]);

  const readTransportTicks = useCallback(
    () => audioRef.current?.transport.positionTick ?? 0,
    [],
  );

  const unlockAudio = async () => {
    setAudioStatus("loading");
    try {
      const engine = await ensureAudioEngine();
      await engine.unlock();
      setAudioStatus("ready");
      return true;
    } catch {
      setAudioStatus("error");
      setToast("Audio could not start. Check browser audio permissions.");
      return false;
    }
  };

  const startOnboarding = async () => {
    const audioReady = await unlockAudio();
    if (sharedLoadedRef.current) {
      if (audioReady) audioRef.current?.play();
      setPlaying(audioReady);
      setOnboardingStep("complete");
    } else {
      setOnboardingStep("mood");
    }
  };

  const openCompleteDemo = async () => {
    const audioReady = await unlockAudio();
    const showcase = SHOWCASE_SYSTEMS[0];
    const demo = generateCompleteSystem(showcase.seed, {
      name: showcase.name,
      starPresetId: showcase.starPresetId,
    });
    replaceComposition(demo);
    audioRef.current?.setComposition(demo);
    if (audioReady) audioRef.current?.play();
    setPlaying(audioReady);
    setOnboardingStep("complete");
    localStorage.setItem("cosmic-onboarding-version", "1");
  };

  const openShowcase = (showcase: ShowcaseSystemDefinition) => {
    const system = generateCompleteSystem(showcase.seed, {
      name: showcase.name,
      starPresetId: showcase.starPresetId,
      createdAt: new Date().toISOString(),
    });
    replaceComposition(system);
    audioRef.current?.setComposition(system);
    setOpenPanel(null);
    setToast(`${showcase.name} is ready to explore.`);
  };

  const chooseMood = (presetId: StarPresetId) => {
    const starter = starterForMood(presetId);
    replaceComposition(starter);
    audioRef.current?.setComposition(starter);
    if (ui.audioStatus === "ready") audioRef.current?.play();
    setPlaying(ui.audioStatus === "ready");
    setOnboardingStep("add-bass");
  };

  const playPause = async () => {
    if (!(await unlockAudio())) return;
    const engine = audioRef.current;
    if (!engine) return;
    if (engine.transport.state === "playing") {
      engine.pause();
      setPlaying(false);
    } else {
      engine.play();
      setPlaying(true);
    }
  };

  const stop = () => {
    const engine = audioRef.current;
    if (!engine?.transport.isUnlocked) return;
    engine.stop();
    setPlaying(false);
  };

  const save = async () => {
    setSaveStatus({ state: "saving" });
    try {
      await repository.save(composition);
      setSaveStatus({ state: "saved" });
      setToast("Saved in this browser.");
    } catch (error) {
      setSaveStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Save failed.",
      });
      downloadCompositionJson(composition);
      setToast("Local save failed, so a project JSON backup was downloaded.");
    }
  };

  const refreshLibrary = async () => {
    setLibraryLoading(true);
    try {
      setSaves(await repository.list());
    } catch {
      setToast("Saved systems are unavailable in this browser.");
    } finally {
      setLibraryLoading(false);
    }
  };

  const openLibrary = () => {
    setOpenPanel("library");
    void refreshLibrary();
  };

  const share = async () => {
    const url = createShareUrl(composition);
    try {
      await navigator.clipboard.writeText(url);
      setToast("Share link copied.");
    } catch {
      window.prompt("Copy this share link", url);
    }
  };

  const addRole = (role: PlanetRole) => {
    const planet = generatePlanetForRole(composition, role);
    dispatch({ type: "AddPlanet", planet });
    selectObject(planet.id);
    setOpenPanel(null);
    if (ui.onboardingStep === "add-bass" && role === "bass") {
      setOnboardingStep("orbit");
      setToast("Bass added. Now choose a faster or slower orbit.");
    }
  };

  const setOrbit = (loopBars: LoopBars) => {
    if (!selectedPlanet) return;
    dispatch({
      type: "SetPlanetLoopBars",
      planetId: selectedPlanet.id,
      loopBars,
    });
    if (ui.onboardingStep === "orbit") {
      setOnboardingStep("complete");
      localStorage.setItem("cosmic-onboarding-version", "1");
      setToast("You made your first cosmic groove.");
    }
  };

  const setGateRhythm = (presetId: GateRhythmPresetId) => {
    if (!selectedPlanet) return;
    dispatch({
      type: "SetPlanetPattern",
      planetId: selectedPlanet.id,
      pattern: applyGateRhythmPreset(
        selectedPlanet.pattern,
        selectedPlanet.role,
        presetId,
        selectedPlanet.id,
      ),
    });
    setToast(`${selectedPlanet.name} gates set to ${presetId}.`);
  };

  const addRing = () => {
    if (!selectedPlanet || selectedPlanet.ring) return;
    dispatch({
      type: "SetRing",
      planetId: selectedPlanet.id,
      ring: makeRing(selectedPlanet.role),
    });
    setOpenPanel(null);
  };

  const addMoon = () => {
    if (!selectedPlanet || selectedPlanet.moons.length >= 3) return;
    dispatch({
      type: "AddMoon",
      planetId: selectedPlanet.id,
      moon: makeMoon(selectedPlanet),
    });
    setOpenPanel(null);
    setToast(`${selectedPlanet.name} has a new moon.`);
  };

  const toggleSelectedMute = () => {
    if (!selectedPlanet) return;
    dispatch({ type: "TogglePlanetMute", planetId: selectedPlanet.id });
  };

  const toggleSelectedSolo = () => {
    if (!selectedPlanet) return;
    dispatch({ type: "TogglePlanetSolo", planetId: selectedPlanet.id });
  };

  const toggleSelectedLock = () => {
    if (!selectedPlanet) return;
    dispatch({ type: "TogglePlanetLock", planetId: selectedPlanet.id });
  };

  const openPatternEditor = () => {
    setOpenPanel(null);
    setFocusOpen(true);
  };

  const duplicateSelectedPlanet = () => {
    if (!selectedPlanet) return;
    const planet = clonePlanet(selectedPlanet);
    dispatch({ type: "DuplicatePlanet", planet });
    selectObject(planet.id);
  };

  const deleteSelectedPlanet = () => {
    if (!selectedPlanet) return;
    if (composition.planets.length <= 1) {
      setToast("Keep at least one planet in orbit.");
      return;
    }
    const deletedName = selectedPlanet.name;
    dispatch({ type: "RemovePlanet", planetId: selectedPlanet.id });
    selectObject(composition.star.id);
    setOpenPanel(null);
    setToast(`${deletedName} was blown out of orbit. Undo restores it.`);
  };

  const exportWav = async () => {
    const controller = new AbortController();
    exportAbortRef.current?.abort();
    exportAbortRef.current = controller;
    setExportStatus("working");
    setExportMessage("Preparing sounds…");
    try {
      const { renderCompositionToWav } = await import("../audio");
      const wav = await renderCompositionToWav(composition, {
        loops: repetitions,
        signal: controller.signal,
        onProgress: ({ phase, progress }) =>
          setExportMessage(
            `${phase === "compiling" ? "Preparing" : phase === "rendering" ? "Rendering" : "Encoding"}… ${Math.round(progress * 100)}%`,
          ),
      });
      downloadBlob(
        bytesToBlob(wav, "audio/wav"),
        `${sanitizeFilename(composition.name)}-${composition.bpm}bpm.wav`,
      );
      setExportStatus("idle");
      setToast("WAV export ready.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setExportStatus("idle");
        setExportMessage("");
        setToast("WAV export cancelled.");
        return;
      }
      setExportStatus("error");
      setExportMessage(
        "WAV rendering is unavailable here. Your MIDI and project JSON are still safe.",
      );
    } finally {
      if (exportAbortRef.current === controller) exportAbortRef.current = null;
    }
  };

  const exportMidi = async () => {
    try {
      const { exportCompositionToMidi } = await import("../audio");
      const midi = exportCompositionToMidi(composition, {
        loops: repetitions,
      });
      downloadBlob(
        bytesToBlob(midi, "audio/midi"),
        `${sanitizeFilename(composition.name)}-${composition.bpm}bpm.mid`,
      );
      setToast("MIDI export ready.");
    } catch {
      setExportStatus("error");
      setExportMessage(
        "MIDI export failed. Download project JSON as a backup.",
      );
    }
  };

  const handleSceneOrbitChange = useCallback(
    (planetId: string, loopBars: LoopBars) => {
      selectObject(planetId);
      dispatch({ type: "SetPlanetLoopBars", planetId, loopBars });
      if (useAppStore.getState().ui.onboardingStep === "orbit") {
        setOnboardingStep("complete");
        localStorage.setItem("cosmic-onboarding-version", "1");
        setToast("You made your first cosmic groove.");
      }
    },
    [dispatch, selectObject, setOnboardingStep],
  );

  const handleScenePhaseChange = useCallback(
    (planetId: string, phase: number) => {
      selectObject(planetId);
      dispatch({ type: "SetPlanetPhase", planetId, phase });
    },
    [dispatch, selectObject],
  );

  return (
    <main className="app-shell" data-reduced-motion={ui.reducedEffects}>
      <TransportBar
        name={composition.name}
        bpm={composition.bpm}
        isPlaying={ui.isPlaying}
        audioReady={ui.audioStatus === "ready"}
        audioError={ui.audioStatus === "error"}
        canUndo={canUndo}
        canRedo={canRedo}
        saveState={saveStatus.state}
        onPlayPause={playPause}
        onStop={stop}
        onTempo={(bpm) => dispatch({ type: "SetTempo", bpm })}
        onRename={(name) => dispatch({ type: "RenameComposition", name })}
        onUndo={undo}
        onRedo={redo}
        onSave={save}
        onMenu={() => setOpenPanel("menu")}
      />

      <div className="workspace">
        <ObjectList
          composition={composition}
          selectedId={ui.selectedObjectId}
          onSelect={selectObject}
        />
        <section className="scene-panel" aria-label="Cosmic instrument scene">
          <Suspense
            fallback={
              <div className="scene-loading" role="status">
                Mapping the first orbits…
              </div>
            }
          >
            <SceneCanvas
              composition={composition}
              selectedId={ui.selectedObjectId}
              visualPreferences={{
                quality: ui.quality,
                reducedMotion: ui.reducedEffects,
                reducedParticles: ui.reducedEffects,
                reducedFlash: ui.reducedFlash,
              }}
              readTransportTicks={readTransportTicks}
              pulseRevision={pulseRevision}
              drainVisualPulses={drainVisualPulses}
              onSelect={selectObject}
              onOrbitLoopBarsChange={handleSceneOrbitChange}
              onOrbitPhaseChange={handleScenePhaseChange}
            />
          </Suspense>
          <ScenePolishOverlay
            selectedPlanetRole={selectedPlanet?.role}
            selectedPlanetName={selectedPlanet?.name}
            isPlaying={ui.isPlaying}
            isLocked={selectedPlanet?.locked}
          />
          <div className="scene-status">
            <span className={ui.isPlaying ? "playing" : ""} />
            {ui.isPlaying ? "In orbit" : "Ready"} · {composition.bpm} BPM
          </div>
          {ui.onboardingStep === "add-bass" ? (
            <div className="coachmark" role="status">
              <strong>Add a bass planet</strong>
              <span>It will follow the beat automatically.</span>
              <button type="button" onClick={() => setOpenPanel("add")}>
                Add bass
              </button>
            </div>
          ) : null}
          {ui.onboardingStep === "orbit" ? (
            <div className="coachmark" role="status">
              <strong>Give it a different orbit</strong>
              <span>Choose a faster or slower rate in the inspector.</span>
            </div>
          ) : null}
          <button
            type="button"
            className="add-button"
            onClick={() => setOpenPanel("add")}
          >
            <span aria-hidden="true">+</span> Add object
          </button>
        </section>
        <PlanetInspector
          planet={selectedPlanet}
          superLoopBars={superLoopBars}
          onMute={toggleSelectedMute}
          onSolo={toggleSelectedSolo}
          onLock={toggleSelectedLock}
          onOrbit={setOrbit}
          gateRhythmPreset={
            selectedPlanet
              ? inferGateRhythmPreset(selectedPlanet.pattern)
              : "custom"
          }
          onGateRhythmPreset={setGateRhythm}
          onPattern={openPatternEditor}
          onRing={addRing}
          onDuplicate={duplicateSelectedPlanet}
          onDelete={deleteSelectedPlanet}
          canDelete={composition.planets.length > 1}
        />
      </div>

      <MacroControls
        macros={composition.macros}
        onBegin={(macro) =>
          beginHistoryGroup(`macro-${macro}`, `Changed ${macro}`)
        }
        onChange={(macro, value) =>
          dispatch({ type: "SetMacro", macro, value })
        }
        onCommit={commitHistoryGroup}
      />

      <div className="mobile-bottom-sheet">
        <div>
          <span
            aria-hidden="true"
            className={`object-symbol role-${selectedPlanet?.role ?? "beat"}`}
          />
          <span>
            <strong>{selectedPlanet?.name ?? "Select a planet"}</strong>
            <small>
              {selectedPlanet
                ? `${selectedPlanet.role} · ${formatOrbitLoop(selectedPlanet.orbit.loopBars)}`
                : "Use the object list to edit"}
            </small>
          </span>
        </div>
        <button type="button" onClick={() => setOpenPanel("mobile-editor")}>
          Controls
        </button>
        {selectedPlanet ? (
          <label className="mobile-orbit-control">
            <span>Orbit</span>
            <select
              aria-label="Orbit rate"
              value={selectedPlanet.orbit.loopBars}
              onChange={(event) => {
                const orbit = parseOrbitRate(event.target.value);
                if (orbit !== undefined) setOrbit(orbit);
              }}
            >
              {ORBIT_RATE_OPTIONS.map((orbit) => (
                <option key={orbit.bars} value={orbit.bars}>
                  {orbit.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <Onboarding
        step={ui.onboardingStep}
        audioStatus={ui.audioStatus}
        onStart={startOnboarding}
        onMood={chooseMood}
        onSkip={() => void openCompleteDemo()}
      />

      {openPanel ? (
        <button
          type="button"
          className="sheet-backdrop"
          onClick={() => setOpenPanel(null)}
          aria-label="Close open panel"
        />
      ) : null}
      {openPanel === "menu" ? (
        <ProjectMenu
          quality={ui.quality}
          reducedEffects={ui.reducedEffects}
          reducedFlash={ui.reducedFlash}
          onQuality={setQuality}
          onReducedEffects={setReducedEffects}
          onReducedFlash={setReducedFlash}
          onSave={save}
          onLibrary={openLibrary}
          onShare={share}
          onExport={() => setOpenPanel("export")}
          onJson={() => downloadCompositionJson(composition)}
          onSurprise={() => {
            const regenerated = regenerateUnlockedSystem(composition);
            dispatch({ type: "RegenerateSystem", composition: regenerated });
            setOpenPanel(null);
          }}
          onShowcase={openShowcase}
          onClose={() => setOpenPanel(null)}
        />
      ) : null}
      {openPanel === "add" ? (
        <AddObjectPanel
          selectedHasRing={Boolean(selectedPlanet?.ring)}
          selectedCanAddMoon={
            Boolean(selectedPlanet) && (selectedPlanet?.moons.length ?? 3) < 3
          }
          canAddAsteroids={!composition.asteroidBelt}
          onRole={addRole}
          onMoon={addMoon}
          onRing={addRing}
          onAsteroids={() => {
            dispatch({ type: "SetAsteroidBelt", belt: makeAsteroidBelt() });
            setOpenPanel(null);
          }}
          onClose={() => setOpenPanel(null)}
        />
      ) : null}
      {openPanel === "library" ? (
        <LibraryPanel
          saves={saves}
          loading={libraryLoading}
          onLoad={async (id) => {
            replaceComposition(await repository.load(id));
            setOpenPanel(null);
          }}
          onDelete={async (id) => {
            await repository.remove(id);
            await refreshLibrary();
          }}
          onClose={() => setOpenPanel(null)}
        />
      ) : null}
      {openPanel === "export" ? (
        <ExportPanel
          status={exportStatus}
          message={exportMessage}
          superLoopBars={superLoopBars}
          bpm={composition.bpm}
          beatsPerBar={composition.beatsPerBar}
          repetitions={repetitions}
          onRepetitions={setRepetitions}
          onWav={exportWav}
          onMidi={exportMidi}
          onJson={() => downloadCompositionJson(composition)}
          onCancel={() => exportAbortRef.current?.abort()}
          onClose={() => {
            exportAbortRef.current?.abort();
            setOpenPanel(null);
          }}
        />
      ) : null}
      {openPanel === "mobile-editor" ? (
        <section
          className="side-sheet mobile-editor-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-editor-heading"
        >
          <header>
            <div>
              <p className="panel-label">Accessible editor</p>
              <h2 id="mobile-editor-heading">Objects and controls</h2>
            </div>
            <button
              type="button"
              onClick={() => setOpenPanel(null)}
              aria-label="Close object controls"
            >
              ×
            </button>
          </header>
          <ObjectList
            composition={composition}
            selectedId={ui.selectedObjectId}
            onSelect={selectObject}
            headingId="mobile-object-list-heading"
          />
          <PlanetInspector
            planet={selectedPlanet}
            superLoopBars={superLoopBars}
            headingId="mobile-inspector-heading"
            onMute={toggleSelectedMute}
            onSolo={toggleSelectedSolo}
            onLock={toggleSelectedLock}
            onOrbit={setOrbit}
            gateRhythmPreset={
              selectedPlanet
                ? inferGateRhythmPreset(selectedPlanet.pattern)
                : "custom"
            }
            onGateRhythmPreset={setGateRhythm}
            onPattern={openPatternEditor}
            onRing={addRing}
            onDuplicate={duplicateSelectedPlanet}
            onDelete={deleteSelectedPlanet}
            canDelete={composition.planets.length > 1}
          />
        </section>
      ) : null}
      {focusOpen ? (
        <FocusView
          planet={selectedPlanet}
          onChange={(pattern) =>
            selectedPlanet &&
            dispatch({
              type: "SetPlanetPattern",
              planetId: selectedPlanet.id,
              pattern,
            })
          }
          onClose={() => setFocusOpen(false)}
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {ui.announcement}
      </p>
    </main>
  );
}
