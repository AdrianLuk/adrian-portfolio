import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { Glow } from "./glow-points";
import { seededRandom } from "./noise";
import { palette } from "./palette";
import { corridorHalfWidth, valleyCentre, valleyHeight } from "./terrain";

type Box = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color?: Color;
};

/**
 * The light-structures: dark towers along the valley walls carrying cyan and
 * violet light bands, gates of light spanning the valley further out, and
 * runway lights down the floor. Every glow comes from an emissive band or a
 * light sprite; nothing is outlined.
 */
export function createStructures() {
  const random = seededRandom(0x11ad);
  const bodies: Box[] = [];
  const bands: Box[] = [];
  const glows: Glow[] = [];
  const lightOf = () => (random() < 0.62 ? palette.cyan : palette.violet);

  function tower(
    x: number,
    z: number,
    height: number,
    width: number,
    facing: number,
  ) {
    const ground = Math.min(
      valleyHeight(x - width, z),
      valleyHeight(x + width, z),
      valleyHeight(x, z),
    );
    const top = ground + height;
    const light = lightOf();
    bodies.push({
      x,
      y: ground - 2 + (height + 2) / 2,
      z,
      w: width,
      h: height + 2,
      d: width,
    });
    // A vertical seam of light on the face looking into the valley.
    bands.push({
      x: x + (facing * width) / 2,
      y: ground + height * 0.45,
      z,
      w: 0.16,
      h: height * 0.7,
      d: width * 0.18,
      color: light,
    });
    // Rings of light near the top.
    const rings = 1 + Math.floor(random() * 3);
    for (let r = 0; r < rings; r++) {
      bands.push({
        x,
        y: top - 1.2 - r * (1.4 + random() * 1.6),
        z,
        w: width + 0.22,
        h: 0.28,
        d: width + 0.22,
        color: light,
      });
    }
    glows.push({
      x,
      y: top + 0.9,
      z,
      color: light,
      size: 3.2 + random() * 2.5,
      seed: random(),
    });
  }

  // Towers along both walls, from just behind the plate to the far end.
  for (let i = 0; i < 46; i++) {
    const z = -110 - i * 19 - random() * 12;
    const side = i % 2 === 0 ? -1 : 1;
    const w = corridorHalfWidth(z);
    const x = valleyCentre(z) + side * (w - 6 + random() * 46);
    tower(x, z, 12 + random() * 34, 1.6 + random() * 2.2, -side);
  }

  // Gates spanning the valley: two pylons and a bar of light between them.
  for (const [z, color] of [
    [-300, palette.violet],
    [-540, palette.cyan],
    [-800, palette.violet],
  ] as const) {
    const c = valleyCentre(z);
    const half = corridorHalfWidth(z) + 2;
    const ground = valleyHeight(c, z);
    const height = 30;
    for (const side of [-1, 1]) {
      const x = c + side * half;
      const base = valleyHeight(x, z);
      const h = ground + height - base + 3;
      bodies.push({
        x,
        y: base - 2 + (h + 2) / 2,
        z,
        w: 2.6,
        h: h + 2,
        d: 2.6,
      });
      glows.push({
        x,
        y: ground + height + 4.5,
        z,
        color,
        size: 6,
        seed: random(),
      });
    }
    bands.push({
      x: c,
      y: ground + height,
      z,
      w: half * 2,
      h: 0.55,
      d: 0.55,
      color,
    });
    bands.push({
      x: c,
      y: ground + height - 2.2,
      z,
      w: half * 2,
      h: 0.18,
      d: 0.3,
      color,
    });
  }

  // Runway lights down the floor, either side of the line the flight follows.
  for (let z = -112; z > -1100; z -= 7) {
    const c = valleyCentre(z);
    const far = -z > 300;
    for (const side of [-1, 1]) {
      const x = c + side * 14;
      glows.push({
        x,
        y: valleyHeight(x, z) + 0.35,
        z,
        color: Math.round(-z / 7) % 6 === 0 ? palette.violet : palette.cyan,
        size: far ? 1.6 : 1.1,
        seed: random(),
      });
    }
  }

  const geometry = new BoxGeometry(1, 1, 1);
  const bodyMesh = new InstancedMesh(
    geometry,
    new MeshBasicMaterial({
      color: palette.night.clone().lerp(palette.dusk, 0.5),
    }),
    bodies.length,
  );
  const bandMesh = new InstancedMesh(
    geometry,
    new MeshBasicMaterial(),
    bands.length,
  );
  const m = new Matrix4();
  const q = new Quaternion();
  bodies.forEach((b, i) => {
    bodyMesh.setMatrixAt(
      i,
      m.compose(new Vector3(b.x, b.y, b.z), q, new Vector3(b.w, b.h, b.d)),
    );
  });
  bands.forEach((b, i) => {
    bandMesh.setMatrixAt(
      i,
      m.compose(new Vector3(b.x, b.y, b.z), q, new Vector3(b.w, b.h, b.d)),
    );
    bandMesh.setColorAt(i, b.color ?? palette.cyan);
  });
  bodyMesh.computeBoundingSphere();
  bandMesh.computeBoundingSphere();

  return { meshes: [bodyMesh, bandMesh], glows };
}
