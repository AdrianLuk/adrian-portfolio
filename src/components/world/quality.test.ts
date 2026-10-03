import { describe, expect, it } from "vitest";
import {
  moteCountFor,
  pixelRatioFor,
  plateFinishFor,
  tierFor,
} from "./quality";

describe("pixelRatioFor", () => {
  it("caps the device pixel ratio at 1.5", () => {
    expect(pixelRatioFor(1)).toBe(1);
    expect(pixelRatioFor(1.25)).toBe(1.25);
    expect(pixelRatioFor(2)).toBe(1.5);
    expect(pixelRatioFor(3)).toBe(1.5);
  });

  it("treats a missing ratio as 1", () => {
    expect(pixelRatioFor(0)).toBe(1);
    expect(pixelRatioFor(Number.NaN)).toBe(1);
  });
});

describe("moteCountFor", () => {
  it("scales the motes with the canvas, so phones draw fewer", () => {
    expect(moteCountFor(390, 760)).toBeLessThan(moteCountFor(1440, 820));
  });

  it("stays within a floor and a ceiling", () => {
    expect(moteCountFor(200, 200)).toBe(60);
    expect(moteCountFor(2560, 1440)).toBe(260);
    expect(moteCountFor(7680, 4320)).toBe(260);
  });
});

describe("tierFor", () => {
  it("gives the full plate to screens 1024 CSS px and wider", () => {
    expect(tierFor(1024, 1)).toBe("full");
    expect(tierFor(1440, 2)).toBe("full");
    expect(tierFor(2560, 1)).toBe("full");
  });

  it("gives phones, small tablets and sub-1x screens the lite plate", () => {
    expect(tierFor(412, 2.6)).toBe("lite");
    expect(tierFor(1023, 2)).toBe("lite");
    expect(tierFor(1440, 0.75)).toBe("lite");
  });
});

describe("plateFinishFor", () => {
  it("reflects a sharper environment, with clearcoat, on the full tier", () => {
    const full = plateFinishFor("full");
    const lite = plateFinishFor("lite");
    expect(full.envSize).toBeGreaterThan(lite.envSize);
    expect(full.clearcoat).toBeGreaterThan(0);
  });

  it("skips the environment bake and the costly layers on the lite tier", () => {
    // The bake is the plate's biggest setup cost, and at phone size the
    // reflections barely show: phones get the emissive plate, like before.
    const lite = plateFinishFor("lite");
    expect(lite.envSize).toBe(0);
    expect(lite.clearcoat).toBe(0);
    expect(lite.iridescence).toBe(0);
  });
});
