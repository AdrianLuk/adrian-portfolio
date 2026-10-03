import {
  BackSide,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  type WebGLRenderer,
} from "three";
import { palette } from "./palette";

type Card = {
  /** Degrees around the vertical, 0 = ahead (-z), 180 = behind the camera. */
  azimuth: number;
  /** Degrees above the horizon. */
  elevation: number;
  width: number;
  height: number;
  color: Color;
  /** Above 1 for HDR highlights in the half-float PMREM. */
  intensity: number;
};

/**
 * What the plate reflects, as cards of light standing around it. The front
 * faces look back at the camera, so most of the light stands behind it.
 */
const cards: Card[] = [
  // Behind the camera: the long strips that sweep across the faces.
  {
    azimuth: 180,
    elevation: 18,
    width: 34,
    height: 2.2,
    color: palette.ink,
    intensity: 2.2,
  },
  {
    azimuth: 150,
    elevation: 8,
    width: 6,
    height: 26,
    color: palette.cyan,
    intensity: 2.4,
  },
  {
    azimuth: 214,
    elevation: 10,
    width: 5,
    height: 22,
    color: palette.violet,
    intensity: 2.6,
  },
  {
    azimuth: 196,
    elevation: 34,
    width: 22,
    height: 1.4,
    color: palette.magenta,
    intensity: 1.6,
  },
  {
    azimuth: 128,
    elevation: 4,
    width: 3,
    height: 14,
    color: palette.violet,
    intensity: 2,
  },
  {
    azimuth: 236,
    elevation: 3,
    width: 3,
    height: 12,
    color: palette.cyan,
    intensity: 2,
  },
  // Overhead: a soft pale panel, so the cap tops and the clearcoat catch the sky.
  {
    azimuth: 180,
    elevation: 70,
    width: 40,
    height: 18,
    color: palette.ink,
    intensity: 0.6,
  },
  // Either side, for the letters' flanks.
  {
    azimuth: 90,
    elevation: 12,
    width: 4,
    height: 30,
    color: palette.cyan,
    intensity: 2,
  },
  {
    azimuth: 270,
    elevation: 12,
    width: 4,
    height: 30,
    color: palette.violet,
    intensity: 2,
  },
  // Ahead, low: the valley's light-structures.
  {
    azimuth: -18,
    elevation: 2,
    width: 2,
    height: 10,
    color: palette.cyan,
    intensity: 1.6,
  },
  {
    azimuth: 22,
    elevation: 2,
    width: 2,
    height: 12,
    color: palette.violet,
    intensity: 1.6,
  },
];

function buildScene() {
  const scene = new Scene();
  scene.add(
    new Mesh(
      new SphereGeometry(60, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: {
          uZenith: { value: palette.night },
          uHorizon: { value: palette.fog },
          uGround: { value: palette.night.clone().lerp(palette.dusk, 0.5) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uZenith, uHorizon, uGround;
          varying vec3 vDir;
          void main() {
            float h = normalize(vDir).y;
            vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.6, h));
            gl_FragColor = vec4(h < 0.0 ? mix(uHorizon, uGround, smoothstep(0.0, -0.25, h)) : sky, 1.0);
          }
        `,
      }),
    ),
  );

  const geometry = new PlaneGeometry(1, 1);
  const distance = 40;
  for (const c of cards) {
    const az = (c.azimuth * Math.PI) / 180;
    const el = (c.elevation * Math.PI) / 180;
    const card = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color: c.color.clone().multiplyScalar(c.intensity),
        side: DoubleSide,
      }),
    );
    card.position.set(
      Math.sin(az) * Math.cos(el) * distance,
      Math.sin(el) * distance,
      -Math.cos(az) * Math.cos(el) * distance,
    );
    card.scale.set(c.width, c.height, 1);
    card.lookAt(0, 0, 0);
    scene.add(card);
  }
  return scene;
}

/**
 * Bakes the plate's environment once, procedurally (no image files): a night
 * sky in the world's palette with cards of cyan, violet, magenta and pale light
 * standing in for the light-structures. Only the plate's materials use it; the
 * scene's own environment stays unset, so the rest of the world is unchanged.
 */
export function bakePlateEnvironment(renderer: WebGLRenderer, size: number) {
  const generator = new PMREMGenerator(renderer);
  const scene = buildScene();
  const target = generator.fromScene(scene, 0.015, 0.1, 100, { size });
  scene.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      (object.material as MeshBasicMaterial).dispose();
    }
  });
  return {
    texture: target.texture,
    dispose() {
      target.dispose();
      generator.dispose();
    },
  };
}
