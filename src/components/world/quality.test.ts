import { describe, expect, it } from "vitest";
import { moteCountFor, pixelRatioFor } from "./quality";

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
