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
  canAddAsteroids: boolean;
  onRole: (role: PlanetRole) => void;
  onRing: () => void;
  onAsteroids: () => void;
  onClose: () => void;
}

export function AddObjectPanel(props: AddObjectPanelProps) {
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
          onClick={props.onRing}
          disabled={props.selectedHasRing}
        >
          <span>Planetary ring</span>
          <small>
            {props.selectedHasRing
              ? "Selected planet already has one"
              : "A regular 16-step pulse"}
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
