import { describe, expect, it } from "vitest";

import {
  MIN_PLANET_ORBIT_RADIUS,
  PLANET_ORBIT_LANE_GAP,
  PLANET_VISUAL_PROFILES,
  deriveSizeAwareOrbitRadii,
  planetBodyRadius,
  planetVisualMetrics,
} from "../src/scene/planetVisuals";

describe("planet visual scale and lane spacing", () => {
  it("maps musical roles to clearly ordered physical planet classes", () => {
    expect(PLANET_VISUAL_PROFILES.beat.kind).toBe("rocky");
    expect(PLANET_VISUAL_PROFILES.bass.kind).toBe("gas-giant");
    expect(PLANET_VISUAL_PROFILES.chords.kind).toBe("super-earth");
    expect(PLANET_VISUAL_PROFILES.melody.kind).toBe("ice-world");
    expect(PLANET_VISUAL_PROFILES.texture.kind).toBe("dwarf-world");

    const radii = {
      rocky: planetBodyRadius("beat", 1),
      gasGiant: planetBodyRadius("bass", 1),
      superEarth: planetBodyRadius("chords", 1),
      iceWorld: planetBodyRadius("melody", 1),
      dwarfWorld: planetBodyRadius("texture", 1),
    };
    expect(radii.gasGiant).toBeGreaterThan(radii.superEarth);
    expect(radii.superEarth).toBeGreaterThan(radii.iceWorld);
    expect(radii.iceWorld).toBeGreaterThan(radii.rocky);
    expect(radii.rocky).toBeGreaterThan(radii.dwarfWorld);
  });

  it("gives gas giants a broader, oblate body and proportionally larger ring", () => {
    const rocky = planetVisualMetrics("beat", 1, {
      hasEvents: true,
      hasRing: true,
    });
    const gasGiant = planetVisualMetrics("bass", 1, {
      hasEvents: true,
      hasRing: true,
    });

    expect(gasGiant.bodyScale[1]).toBeLessThan(gasGiant.bodyScale[0]);
    expect(gasGiant.bodyExtent).toBeGreaterThan(rocky.bodyExtent);
    expect(gasGiant.ring.radius).toBeGreaterThan(rocky.ring.radius);
    expect(gasGiant.ring.fragmentTangentialSize).toBeGreaterThan(
      rocky.ring.fragmentTangentialSize,
    );
    expect(gasGiant.visualExtent).toBeGreaterThan(rocky.visualExtent);
  });

  it("accumulates orbit radii from neighboring visual envelopes", () => {
    const lanes = [
      { id: "rock", laneIndex: 0, visualExtent: 0.45 },
      { id: "giant", laneIndex: 1, visualExtent: 0.9 },
      { id: "dwarf", laneIndex: 2, visualExtent: 0.32 },
    ];
    const radii = deriveSizeAwareOrbitRadii(lanes);

    expect(radii.get("rock")).toBe(MIN_PLANET_ORBIT_RADIUS);
    expect(radii.get("giant")! - radii.get("rock")!).toBeCloseTo(
      0.45 + 0.9 + PLANET_ORBIT_LANE_GAP,
    );
    expect(radii.get("dwarf")! - radii.get("giant")!).toBeCloseTo(
      0.9 + 0.32 + PLANET_ORBIT_LANE_GAP,
    );
  });

  it("includes rings and moons in a planet's lane clearance", () => {
    const bare = planetVisualMetrics("bass", 1, { hasEvents: true });
    const ringed = planetVisualMetrics("bass", 1, {
      hasEvents: true,
      hasRing: true,
    });
    const moonSystem = planetVisualMetrics("bass", 1, {
      hasEvents: true,
      hasMoons: true,
      hasRing: true,
    });

    expect(ringed.visualExtent).toBeGreaterThan(bare.visualExtent);
    expect(moonSystem.visualExtent).toBeGreaterThan(ringed.visualExtent);
  });
});
