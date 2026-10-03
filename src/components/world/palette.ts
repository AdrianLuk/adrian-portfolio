import { Color } from "three";

/** The world's palette, mirroring the @theme colours in globals.css. */
export const palette = {
  night: new Color("#0b1026"),
  dusk: new Color("#121b3a"),
  fog: new Color("#1e2b5c"),
  cyan: new Color("#3df2e6"),
  violet: new Color("#9b6cff"),
  magenta: new Color("#ff6fd8"),
  ink: new Color("#eaf2ff"),
} as const;

/** Exponential-squared fog density shared by every material, built-in or not. */
export const FOG_DENSITY = 0.0021;

/**
 * Fog for the hand-written shaders: distance fog plus a ground-hugging layer
 * that pools in the valley. Expects `cameraPosition` (three provides it).
 */
export const fogChunk = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  float fogAmount(vec3 worldPos) {
    float d = distance(worldPos, cameraPosition);
    float f = 1.0 - exp(-pow(d * uFogDensity, 2.0));
    float ground = exp(-max(worldPos.y, 0.0) * 0.07) * (1.0 - exp(-d * 0.004));
    return clamp(f + ground * 0.5, 0.0, 1.0);
  }
`;

export function fogUniforms() {
  return {
    uFogColor: { value: palette.fog },
    uFogDensity: { value: FOG_DENSITY },
  };
}
