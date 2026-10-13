import { describe, expect, it } from "vitest";
import { layoutHongKong } from "../world/hong-kong";
import { ROOF_DECK } from "../world/arena";
import { SHOOTOUT_EYE, shootoutView } from "../world/route";
import { arenaReach, groundHit, VICTORIA_HARBOUR, waterAt } from "../world/terrain";
import { harbourPads, shootoutSpots, type Sees } from "./spots";

/** Sight over the bare terrain: the world's ground alone stands in the way. */
const overTerrain: Sees = (from, to, margin = 0) => {
  const way = to.clone().sub(from);
  const far = way.length() - margin;
  const hit = groundHit(from, way.normalize(), far);
  return !hit || hit.distance >= far;
};

const eye = shootoutView(1).pose.position;
const spots = shootoutSpots(eye, overTerrain);
const ofKind = (kind: string) => spots.filter((s) => s.kind === kind);

describe("where the Shootout's bots pop up", () => {
  it("has every kind of spot in sight from the stage roof: the rim, the shore, the harbour, Hong Kong's roofs, the Diamond's towers", () => {
    expect(ofKind("rim").length).toBeGreaterThanOrEqual(2);
    expect(ofKind("shore").length).toBeGreaterThanOrEqual(4);
    expect(ofKind("pad")).toHaveLength(5);
    expect(ofKind("roof")).toHaveLength(5);
    expect(ofKind("tower")).toHaveLength(4);
  });

  it("keeps every spot apart from the others, and tells how far each is", () => {
    for (const [i, a] of spots.entries()) {
      expect(a.distance).toBeCloseTo(a.position.distanceTo(eye));
      for (const b of spots.slice(i + 1)) {
        if (a.kind === "tower" && b.kind === "tower") continue;
        expect(a.position.distanceTo(b.position)).toBeGreaterThan(10);
      }
    }
  });

  it("stands the shore's on dry land below the stage roof, off the Arena", () => {
    for (const { position: p } of ofKind("shore")) {
      expect(waterAt(p.x, p.z)).toBe(0);
      expect(p.y).toBeLessThan(eye.y - 6);
      expect(arenaReach(p.x, p.z).out).toBeGreaterThan(1.15);
    }
  });

  it("lays five pads on Victoria Harbour's open water, apart, numbered left to right", () => {
    const pads = harbourPads();
    expect(pads).toHaveLength(5);
    for (const p of pads) {
      expect(waterAt(p.x, p.z)).toBeGreaterThan(0.98);
      expect(p.y).toBe(VICTORIA_HARBOUR.level);
    }
    for (const [i, a] of pads.entries()) {
      for (const b of pads.slice(i + 1)) expect(a.distanceTo(b)).toBeGreaterThan(20);
    }
  });

  it("stands a roof's bot on its Landmark, between its foot and its tip", () => {
    const landmarks = layoutHongKong().landmarks;
    for (const { position: p } of ofKind("roof")) {
      const landmark = landmarks.find((l) => Math.hypot(l.x - p.x, l.z - p.z) < 4)!;
      expect(landmark).toBeDefined();
      expect(p.y).toBeGreaterThan(landmark.foot + 40);
      // ICC has no crown: its roof is its tip.
      expect(p.y).toBeLessThanOrEqual(landmark.tip + 1e-6);
    }
  });

  it("puts only what can be seen: a spot behind the ground is left out, but for the practice bot's beside the visitor", () => {
    const blind: Sees = () => false;
    expect(shootoutSpots(eye, blind).map((s) => s.kind)).toEqual(["practice"]);
  });

  it("stands the practice bot on the B-stage, not too far off, below the visitor", () => {
    const [practice] = ofKind("practice");
    expect(practice.distance).toBeGreaterThan(15);
    expect(practice.distance).toBeLessThan(35);
    expect(practice.position.y).toBeLessThan(eye.y - SHOOTOUT_EYE - ROOF_DECK.thick);
  });
});
