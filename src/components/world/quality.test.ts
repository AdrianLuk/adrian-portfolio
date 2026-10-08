import { describe, expect, it, vi } from "vitest";
import {
  drawsInSoftware,
  holdsFrame,
  moteCountFor,
  pixelRatioFor,
  precipitationCountFor,
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

describe("precipitationCountFor", () => {
  it("scales snow and rain with the canvas, so phones draw fewer", () => {
    for (const weather of ["snow", "rain"] as const) {
      expect(precipitationCountFor(weather, 390, 760)).toBeLessThan(
        precipitationCountFor(weather, 1440, 820),
      );
    }
  });

  it("stays within a floor and a ceiling", () => {
    expect(precipitationCountFor("snow", 200, 200)).toBe(800);
    expect(precipitationCountFor("snow", 7680, 4320)).toBe(1800);
    expect(precipitationCountFor("rain", 200, 200)).toBe(1100);
    expect(precipitationCountFor("rain", 7680, 4320)).toBe(2400);
  });

  it("draws nothing under a clear sky", () => {
    expect(precipitationCountFor("clear", 1440, 820)).toBe(0);
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

  it("rounds the letters' curves and chamfer finer on the full tier", () => {
    // The camera ends close on the plate, where the lite counts facet.
    const full = plateFinishFor("full");
    const lite = plateFinishFor("lite");
    expect(full.curveSegments).toBeGreaterThanOrEqual(2 * lite.curveSegments);
    expect(full.bevelSegments).toBeGreaterThan(lite.bevelSegments);
  });

  it("keeps the lite tier's cheaper counts", () => {
    expect(plateFinishFor("lite")).toMatchObject({
      curveSegments: 6,
      bevelSegments: 3,
    });
  });
});

describe("which renderers draw in software", () => {
  it("knows SwiftShader, llvmpipe and the like by name", () => {
    for (const name of [
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
      "Google SwiftShader",
      "llvmpipe (LLVM 15.0.7, 256 bits)",
      "softpipe",
      "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)",
    ]) {
      expect(drawsInSoftware(name, () => false), name).toBe(true);
    }
  });

  it("takes a real GPU at its name, whatever the caveat says", () => {
    for (const name of [
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 (0x00002206) Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)",
      "Adreno (TM) 740",
      "Mali-G78 MP20",
    ]) {
      expect(drawsInSoftware(name, () => true), name).toBe(false);
    }
  });

  it("asks about the performance caveat only where the name is masked", () => {
    const asked = vi.fn(() => true);
    drawsInSoftware("llvmpipe (LLVM 15.0.7, 256 bits)", asked);
    drawsInSoftware("Adreno (TM) 740", asked);
    expect(asked).not.toHaveBeenCalled();
    for (const name of [null, "", "WebKit WebGL", "Apple GPU"]) {
      expect(drawsInSoftware(name, () => true)).toBe(true);
      expect(drawsInSoftware(name, () => false)).toBe(false);
    }
  });
});

describe("when the court holds its last frame", () => {
  const live = { software: true, sceneInView: true, flying: false, drawn: true };

  it("holds on a software renderer while the pinned Player tools scene is in view", () => {
    expect(holdsFrame(live)).toBe(true);
  });

  it("never holds on a real GPU", () => {
    expect(holdsFrame({ ...live, software: false })).toBe(false);
  });

  it("draws on once the scene is out of view", () => {
    expect(holdsFrame({ ...live, sceneInView: false })).toBe(false);
  });

  it("never holds a camera in flight, nor before the first frame", () => {
    expect(holdsFrame({ ...live, flying: true })).toBe(false);
    expect(holdsFrame({ ...live, drawn: false })).toBe(false);
  });
});
