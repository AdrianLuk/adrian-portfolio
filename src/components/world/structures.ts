import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import type { Glow } from "./glow-points";
import type { Pool } from "./ground-pools";
import { seededRandom } from "./noise";
import { fogChunk, fogUniforms, MOON, palette } from "./palette";
import {
  corridorHalfWidth,
  valleyCentre,
  valleyHeight,
  WORLD_BACK,
} from "./terrain";

type Box = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: Color;
};

/**
 * Tower bodies: faceted and moonlit like the terrain, and lit from within
 * near the top in their own light colour, which falls off down the shaft.
 */
function bodyMaterial() {
  return new ShaderMaterial({
    uniforms: {
      ...fogUniforms(),
      uBase: { value: palette.night.clone().lerp(palette.dusk, 0.7) },
      uMoon: { value: MOON },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vLight;
      varying float vHeight;
      void main() {
        vHeight = position.y + 0.5;
        vLight = instanceColor;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase, uMoon;
      varying vec3 vWorld;
      varying vec3 vLight;
      varying float vHeight;
      ${fogChunk}
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float diffuse = max(dot(n, uMoon), 0.0);
        vec3 col = uBase * (0.55 + 1.1 * diffuse);
        col += vLight * pow(vHeight, 7.0) * 0.55;
        col = mix(col, uFogColor, fogAmount(vWorld));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * The light-structures: towers along the valley walls, lit from within and
 * carrying cyan and violet seams and rings, twin pylons marking gates further
 * out, and runway lights down the floor. Each emitter also throws a pool of
 * light onto the ground at its foot.
 */
export function createStructures() {
  const random = seededRandom(0x11ad);
  const bodies: Box[] = [];
  const bands: Box[] = [];
  const glows: Glow[] = [];
  const pools: Pool[] = [];
  const lightOf = () => (random() < 0.62 ? palette.cyan : palette.violet);

  function tower(
    x: number,
    z: number,
    height: number,
    width: number,
    facing: number,
    light: Color,
  ) {
    const ground = Math.min(
      valleyHeight(x - width, z),
      valleyHeight(x + width, z),
      valleyHeight(x, z),
    );
    const top = ground + height;
    bodies.push({
      x,
      y: ground - 2 + (height + 2) / 2,
      z,
      w: width,
      h: height + 2,
      d: width,
      color: light,
    });
    // A vertical seam of light on the face looking into the valley.
    bands.push({
      x: x + (facing * width) / 2,
      y: ground + height * 0.5,
      z,
      w: 0.16,
      h: height * 0.78,
      d: Math.max(0.4, width * 0.22),
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
    pools.push({
      x,
      y: valleyHeight(x, z),
      z,
      // Long in z: seen at a grazing angle, a round pool would read as a line.
      width: width * 6,
      depth: width * 14,
      color: light,
    });
  }

  // Towers along both walls, from just behind the plate to the far end.
  for (let i = 0; i < 46; i++) {
    const z = -110 - i * 19 - random() * 12;
    const side = i % 2 === 0 ? -1 : 1;
    const w = corridorHalfWidth(z);
    const x = valleyCentre(z) + side * (w - 6 + random() * 46);
    const height = 12 + random() * 34;
    const width = 1.6 + random() * 2.2;
    tower(x, z, height, width, -side, lightOf());
  }

  // Gates: twin pylons either side of the floor, far enough out to clear the
  // sky above the plate. No bar spans them: a line across the sky is a stroke.
  for (const [z, color] of [
    [-540, palette.cyan],
    [-800, palette.violet],
  ] as const) {
    const c = valleyCentre(z);
    const half = corridorHalfWidth(z) + 2;
    for (const side of [-1, 1]) {
      tower(c + side * half, z, 36, 2.8, -side, color);
    }
  }

  // Runway lights down the floor, either side of the line the flight follows,
  // and down the canyon it comes in by.
  const runway = [];
  for (let z = -112; z > -1100; z -= 7) runway.push(z);
  for (let z = 200; z < WORLD_BACK; z += 7) runway.push(z);
  for (const z of runway) {
    const c = valleyCentre(z);
    const far = -z > 300;
    for (const side of [-1, 1]) {
      const x = c + side * 14;
      glows.push({
        x,
        y: valleyHeight(x, z) + 0.35,
        z,
        color:
          Math.round(Math.abs(z) / 7) % 6 === 0 ? palette.violet : palette.cyan,
        size: far ? 1.6 : 1.1,
        seed: random(),
      });
    }
  }

  // The canyon the opening flight comes down (behind the settled view): towers
  // close along both walls, so they stream past either side. Last, so the
  // settled view's random draws are unchanged.
  for (let i = 0; i < 26; i++) {
    const z = 150 + i * 21 + random() * 10;
    const side = i % 2 === 0 ? -1 : 1;
    const w = corridorHalfWidth(z);
    const x = valleyCentre(z) + side * (w - 4 + random() * 22);
    tower(x, z, 14 + random() * 30, 1.6 + random() * 2, -side, lightOf());
  }

  const geometry = new BoxGeometry(1, 1, 1);
  const bodyMesh = new InstancedMesh(geometry, bodyMaterial(), bodies.length);
  const bandMesh = new InstancedMesh(
    geometry,
    new MeshBasicMaterial(),
    bands.length,
  );
  const m = new Matrix4();
  const q = new Quaternion();
  for (const [mesh, boxes] of [
    [bodyMesh, bodies],
    [bandMesh, bands],
  ] as const) {
    boxes.forEach((b, i) => {
      mesh.setMatrixAt(
        i,
        m.compose(new Vector3(b.x, b.y, b.z), q, new Vector3(b.w, b.h, b.d)),
      );
      mesh.setColorAt(i, b.color);
    });
    mesh.computeBoundingSphere();
  }

  return { meshes: [bodyMesh, bandMesh], glows, pools };
}
