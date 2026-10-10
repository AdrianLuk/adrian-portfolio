import { Color, Vector3 } from "three";

/** The world's palette, mirroring the @theme colours in globals.css. */
export const palette = {
  night: new Color("#0b1026"),
  dusk: new Color("#121b3a"),
  fog: new Color("#1e2b5c"),
  cyan: new Color("#3df2e6"),
  violet: new Color("#9b6cff"),
  magenta: new Color("#ff6fd8"),
  /** Neon green: the Encore's show (its lightsticks and beams) and tickets. */
  green: new Color("#7cff63"),
  /** Hong Kong's own: its landmarks' tips and their streaks in Victoria Harbour. */
  neonRed: new Color("#ff4d5e"),
  ink: new Color("#eaf2ff"),
} as const;

/** The cold moonlight every faceted surface is shaded by. */
export const MOON = new Vector3(-0.35, 0.8, -0.5).normalize();

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

/**
 * The fog's colour as every material sees it (the shaders' uniforms share
 * this one instance; the scene copies it into its own fog): the palette's
 * fog, which the Places' looks tint (see `tintFog`). Apart from
 * `palette.fog`, so the sky's horizon and the hills keep their colour.
 */
export const fogColor = palette.fog.clone();

/**
 * Tints the world's shared fog from the night's own: toward the court's
 * violet by `violet` (./court-look), then toward the Skyline's magenta by
 * `magenta` (./skyline-look). The palette's fog stays as it is.
 */
export function tintFog(violet: number, magenta = 0) {
  fogColor
    .copy(palette.fog)
    .lerp(palette.violet, violet)
    .lerp(palette.magenta, magenta);
}

export function fogUniforms() {
  return {
    uFogColor: { value: fogColor },
    uFogDensity: { value: FOG_DENSITY },
  };
}
