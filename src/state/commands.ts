import type {
  Composition,
  LoopBars,
  MacroState,
} from "../domain/composition/types";

export type CompositionCommand =
  | { type: "RenameComposition"; name: string; timestamp?: string }
  | { type: "SetTempo"; bpm: number; timestamp?: string }
  | {
      type: "SetMacro";
      macro: keyof MacroState;
      value: number;
      timestamp?: string;
    }
  | { type: "TogglePlanetMute"; planetId: string; timestamp?: string }
  | { type: "TogglePlanetSolo"; planetId: string; timestamp?: string }
  | {
      type: "SetPlanetLoopBars";
      planetId: string;
      loopBars: LoopBars;
      timestamp?: string;
    }
  | { type: "RemovePlanet"; planetId: string; timestamp?: string };

export interface CommandResult {
  composition: Composition;
  description: string;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function applyCompositionCommand(
  composition: Composition,
  command: CompositionCommand,
): CommandResult {
  const timestamp = command.timestamp ?? new Date().toISOString();

  switch (command.type) {
    case "RenameComposition":
      return {
        composition: {
          ...composition,
          name: command.name.trim() || composition.name,
          updatedAt: timestamp,
        },
        description: `Renamed system to ${command.name.trim() || composition.name}`,
      };
    case "SetTempo":
      return {
        composition: {
          ...composition,
          bpm: clamp(Math.round(command.bpm), 70, 140),
          updatedAt: timestamp,
        },
        description: "Changed tempo",
      };
    case "SetMacro":
      return {
        composition: {
          ...composition,
          macros: {
            ...composition.macros,
            [command.macro]: clamp(command.value, 0, 1),
          },
          updatedAt: timestamp,
        },
        description: `Changed ${command.macro}`,
      };
    case "TogglePlanetMute":
      return {
        composition: {
          ...composition,
          planets: composition.planets.map((planet) =>
            planet.id === command.planetId
              ? { ...planet, muted: !planet.muted }
              : planet,
          ),
          updatedAt: timestamp,
        },
        description: "Toggled planet mute",
      };
    case "TogglePlanetSolo":
      return {
        composition: {
          ...composition,
          planets: composition.planets.map((planet) =>
            planet.id === command.planetId
              ? { ...planet, soloed: !planet.soloed }
              : planet,
          ),
          updatedAt: timestamp,
        },
        description: "Toggled planet solo",
      };
    case "SetPlanetLoopBars":
      return {
        composition: {
          ...composition,
          planets: composition.planets.map((planet) =>
            planet.id === command.planetId
              ? {
                  ...planet,
                  orbit: {
                    ...planet.orbit,
                    loopBars: command.loopBars,
                    shellIndex: [0.5, 1, 2, 4].indexOf(command.loopBars),
                  },
                }
              : planet,
          ),
          updatedAt: timestamp,
        },
        description: "Changed orbit loop length",
      };
    case "RemovePlanet": {
      if (composition.planets.length === 1)
        return { composition, description: "Kept the last audible planet" };
      return {
        composition: {
          ...composition,
          planets: composition.planets.filter(
            (planet) => planet.id !== command.planetId,
          ),
          updatedAt: timestamp,
        },
        description: "Removed planet",
      };
    }
  }
}
