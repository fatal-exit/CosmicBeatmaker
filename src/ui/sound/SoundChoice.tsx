import { useId, useRef, useState } from "react";

import {
  STAR_SOUND_PALETTES,
  getSoundPresetDefinition,
  getSoundPresetsForRole,
  type SoundPresetDefinition,
} from "../../content/soundPresets";
import type {
  DrumVoiceId,
  PlanetState,
  StarPresetId,
} from "../../domain/composition";
import {
  formatMidiNote,
  inspectUserSample,
} from "../../audio/UserSampleAnalyzer";

const DRUM_SLOTS = [
  ["kick", "Kick"],
  ["snare", "Snare"],
  ["clap", "Clap"],
  ["closed-hat", "Closed hat"],
  ["open-hat", "Open hat"],
  ["rim", "Rim"],
  ["perc", "Percussion"],
] as const satisfies readonly (readonly [DrumVoiceId, string])[];

const AUDIO_ACCEPT = "audio/*,.wav,.mp3,.ogg,.m4a,.aac,.flac";
const MAX_DRUM_KIT_BYTES = 24 * 1024 * 1024;

export interface PitchedSoundImport {
  name: string;
  file: File;
  durationSeconds: number;
  rootMidi: number;
}

export interface DrumKitImport {
  name: string;
  samples: Partial<
    Record<DrumVoiceId, { file: File; durationSeconds: number }>
  >;
}

export interface SoundImportResult {
  persisted: boolean;
}

export interface SoundChoiceProps {
  planet: PlanetState;
  starPresetId: StarPresetId;
  onSound: (soundPresetId: string) => void;
  onImportPitched: (input: PitchedSoundImport) => Promise<SoundImportResult>;
  onImportDrumKit: (input: DrumKitImport) => Promise<SoundImportResult>;
}

function optionsForIds(
  presets: readonly SoundPresetDefinition[],
  ids: readonly string[],
): SoundPresetDefinition[] {
  return ids.flatMap((id) => {
    const preset = presets.find((candidate) => candidate.id === id);
    return preset ? [preset] : [];
  });
}

function defaultRootMidi(role: PlanetState["role"]): number {
  return role === "bass" ? 36 : 60;
}

export function SoundChoice({ planet, ...actions }: SoundChoiceProps) {
  const soundId = useId();
  const soundHintId = useId();
  const importStatusId = useId();
  const pitchedFormRef = useRef<HTMLFormElement>(null);
  const drumFormRef = useRef<HTMLFormElement>(null);
  const analysisRevision = useRef(0);
  const [name, setName] = useState(`My ${planet.role} sound`);
  const [pitchedFile, setPitchedFile] = useState<File | null>(null);
  const [pitchedDuration, setPitchedDuration] = useState<number | null>(null);
  const [rootMidi, setRootMidi] = useState(defaultRootMidi(planet.role));
  const [drumFiles, setDrumFiles] = useState<
    Partial<Record<DrumVoiceId, File>>
  >({});
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const presets = getSoundPresetsForRole(planet.role);
  const recommendedIds = STAR_SOUND_PALETTES[actions.starPresetId][planet.role];
  const recommended = optionsForIds(presets, recommendedIds);
  const recommendedSet = new Set<string>(recommendedIds);
  const otherFirstParty = presets.filter(
    (preset) => preset.source !== "user" && !recommendedSet.has(preset.id),
  );
  const userSounds = presets.filter((preset) => preset.source === "user");
  const current = getSoundPresetDefinition(planet.soundPresetId);

  const analysePitchedFile = async (file: File | null) => {
    const revision = analysisRevision.current + 1;
    analysisRevision.current = revision;
    setPitchedFile(file);
    setPitchedDuration(null);
    if (!file) {
      setStatus("");
      return;
    }
    setBusy(true);
    setStatus("Analysing the source note…");
    try {
      const inspected = await inspectUserSample(file, {
        maxDurationSeconds: 12,
        detectPitch: true,
        role: planet.role,
      });
      if (revision !== analysisRevision.current) return;
      setPitchedDuration(inspected.durationSeconds);
      if (inspected.pitch) {
        setRootMidi(inspected.pitch.rootMidi);
        setStatus(
          `Detected ${formatMidiNote(inspected.pitch.rootMidi)} at ${Math.round(inspected.pitch.frequency)} Hz. Adjust it below if needed.`,
        );
      } else {
        const fallback = defaultRootMidi(planet.role);
        setRootMidi(fallback);
        setStatus(
          `No steady pitch was detected. ${formatMidiNote(fallback)} is selected; choose the source note manually.`,
        );
      }
    } catch (error) {
      if (revision !== analysisRevision.current) return;
      setPitchedFile(null);
      setStatus(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      if (revision === analysisRevision.current) setBusy(false);
    }
  };

  const importPitched = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pitchedFile || pitchedDuration === null) {
      setStatus("Choose a decoded audio sample first.");
      return;
    }
    setBusy(true);
    setStatus("Adding your tuned sound…");
    try {
      const result = await actions.onImportPitched({
        name: name.trim() || `My ${planet.role} sound`,
        file: pitchedFile,
        durationSeconds: pitchedDuration,
        rootMidi,
      });
      setStatus(
        result.persisted
          ? "Sound added and kept in this browser."
          : "Sound added for this session; local storage was unavailable.",
      );
      setPitchedFile(null);
      setPitchedDuration(null);
      pitchedFormRef.current?.reset();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const importDrumKit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const chosen = Object.entries(drumFiles) as [DrumVoiceId, File][];
    if (chosen.length === 0) {
      setStatus(
        "Choose at least one drum slot. Empty slots use the safe synth.",
      );
      return;
    }
    if (
      chosen.reduce((total, [, file]) => total + file.size, 0) >
      MAX_DRUM_KIT_BYTES
    ) {
      setStatus("Keep the combined drum kit under 24 MB.");
      return;
    }
    setBusy(true);
    setStatus(
      `Checking ${chosen.length} drum ${chosen.length === 1 ? "sample" : "samples"}…`,
    );
    try {
      const inspected = await Promise.all(
        chosen.map(
          async ([voice, file]) =>
            [
              voice,
              {
                file,
                durationSeconds: (
                  await inspectUserSample(file, { maxDurationSeconds: 4 })
                ).durationSeconds,
              },
            ] as const,
        ),
      );
      const result = await actions.onImportDrumKit({
        name: name.trim() || "My drum kit",
        samples: Object.fromEntries(inspected),
      });
      setStatus(
        result.persisted
          ? "Drum kit added and kept in this browser."
          : "Drum kit added for this session; local storage was unavailable.",
      );
      setDrumFiles({});
      drumFormRef.current?.reset();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="sound-choice">
      <legend>Sound</legend>
      <p id={soundHintId}>
        Swap the instrument without changing this planet’s notes or rhythm.
      </p>
      <label htmlFor={soundId}>Instrument or kit</label>
      <select
        id={soundId}
        value={planet.soundPresetId}
        aria-describedby={soundHintId}
        onChange={(event) => actions.onSound(event.target.value)}
      >
        <optgroup
          label={`Recommended for ${actions.starPresetId.replace("-", " ")}`}
        >
          {recommended.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </optgroup>
        {otherFirstParty.length > 0 ? (
          <optgroup label="More built-in sounds">
            {otherFirstParty.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {userSounds.length > 0 ? (
          <optgroup label="Your sounds">
            {userSounds.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
      <p className="sound-description" aria-live="polite">
        {current?.description ??
          "This local sound is not available here, so playback uses a safe synth."}
      </p>
      <details className="user-sound-import">
        <summary>
          {planet.role === "beat"
            ? "Build your own drum kit"
            : "Use your own sample"}
        </summary>
        <p>
          Custom audio stays on this device. Shared links fall back safely, and
          offline WAV keeps using the matching synth voice.
        </p>
        {planet.role === "beat" ? (
          <form
            ref={drumFormRef}
            onSubmit={(event) => void importDrumKit(event)}
          >
            <label>
              Kit name
              <input
                type="text"
                maxLength={60}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <fieldset className="drum-slot-list">
              <legend>Drum slots</legend>
              <small>
                Choose any slots you want, up to 4 seconds each and 24 MB
                combined. Missing slots use the safe synth.
              </small>
              {DRUM_SLOTS.map(([voice, label]) => (
                <label key={voice}>
                  <span>{label}</span>
                  <input
                    type="file"
                    accept={AUDIO_ACCEPT}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      setDrumFiles((currentFiles) => {
                        const nextFiles = { ...currentFiles };
                        if (file) nextFiles[voice] = file;
                        else delete nextFiles[voice];
                        return nextFiles;
                      });
                    }}
                  />
                </label>
              ))}
            </fieldset>
            <button
              type="submit"
              disabled={busy || Object.keys(drumFiles).length === 0}
            >
              {busy ? "Adding kit…" : "Add and use this kit"}
            </button>
          </form>
        ) : (
          <form
            ref={pitchedFormRef}
            onSubmit={(event) => void importPitched(event)}
          >
            <label>
              Sound name
              <input
                type="text"
                maxLength={60}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Audio sample
              <input
                type="file"
                accept={AUDIO_ACCEPT}
                onChange={(event) =>
                  void analysePitchedFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <label>
              Source note
              <select
                value={rootMidi}
                onChange={(event) => setRootMidi(Number(event.target.value))}
                disabled={!pitchedFile}
              >
                {Array.from({ length: 61 }, (_, index) => index + 24).map(
                  (midi) => (
                    <option key={midi} value={midi}>
                      {formatMidiNote(midi)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <small>
              Use one monophonic sample up to 12 seconds and 12 MB. We analyse
              its pitch, then transpose from that source note into the system’s
              safe harmony.
            </small>
            <button
              type="submit"
              disabled={busy || !pitchedFile || pitchedDuration === null}
            >
              {busy ? "Analysing…" : "Add and use this sound"}
            </button>
          </form>
        )}
        <p id={importStatusId} className="import-status" role="status">
          {status}
        </p>
      </details>
    </fieldset>
  );
}
