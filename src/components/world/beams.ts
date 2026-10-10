import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  ShaderMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Beam } from "./arena";
import { fogChunk, fogUniforms } from "./palette";
import type { SharedUniforms } from "./shared";

/** How wide a beam is at its apex, on the truss, in world units. */
const APEX = 0.35;

/**
 * Light beams, in one additive draw: translucent cones of light, brightest
 * along their middles and fading up their length into the night, each
 * sweeping slowly about its aim off the world's clock (so still when the
 * world is, under reduced motion). Its brightness changes only as the show
 * comes on and goes off: nothing flashes. Off, it draws nothing.
 */
export function createBeams(
  beams: readonly Beam[],
  /** The Arena's turn (./arena): beams' headings are in its frame. */
  turn: number,
  shared: SharedUniforms,
) {
  const geometry = mergeGeometries(
    beams.map((b) => {
      // A unit cone, its apex at the origin and its mouth a unit up.
      const g = new CylinderGeometry(1, APEX / b.radius, 1, 32, 1, true)
        .translate(0, 0.5, 0)
        .toNonIndexed();
      g.deleteAttribute("uv");
      const n = g.getAttribute("position").count;
      const each = (v: number[]) =>
        new Float32BufferAttribute(
          Array.from({ length: n }, () => v).flat(),
          v.length,
        );
      g.setAttribute("aApex", each([...b.from]));
      g.setAttribute("aShape", each([b.radius, b.length]));
      g.setAttribute("aAim", each([b.heading, b.tilt, b.phase]));
      g.setAttribute("aLight", each(b.color.toArray()));
      return g;
    }),
  );
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: {
      uTime: shared.uTime,
      uTurn: { value: turn },
      uIntensity: { value: 0 },
      ...fogUniforms(),
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uTurn;
      attribute vec3 aApex;
      attribute vec2 aShape;
      attribute vec3 aAim;
      attribute vec3 aLight;
      varying vec3 vLight;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vWorld;
      // Turning +y toward +z, and (as the Arena's frame turns) +z toward +x.
      mat3 tilt(float a) { float c = cos(a), s = sin(a); return mat3(1, 0, 0, 0, c, s, 0, -s, c); }
      mat3 yaw(float a) { float c = cos(a), s = sin(a); return mat3(c, 0, -s, 0, 1, 0, s, 0, c); }
      void main() {
        // The show's slow sweep: about a quarter-minute a pass.
        float heading = aAim.x + 0.35 * sin(uTime * 0.4 + aAim.z);
        float lean = aAim.y + 0.12 * sin(uTime * 0.31 + aAim.z * 1.3);
        mat3 aim = yaw(uTurn) * yaw(heading) * tilt(lean);
        vec3 local = vec3(position.x * aShape.x, position.y * aShape.y, position.z * aShape.x);
        vec4 world = modelMatrix * vec4(aApex + aim * local, 1.0);
        vWorld = world.xyz;
        vNormal = aim * normal;
        vAlong = position.y;
        vLight = aLight;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying vec3 vLight;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vWorld;
      ${fogChunk}
      void main() {
        vec3 view = normalize(cameraPosition - vWorld);
        // Brightest through its middle, where the eye looks through the most light.
        float core = pow(abs(dot(normalize(vNormal), view)), 3.0);
        float fade = pow(1.0 - vAlong, 1.8);
        float light = uIntensity * 0.22 * core * fade * (1.0 - fogAmount(vWorld));
        gl_FragColor = vec4(vLight * light, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  return {
    mesh,
    /** How far the show is on, 0 to 1: none hides them. */
    setIntensity(value: number) {
      material.uniforms.uIntensity.value = value;
      mesh.visible = value > 0;
    },
  };
}
