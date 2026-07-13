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
  inspectorExpanded: boolean;
  announcement: string;
  quality: "auto" | "low" | "balanced" | "high";
  reducedEffects: boolean;
}

export interface AppStore {
  compositionHistory: HistoryState<Composition>;
  ui: EphemeralUiState;
  dispatch: (command: CompositionCommand) => void;
  undo: () => void;
  redo: () => void;
  replaceComposition: (composition: Composition) => void;
  selectObject: (id: string | null) => void;
  setInspectorExpanded: (expanded: boolean) => void;
  setQuality: (quality: EphemeralUiState["quality"]) => void;
  setReducedEffects: (reduced: boolean) => void;
}

const starter = createStarterComposition();

export const useAppStore = create<AppStore>((set) => ({
  compositionHistory: createHistory(starter),
  ui: {
    selectedObjectId: starter.planets[0]?.id ?? null,
    inspectorExpanded: false,
    announcement: "First Light is ready.",
    quality: "auto",
    reducedEffects: false,
  },
  dispatch: (command) =>
    set((state) => {
      const result = applyCompositionCommand(
        state.compositionHistory.present,
        command,
      );
      return {
        compositionHistory: commitHistory(
          state.compositionHistory,
          result.composition,
        ),
        ui: { ...state.ui, announcement: result.description },
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
    })),
  selectObject: (id) =>
    set((state) => ({ ui: { ...state.ui, selectedObjectId: id } })),
  setInspectorExpanded: (expanded) =>
    set((state) => ({ ui: { ...state.ui, inspectorExpanded: expanded } })),
  setQuality: (quality) => set((state) => ({ ui: { ...state.ui, quality } })),
  setReducedEffects: (reducedEffects) =>
    set((state) => ({ ui: { ...state.ui, reducedEffects } })),
}));
