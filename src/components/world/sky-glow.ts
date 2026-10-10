import { type Color, Vector3 } from "three";
import { diamondMiddle } from "./diamond";
import { palette } from "./palette";
import { arenaFrame } from "./terrain";

/**
 * A Sky glow: a stadium's light in the haze over the ridge, seen from far
 * down the valley (#139). Drawn on the sky, so the valley's walls and the
 * towers hide all of it but what shows over them. `at` is the light's heart,
 * high in the haze over the stadium (high enough to clear Toronto's skyline
 * from the hero), and `reach` how far round it the haze is lit (world units).
 */
export type SkyGlow = { at: Vector3; color: Color; reach: number };

const diamond = diamondMiddle();
const arena = arenaFrame();

/** The Diamond's floodlights, and the Arena's violet lightsticks. */
export const SKY_GLOWS: readonly SkyGlow[] = [
  { at: new Vector3(diamond.x, 70, diamond.z), color: palette.ink, reach: 120 },
  { at: new Vector3(arena.x, 90, arena.z), color: palette.violet, reach: 140 },
];

/**
 * Closer than `near` a glow is gone, the stadium's own lights in its place;
 * full past `far`. At the court, the Diamond's is all but gone, so it doesn't
 * flood the court's sky.
 */
export const SKY_GLOW_FADE = { near: 300, far: 700 } as const;

/** How strongly `glow` lights the haze seen from `eye`: 0 up close to 1 far off. */
export function skyGlowStrength(glow: SkyGlow, eye: Vector3) {
  const { near, far } = SKY_GLOW_FADE;
  const t = Math.min(1, Math.max(0, (eye.distanceTo(glow.at) - near) / (far - near)));
  return t * t * (3 - 2 * t);
}

/**
 * A glow's light across the sky: `exp(-falloff·(a/reach)²)` at an angle `a`
 * off its heart, where `reach` is the angle its `reach` spans. Past `seen`
 * of that angle it is too faint to count as seen.
 */
export const SKY_GLOW_SHAPE = { falloff: 2.5, seen: 0.6 } as const;

/** How bright a glow is at its heart, at full strength. */
export const SKY_GLOW_BRIGHTNESS = 0.6;
