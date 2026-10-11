import { PerspectiveCamera, Vector3 } from "three";
import type { Pose } from "./flight";
import { layoutHongKong } from "./hong-kong";
import { layoutLandmarks } from "./landmarks";
import { nameGlyphs } from "./name-glyphs";
import { fitWord, unitsPerPixel, type PxRect } from "./plate-fit";
import { CAMERA, settledCameraHeight, settledYaw } from "./pose";
import { createRoute, DIAMOND_STOP, SITES } from "./route";
import type { Box } from "./structures";

/**
 * For tests: what the world must keep clear on every screen shape, and a way
 * to ask whether something lands on it. The name plate as the Opening
 * settles, and each Landmark as the route frames it at its stop.
 */

type Word = { text: keyof typeof nameGlyphs.words; rect: PxRect };

/**
 * Every screen shape the world is tested for, phone first, with home's
 * headline words as the page measured them there (canvas pixels, settled,
 * Chrome with Anybody loaded).
 */
export const SCREENS = {
  phone: {
    width: 412,
    height: 896,
    words: [
      { text: "ADRIAN", rect: { left: 28.97, top: 351.39, width: 354.06, height: 60 } },
      { text: "LUK", rect: { left: 121.33, top: 404.45, width: 169.33, height: 60 } },
    ],
  },
  "narrow phone": {
    width: 360,
    height: 900,
    words: [
      { text: "ADRIAN", rect: { left: 25.31, top: 354, width: 309.38, height: 52 } },
      { text: "LUK", rect: { left: 106.02, top: 400.36, width: 147.95, height: 52 } },
    ],
  },
  "tablet, portrait": {
    width: 768,
    height: 1024,
    words: [
      { text: "ADRIAN", rect: { left: 55.7, top: 408.59, width: 424.28, height: 72 } },
      { text: "LUK", rect: { left: 509.38, top: 408.59, width: 202.91, height: 72 } },
    ],
  },
  square: {
    width: 1000,
    height: 1000,
    words: [
      { text: "ADRIAN", rect: { left: 72.55, top: 399, width: 552.44, height: 94 } },
      { text: "LUK", rect: { left: 663.23, top: 399, width: 264.2, height: 94 } },
    ],
  },
  "tablet, landscape": {
    width: 1024,
    height: 770,
    words: [
      { text: "ADRIAN", rect: { left: 74.28, top: 307, width: 565.7, height: 95 } },
      { text: "LUK", rect: { left: 679.16, top: 307, width: 270.55, height: 95 } },
    ],
  },
  desktop: {
    width: 1440,
    height: 900,
    words: [
      { text: "ADRIAN", rect: { left: 188.06, top: 359, width: 687.48, height: 116 } },
      { text: "LUK", rect: { left: 923.16, top: 359, width: 328.78, height: 116 } },
    ],
  },
  ultrawide: {
    width: 2400,
    height: 1000,
    words: [
      { text: "ADRIAN", rect: { left: 601.56, top: 398.98, width: 773.42, height: 130 } },
      { text: "LUK", rect: { left: 1428.55, top: 398.98, width: 369.88, height: 130 } },
    ],
  },
} satisfies Record<string, { width: number; height: number; words: Word[] }>;

export type Shape = keyof typeof SCREENS;

/** Each shape's width over its height. */
export const SHAPES = Object.fromEntries(
  Object.entries(SCREENS).map(([shape, { width, height }]) => [shape, width / height]),
) as Record<Shape, number>;

/** A rectangle on the screen, in NDC (x right, y up, -1 to 1 across the frame). */
export type ScreenRect = { x0: number; x1: number; y0: number; y1: number };

/** A camera at `pose`, for a screen of this shape. */
export function cameraAt(pose: Pose, aspect: number, fovY: number = CAMERA.fovY) {
  const camera = new PerspectiveCamera(fovY, aspect, 0.5, 2600);
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  camera.updateMatrixWorld();
  return camera;
}

/**
 * The screen rectangle a point or box covers for a camera at `pose`, from
 * its corners in front of the camera; null if none of it is.
 */
export function onScreen(
  pose: Pose,
  aspect: number,
  target: Vector3 | Box,
  fovY: number = CAMERA.fovY,
): ScreenRect | null {
  const camera = cameraAt(pose, aspect, fovY);
  const corners =
    target instanceof Vector3
      ? [target.clone()]
      : [-1, 1].flatMap((u) =>
          [-1, 1].flatMap((v) =>
            [-1, 1].map(
              (w) =>
                new Vector3(
                  target.x + (u * target.w) / 2,
                  target.y + (v * target.h) / 2,
                  target.z + (w * target.d) / 2,
                ),
            ),
          ),
        );
  const seen = corners.map((p) => p.project(camera)).filter((p) => p.z < 1);
  if (seen.length === 0) return null;
  const xs = seen.map((p) => p.x);
  const ys = seen.map((p) => p.y);
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  };
}

/** True if the two rectangles don't overlap. */
export function apart(a: ScreenRect, b: ScreenRect) {
  return a.x0 >= b.x1 || a.x1 <= b.x0 || a.y0 >= b.y1 || a.y1 <= b.y0;
}

/**
 * The settled view as home lays it out on this screen (as scene.ts places
 * the plate): the camera's pose, the plate's centre, home's route from there,
 * and the screen rectangle the plate's words cover.
 */
export function settledView(shape: Shape) {
  const { width, height, words } = SCREENS[shape];
  const aspect = width / height;
  const perPx = unitsPerPixel(CAMERA.fovY, CAMERA.plateDepth, height);
  const placed = words.map(({ text, rect }) => {
    const { advance } = nameGlyphs.words[text];
    return { advance, fit: fitWord(rect, advance, nameGlyphs, { width, height }, perPx) };
  });

  const yaw = settledYaw(aspect);
  const camera = new PerspectiveCamera(CAMERA.fovY, aspect, 0.5, 2600);
  camera.position.set(0, settledCameraHeight(placed, yaw), 0);
  camera.rotation.set(-CAMERA.pitch, -yaw, 0, "YXZ");
  camera.updateMatrixWorld();
  const pose: Pose = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
  };
  /** A point on the plate, in its own plane's frame (name-plate.ts). */
  const onPlate = (x: number, y: number) =>
    camera.localToWorld(new Vector3(x, y, -CAMERA.plateDepth));

  const { ascender, descender, capHeight } = nameGlyphs;
  const left = Math.min(...placed.map((p) => p.fit.x));
  const right = Math.max(...placed.map((p) => p.fit.x + p.advance * p.fit.scale));
  const base = Math.min(...placed.map((p) => p.fit.y));
  const capTop = Math.max(...placed.map((p) => p.fit.y + capHeight * p.fit.scale));
  // Each word's line box, as the DOM's.
  const bottom = Math.min(...placed.map((p) => p.fit.y + descender * p.fit.scale));
  const top = Math.max(...placed.map((p) => p.fit.y + ascender * p.fit.scale));
  const box = [onPlate(left, bottom), onPlate(right, top)];
  const ends = box.map((p) => p.project(camera));

  const plateCentre = onPlate((left + right) / 2, (base + capTop) / 2);
  return {
    aspect,
    pose,
    plateCentre,
    route: createRoute(pose, plateCentre, aspect),
    plate: {
      x0: Math.min(ends[0].x, ends[1].x),
      x1: Math.max(ends[0].x, ends[1].x),
      y0: Math.min(ends[0].y, ends[1].y),
      y1: Math.max(ends[0].y, ends[1].y),
    } satisfies ScreenRect,
  };
}

/** Something the world keeps clear: where it covers the screen, seen from `pose`. */
export type KeepClear = {
  name: string;
  /** The route's stop it is seen from (0, the settled view). */
  stop: number;
  pose: Pose;
  aspect: number;
  rect: ScreenRect;
};

/**
 * Everything the world keeps clear on this screen: the name plate in the
 * settled view, each Lit site's Landmark and the Diamond at their stops,
 * and each of Hong Kong's Landmarks at its stop.
 */
export function keepClear(shape: Shape): KeepClear[] {
  const { aspect, pose, plate, route } = settledView(shape);
  const landmarks = layoutLandmarks();
  const hongKong = layoutHongKong();
  const framed = [
    ...SITES.map((site, i) => ({ name: site.highlight, stop: i + 1, box: landmarks.bounds[i] })),
    { name: "Diamond", stop: DIAMOND_STOP, box: landmarks.diamond },
    // Hong Kong's Landmarks are the first of its bounds, in order.
    ...hongKong.landmarks.map((l, i) => ({
      name: l.name,
      stop: DIAMOND_STOP + 1,
      box: hongKong.bounds[i],
    })),
  ];
  return [
    { name: "name plate", stop: 0, pose, aspect, rect: plate },
    ...framed.flatMap(({ name, stop, box }) => {
      const at = route.poseAt(stop);
      const rect = onScreen(at, aspect, box);
      return rect ? [{ name, stop, pose: at, aspect, rect }] : [];
    }),
  ];
}

/** True if a point or box, seen from the area's pose, covers any of it. */
export function landsIn(target: Vector3 | Box, area: KeepClear) {
  const rect = onScreen(area.pose, area.aspect, target);
  return rect !== null && !apart(rect, area.rect);
}
