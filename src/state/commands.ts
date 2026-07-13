import type {
  AsteroidBeltState,
  Composition,
  HarmonyState,
  LoopBars,
  MacroState,
  MoonState,
  PatternState,
  PlanetState,
  RingState,
  StarPresetId,
  TrackMixState,
} from "../domain/composition/types";

export type CompositionCommand =
  | { type: "RegenerateSystem"; composition: Composition; timestamp?: string }
  | { type: "RenameComposition"; name: string; timestamp?: string }
  | { type: "SetTempo"; bpm: number; timestamp?: string }
  | {
      type: "SetMacro";
      macro: keyof MacroState;
      value: number;
      timestamp?: string;
    }
  | { type: "SetSwing"; value: number; timestamp?: string }
  | { type: "SetMasterLevel"; value: number; timestamp?: string }
  | { type: "SetStarPreset"; presetId: StarPresetId; timestamp?: string }
  | {
      type: "SetHarmony";
      harmony: Partial<HarmonyState>;
      timestamp?: string;
    }
  | { type: "AddPlanet"; planet: PlanetState; timestamp?: string }
  | { type: "DuplicatePlanet"; planet: PlanetState; timestamp?: string }
  | { type: "TogglePlanetMute"; planetId: string; timestamp?: string }
  | { type: "TogglePlanetSolo"; planetId: string; timestamp?: string }
  | { type: "TogglePlanetLock"; planetId: string; timestamp?: string }
  | {
      type: "SetPlanetLoopBars";
      planetId: string;
      loopBars: LoopBars;
      timestamp?: string;
    }
  | {
      type: "SetPlanetPhase";
      planetId: string;
      phase: number;
      timestamp?: string;
    }
  | {
      type: "SetPlanetPattern";
      planetId: string;
      pattern: PatternState;
      timestamp?: string;
    }
  | {
      type: "SetPlanetMix";
      planetId: string;
      mix: Partial<TrackMixState>;
      timestamp?: string;
    }
  | { type: "AddMoon"; planetId: string; moon: MoonState; timestamp?: string }
  | { type: "RemoveMoon"; planetId: string; moonId: string; timestamp?: string }
  | { type: "SetRing"; planetId: string; ring?: RingState; timestamp?: string }
  | {
      type: "ToggleRingSegment";
      planetId: string;
      segment: number;
      timestamp?: string;
    }
  | { type: "SetAsteroidBelt"; belt?: AsteroidBeltState; timestamp?: string }
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
    case "RegenerateSystem":
      return {
        composition: command.composition,
        description: "Regenerated the unlocked system",
      };
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
    case "SetSwing":
      return {
        composition: {
          ...composition,
          swing: clamp(command.value, 0, 0.6),
          updatedAt: timestamp,
        },
        description: "Changed swing",
      };
    case "SetMasterLevel":
      return {
        composition: {
          ...composition,
          mix: { ...composition.mix, level: clamp(command.value, 0, 1) },
          updatedAt: timestamp,
        },
        description: "Changed master volume",
      };
    case "SetStarPreset":
      return {
        composition: {
          ...composition,
          star: { ...composition.star, presetId: command.presetId },
          updatedAt: timestamp,
        },
        description: "Changed the system mood",
      };
    case "SetHarmony":
      return {
        composition: {
          ...composition,
          harmony: { ...composition.harmony, ...command.harmony },
          updatedAt: timestamp,
        },
        description: "Changed harmony",
      };
    case "AddPlanet":
    case "DuplicatePlanet":
      if (
        composition.planets.length >= 8 ||
        composition.planets.some((planet) => planet.id === command.planet.id)
      ) {
        return {
          composition,
          description: "The system is already at its planet limit",
        };
      }
      return {
        composition: {
          ...composition,
          planets: [...composition.planets, command.planet],
          updatedAt: timestamp,
        },
        description:
          command.type === "AddPlanet"
            ? `${command.planet.name} added`
            : `${command.planet.name} duplicated`,
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
    case "TogglePlanetLock":
      return {
        composition: {
          ...composition,
          planets: composition.planets.map((planet) =>
            planet.id === command.planetId
              ? { ...planet, locked: !planet.locked }
              : planet,
          ),
          updatedAt: timestamp,
        },
        description: "Toggled planet lock",
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
                  },
                }
              : planet,
          ),
          updatedAt: timestamp,
        },
        description: "Changed orbit loop length",
      };
    case "SetPlanetPhase":
      return {
        composition: {
          ...composition,
          planets: composition.planets.map((planet) =>
            planet.id === command.planetId
              ? {
                  ...planet,
                  orbit: {
                    ...planet.orbit,
                    phase: ((command.phase % 1) + 1) % 1,
                  },
                }
              : planet,
          ),
          updatedAt: timestamp,
        },
        description: "Rotated planet pattern",
      };
    case "SetPlanetPattern":
      return {
        composition: {
          ...composition,
          planets: composition.planets.map((planet) =>
            planet.id === command.planetId
              ? { ...planet, pattern: command.pattern }
              : planet,
          ),
          updatedAt: timestamp,
        },
        description: "Changed planet pattern",
      };
    case "SetPlanetMix":
      return {
        composition: {
          ...composition,
          planets: composition.planets.map((planet) =>
            planet.id === command.planetId
              ? {
                  ...planet,
                  mix: {
                    level: clamp(command.mix.level ?? planet.mix.level, 0, 1),
                    pan: clamp(command.mix.pan ?? planet.mix.pan, -1, 1),
                    filter: clamp(
                      command.mix.filter ?? planet.mix.filter,
                      0,
                      1,
                    ),
                    reverbSend: clamp(
                      command.mix.reverbSend ?? planet.mix.reverbSend,
                      0,
                      1,
                    ),
                    delaySend: clamp(
                      command.mix.delaySend ?? planet.mix.delaySend,
                      0,
                      1,
                    ),
                  },
                }
              : planet,
          ),
          updatedAt: timestamp,
        },
        description: "Changed planet sound",
      };
    case "AddMoon":
      return {
        composition: {
          ...composition,
          planets: composition.planets.map((planet) =>
            planet.id === command.planetId && planet.moons.length < 3
              ? { ...planet, moons: [...planet.moons, command.moon] }
              : planet,
          ),
          updatedAt: timestamp,
        },
        description: "Added a moon",
      };
    case "RemoveMoon":
      return {
        composition: {
          ...composition,
          planets: composition.planets.map((planet) =>
            planet.id === command.planetId
              ? {
                  ...planet,
                  moons: planet.moons.filter(
                    (moon) => moon.id !== command.moonId,
                  ),
                }
              : planet,
          ),
          updatedAt: timestamp,
        },
        description: "Removed a moon",
      };
    case "SetRing":
      return {
        composition: {
          ...composition,
          planets: composition.planets.map((planet) =>
            planet.id === command.planetId
              ? { ...planet, ring: command.ring }
              : planet,
          ),
          updatedAt: timestamp,
        },
        description: command.ring
          ? "Added a rhythmic ring"
          : "Removed the rhythmic ring",
      };
    case "ToggleRingSegment":
      return {
        composition: {
          ...composition,
          planets: composition.planets.map((planet) => {
            if (planet.id !== command.planetId || !planet.ring) return planet;
            const active = [...planet.ring.active];
            if (command.segment >= 0 && command.segment < active.length) {
              active[command.segment] = !active[command.segment];
            }
            return { ...planet, ring: { ...planet.ring, active } };
          }),
          updatedAt: timestamp,
        },
        description: "Changed the ring rhythm",
      };
    case "SetAsteroidBelt":
      return {
        composition: {
          ...composition,
          asteroidBelt: command.belt,
          updatedAt: timestamp,
        },
        description: command.belt
          ? "Added an asteroid belt"
          : "Removed the asteroid belt",
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
