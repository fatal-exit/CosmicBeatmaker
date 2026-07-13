import type { PlanetRole } from "../../domain/composition";

const ROLES: Array<{
  role: PlanetRole;
  name: string;
  description: string;
}> = [
  { role: "beat", name: "Beat", description: "The rhythmic anchor" },
  {
    role: "bass",
    name: "Bass",
    description: "Low notes that follow the groove",
  },
  { role: "chords", name: "Chords", description: "The harmonic atmosphere" },
  { role: "melody", name: "Melody", description: "A memorable orbiting motif" },
  {
    role: "texture",
    name: "Texture",
    description: "Dust, signals, and spacious detail",
  },
];

export interface AddObjectPanelProps {
  selectedHasRing: boolean;
  selectedRole?: PlanetRole;
  selectedCanAddMoon: boolean;
  canAddAsteroids: boolean;
  onRole: (role: PlanetRole) => void;
  onMoon: () => void;
  onRing: () => void;
  onAsteroids: () => void;
  onClose: () => void;
}

export function AddObjectPanel(props: AddObjectPanelProps) {
  const ringDescription =
    props.selectedRole === "melody"
      ? "Adds quiet ghost notes around the melody"
      : props.selectedRole === "chords"
        ? "Replaces chord hits with a flowing arpeggio"
        : props.selectedRole === "bass"
          ? "Adds syncopated octave pickups"
          : props.selectedRole === "texture"
            ? "Adds a regular shaker texture"
            : "Adds a regular high-percussion pulse";

  return (
    <section
      className="side-sheet add-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-heading"
    >
      <header>
        <div>
          <p className="panel-label">Add to this system</p>
          <h2 id="add-heading">Choose a musical role</h2>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close add menu"
        >
          ×
        </button>
      </header>
      <div className="role-list">
        {ROLES.map((item) => (
          <button
            type="button"
            key={item.role}
            onClick={() => props.onRole(item.role)}
          >
            <span
              aria-hidden="true"
              className={`object-symbol role-${item.role}`}
            />
            <span>
              <strong>{item.name}</strong>
              <small>{item.description}</small>
            </span>
            <span aria-hidden="true">+</span>
          </button>
        ))}
      </div>
      <div className="structural-additions">
        <h3>Rhythmic structures</h3>
        <button
          type="button"
          onClick={props.onMoon}
          disabled={!props.selectedCanAddMoon}
        >
          <span>Orbiting moon</span>
          <small>
            {props.selectedCanAddMoon
              ? "A quieter embellishment linked to this planet"
              : "Select a planet with room for another moon"}
          </small>
        </button>
        <button
          type="button"
          onClick={props.onRing}
          disabled={props.selectedHasRing || !props.selectedRole}
        >
          <span>Planetary ring</span>
          <small>
            {props.selectedHasRing
              ? "Selected planet already has one"
              : props.selectedRole
                ? ringDescription
                : "Select a planet to add its role-aware ring"}
          </small>
        </button>
        <button
          type="button"
          onClick={props.onAsteroids}
          disabled={!props.canAddAsteroids}
        >
          <span>Asteroid belt</span>
          <small>
            {props.canAddAsteroids
              ? "Organic, scattered percussion"
              : "This system already has one"}
          </small>
        </button>
      </div>
    </section>
  );
}
