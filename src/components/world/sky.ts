import {
  BackSide,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { seededRandom } from "./noise";
import { palette } from "./palette";
import { RIPPLE, type Ring } from "./ripples";
import type { SharedUniforms } from "./shared";

const RADIUS = 1500;

/** How far a ripple spreads across the sky, in radians. */
const RIPPLE_REACH = 0.32;

/**
 * The sky: an indigo dome (never black) brightening to fog at the horizon, a
 * violet glow low over the far end of the valley, and a thin field of stars.
 * Both follow the camera, so the sky stays at infinity. A tap on it lights
 * the haze from that direction, violet through drifts of cloud, a ring of
 * cyan spreading out from it (see ./ripples).
 */
export function createSky(shared: SharedUniforms) {
  const dome = new Mesh(
    new SphereGeometry(RADIUS, 32, 16),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: palette.night },
        uMid: { value: palette.dusk },
        uHorizon: { value: palette.fog },
        uViolet: { value: palette.violet },
        uCyan: { value: palette.cyan },
        // Each ripple's direction, and its radius (radians) and brightness.
        uRingDirs: {
          value: Array.from({ length: RIPPLE.rings }, () => new Vector3(0, 1, 0)),
        },
        uRings: {
          value: Array.from({ length: RIPPLE.rings }, () => new Vector2()),
        },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith, uMid, uHorizon, uViolet, uCyan;
        uniform vec3 uRingDirs[${RIPPLE.rings}];
        uniform vec2 uRings[${RIPPLE.rings}];
        varying vec3 vDir;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        void main() {
          vec3 dir = normalize(vDir);
          float h = dir.y;
          vec3 col = mix(uHorizon, uMid, smoothstep(-0.03, 0.16, h));
          col = mix(col, uZenith, smoothstep(0.16, 0.7, h));
          float ahead = max(0.0, -dir.z);
          col += uViolet * 0.16 * exp(-abs(h - 0.015) * 11.0) * pow(ahead, 4.0);
          col += uCyan * 0.05 * exp(-abs(h) * 32.0) * pow(ahead, 10.0);
          // A far range beyond the valley, half lost in the haze.
          float az = atan(dir.x, -dir.z);
          float ridge = 0.035 + 0.03 * sin(az * 3.0 + 1.1) + 0.018 * sin(az * 7.3 + 0.4)
            + 0.009 * sin(az * 17.0 + 2.3);
          float range = 1.0 - smoothstep(ridge - 0.004, ridge + 0.004, h);
          col = mix(col, mix(uHorizon, uMid, 0.55), range * 0.75);

          // Ripples: the haze lit violet round each, broken into drifts of
          // cloud, under a ring of cyan. Skipped whole while none is lit.
          float lit = 0.0;
          for (int i = 0; i < ${RIPPLE.rings}; i++) lit += uRings[i].y;
          if (lit > 0.0) {
            vec2 drift = dir.xz / (abs(h) + 0.3) * 2.5;
            float cloud = 0.25 + 0.75 * smoothstep(0.3, 0.75, 0.65 * noise(drift) + 0.35 * noise(drift * 2.3 + 7.0));
            for (int i = 0; i < ${RIPPLE.rings}; i++) {
              vec2 ring = uRings[i];
              float a = acos(clamp(dot(dir, uRingDirs[i]), -1.0, 1.0));
              float band = 1.0 - smoothstep(0.0, 0.018, abs(a - ring.x));
              float glow = exp(-a * a / (0.01 + 0.5 * ring.x * ring.x));
              col += ring.y * (uCyan * band * 0.9 + uViolet * glow * cloud * 0.7);
            }
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  dome.renderOrder = -2;

  const random = seededRandom(0x5eed);
  const count = 520;
  const positions: number[] = [];
  const seeds: number[] = [];
  for (let i = 0; i < count; i++) {
    // Uniform over the upper sky, thinning towards the horizon haze.
    const y = 0.06 + Math.pow(random(), 0.8) * 0.94;
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    positions.push(
      Math.cos(a) * r * (RADIUS - 20),
      y * (RADIUS - 20),
      Math.sin(a) * r * (RADIUS - 20),
    );
    seeds.push(random());
  }
  const starGeometry = new BufferGeometry();
  starGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(positions, 3),
  );
  starGeometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1));
  const stars = new Points(
    starGeometry,
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        ...shared,
        uInk: { value: palette.ink },
        uCyan: { value: palette.cyan },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying float vSeed;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float twinkle = 0.75 + 0.25 * sin(uTime * (0.6 + aSeed) + aSeed * 50.0);
          vAlpha = (0.2 + 0.6 * aSeed * aSeed) * twinkle * smoothstep(0.04, 0.25, normalize(position).y);
          vSeed = aSeed;
          gl_PointSize = (1.0 + 2.2 * aSeed * aSeed) * uPixelRatio;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uInk, uCyan;
        varying float vAlpha;
        varying float vSeed;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d) * vAlpha;
          gl_FragColor = vec4(mix(uInk, uCyan, step(0.82, vSeed) * 0.6), a);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  stars.renderOrder = -1;
  stars.frustumCulled = false;

  return {
    objects: [dome, stars],
    /** Keeps the sky centred on the camera. */
    follow(x: number, y: number, z: number) {
      dome.position.set(x, y, z);
      stars.position.set(x, y, z);
    },
    /** Lights `rings`, each from its direction, and leaves the rest unlit. */
    setRings(rings: readonly Ring<Vector3>[]) {
      const { uRingDirs, uRings } = (dome.material as ShaderMaterial).uniforms;
      uRings.value.forEach((slot: Vector2, i: number) => {
        const ring = rings[i];
        if (!ring) return slot.setY(0);
        uRingDirs.value[i].copy(ring.at);
        slot.set(ring.spread * RIPPLE_REACH, ring.strength);
      });
    },
  };
}
