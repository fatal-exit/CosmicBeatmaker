import type { StarPresetId } from "../../domain/composition";
import type { EphemeralUiState } from "../../state/store";

const MOODS: Array<{
  label: string;
  presetId: StarPresetId;
  description: string;
  color: string;
}> = [
  {
    label: "Radiant",
    presetId: "radiant",
    description: "Bright, balanced, and melodic",
    color: "sun",
  },
  {
    label: "Warm",
    presetId: "red-giant",
    description: "Slow, rounded, and spacious",
    color: "ember",
  },
  {
    label: "Delicate",
    presetId: "dwarf",
    description: "Small details and clear space",
    color: "ice",
  },
  {
    label: "Pulsing",
    presetId: "neutron",
    description: "Fast, mechanical, and syncopated",
    color: "signal",
  },
  {
    label: "Void",
    presetId: "void",
    description: "Dark, sparse, and atmospheric",
    color: "void",
  },
];

export interface OnboardingProps {
  step: EphemeralUiState["onboardingStep"];
  audioStatus: EphemeralUiState["audioStatus"];
  onStart: () => void | Promise<void>;
  onMood: (presetId: StarPresetId) => void;
  onSkip: () => void;
}

export function Onboarding({
  step,
  audioStatus,
  onStart,
  onMood,
  onSkip,
}: OnboardingProps) {
  if (step === "complete") return null;

  if (step === "enter") {
    return (
      <section className="onboarding-layer" aria-labelledby="welcome-heading">
        <div className="onboarding-enter">
          <div className="brand-orbit" aria-hidden="true">
            <span />
          </div>
          <p className="product-mark">Cosmic Beatmaker</p>
          <h1 id="welcome-heading">Your first beat is already in orbit.</h1>
          <p>Build a solar system. Make a beat. No music theory required.</p>
          <button
            type="button"
            className="primary-action"
            onClick={() => void onStart()}
            disabled={audioStatus === "loading"}
          >
            {audioStatus === "loading" ? "Starting audio…" : "Start creating"}
          </button>
          <button type="button" className="text-action" onClick={onSkip}>
            Explore the demo
          </button>
          {audioStatus === "error" ? (
            <p className="status-message" role="status">
              Audio could not start. You can still explore and try again.
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  if (step === "mood") {
    return (
      <section
        className="onboarding-layer mood-layer"
        aria-labelledby="mood-heading"
      >
        <div className="mood-picker">
          <div>
            <p className="product-mark">Choose a starting mood</p>
            <h2 id="mood-heading">What should this system feel like?</h2>
            <p>You can change every part later.</p>
          </div>
          <div className="mood-list">
            {MOODS.map((mood) => (
              <button
                type="button"
                className="mood-option"
                data-mood-color={mood.color}
                key={mood.presetId}
                onClick={() => onMood(mood.presetId)}
              >
                <span className="mood-star" aria-hidden="true" />
                <span>
                  <strong>{mood.label}</strong>
                  <small>{mood.description}</small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
          <button type="button" className="text-action" onClick={onSkip}>
            Use the recommended Radiant system
          </button>
        </div>
      </section>
    );
  }

  return null;
}
