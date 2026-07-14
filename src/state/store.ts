import { create } from "zustand";

import {
  createStarterComposition,
  type Composition,
} from "../domain/composition";
import { applyCompositionCommand, type CompositionCommand } from "./commands";
import {
  commitHistory,
  createHistory,
  redoHistory,
  type HistoryState,
  undoHistory,
} from "./history";

export interface EphemeralUiState {
  selectedObjectId: string | null;
  advancedControls: boolean;
  announcement: string;
  quality: "auto" | "low" | "balanced" | "high";
  reducedEffects: boolean;
  reducedFlash: boolean;
  onboardingStep: "enter" | "mood" | "add-bass" | "orbit" | "complete";
  audioStatus: "locked" | "loading" | "ready" | "error";
  isPlaying: boolean;
}

export interface SaveStatus {
  state: "idle" | "dirty" | "saving" | "saved" | "error";
  message?: string;
}

interface HistoryGroup {
  key: string;
  description: string;
  origin: Composition;
}

export interface AppStore {
  compositionHistory: HistoryState<Composition>;
  ui: EphemeralUiState;
  saveStatus: SaveStatus;
  historyGroup: HistoryGroup | null;
  dispatch: (command: CompositionCommand) => void;
  undo: () => void;
  redo: () => void;
  replaceComposition: (composition: Composition) => void;
  beginHistoryGroup: (key: string, description: string) => void;
  commitHistoryGroup: () => void;
  cancelHistoryGroup: () => void;
  selectObject: (id: string | null) => void;
  setAdvancedControls: (expanded: boolean) => void;
  setQuality: (quality: EphemeralUiState["quality"]) => void;
  setReducedEffects: (reduced: boolean) => void;
  setReducedFlash: (reduced: boolean) => void;
  setOnboardingStep: (step: EphemeralUiState["onboardingStep"]) => void;
  setAudioStatus: (status: EphemeralUiState["audioStatus"]) => void;
  setPlaying: (playing: boolean) => void;
  setSaveStatus: (status: SaveStatus) => void;
}

const starter = createStarterComposition();

function readStoredQuality(): EphemeralUiState["quality"] {
  if (typeof localStorage === "undefined") return "auto";
  try {
    const value = localStorage.getItem("cosmic-quality");
    return value === "low" ||
      value === "balanced" ||
      value === "high" ||
      value === "auto"
      ? value
      : "auto";
  } catch {
    return "auto";
  }
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

const prefersReducedMotion =
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export const useAppStore = create<AppStore>((set) => ({
  compositionHistory: createHistory(starter),
  ui: {
    selectedObjectId: starter.planets[0]?.id ?? null,
    advancedControls: readStoredBoolean("cosmic-advanced-controls", false),
    announcement: "First Light is ready.",
    quality: readStoredQuality(),
    reducedEffects: readStoredBoolean(
      "cosmic-reduced-effects",
      prefersReducedMotion,
    ),
    reducedFlash: readStoredBoolean("cosmic-reduced-flash", false),
    onboardingStep: "enter",
    audioStatus: "locked",
    isPlaying: false,
  },
  saveStatus: { state: "idle" },
  historyGroup: null,
  dispatch: (command) =>
    set((state) => {
      const result = applyCompositionCommand(
        state.compositionHistory.present,
        command,
      );
      return {
        compositionHistory: state.historyGroup
          ? { ...state.compositionHistory, present: result.composition }
          : commitHistory(state.compositionHistory, result.composition),
        ui: { ...state.ui, announcement: result.description },
        saveStatus: { state: "dirty" },
      };
    }),
  undo: () =>
    set((state) => ({
      compositionHistory: undoHistory(state.compositionHistory),
      ui: { ...state.ui, announcement: "Undid the last change." },
    })),
  redo: () =>
    set((state) => ({
      compositionHistory: redoHistory(state.compositionHistory),
      ui: { ...state.ui, announcement: "Redid the last change." },
    })),
  replaceComposition: (composition) =>
    set((state) => ({
      compositionHistory: createHistory(composition),
      ui: {
        ...state.ui,
        selectedObjectId: composition.planets[0]?.id ?? null,
        announcement: `${composition.name} loaded.`,
      },
      saveStatus: { state: "saved" },
      historyGroup: null,
    })),
  beginHistoryGroup: (key, description) =>
    set((state) =>
      state.historyGroup
        ? state
        : {
            historyGroup: {
              key,
              description,
              origin: state.compositionHistory.present,
            },
          },
    ),
  commitHistoryGroup: () =>
    set((state) => {
      if (!state.historyGroup) return state;
      const { origin, description } = state.historyGroup;
      const present = state.compositionHistory.present;
      if (Object.is(origin, present)) return { historyGroup: null };
      return {
        compositionHistory: {
          present,
          past: [...state.compositionHistory.past, origin].slice(-50),
          future: [],
        },
        ui: { ...state.ui, announcement: description },
        historyGroup: null,
      };
    }),
  cancelHistoryGroup: () =>
    set((state) =>
      state.historyGroup
        ? {
            compositionHistory: {
              ...state.compositionHistory,
              present: state.historyGroup.origin,
            },
            historyGroup: null,
          }
        : state,
    ),
  selectObject: (id) =>
    set((state) => ({ ui: { ...state.ui, selectedObjectId: id } })),
  setAdvancedControls: (advancedControls) =>
    set((state) => ({ ui: { ...state.ui, advancedControls } })),
  setQuality: (quality) => set((state) => ({ ui: { ...state.ui, quality } })),
  setReducedEffects: (reducedEffects) =>
    set((state) => ({ ui: { ...state.ui, reducedEffects } })),
  setReducedFlash: (reducedFlash) =>
    set((state) => ({ ui: { ...state.ui, reducedFlash } })),
  setOnboardingStep: (onboardingStep) =>
    set((state) => ({ ui: { ...state.ui, onboardingStep } })),
  setAudioStatus: (audioStatus) =>
    set((state) => ({ ui: { ...state.ui, audioStatus } })),
  setPlaying: (isPlaying) =>
    set((state) => ({ ui: { ...state.ui, isPlaying } })),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
}));
