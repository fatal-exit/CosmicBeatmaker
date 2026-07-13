import type {
  Composition,
  PlanetRole,
  PlanetState,
} from "../domain/composition";
import type { AppStore } from "./store";

export function selectComposition(state: AppStore): Composition {
  return state.compositionHistory.present;
}

export function selectCanUndo(state: AppStore): boolean {
  return state.compositionHistory.past.length > 0;
}

export function selectCanRedo(state: AppStore): boolean {
  return state.compositionHistory.future.length > 0;
}

export function selectSelectedPlanet(state: AppStore): PlanetState | undefined {
  const composition = selectComposition(state);
  return composition.planets.find(
    (planet) => planet.id === state.ui.selectedObjectId,
  );
}

export function selectAudiblePlanets(composition: Composition): PlanetState[] {
  const hasSolo = composition.planets.some((planet) => planet.soloed);
  return composition.planets.filter(
    (planet) => !planet.muted && (!hasSolo || planet.soloed),
  );
}

const ROLE_ORDER: PlanetRole[] = [
  "beat",
  "bass",
  "chords",
  "melody",
  "texture",
];

export function selectExportPlanets(composition: Composition): PlanetState[] {
  return [...composition.planets].sort(
    (left, right) =>
      ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role),
  );
}
