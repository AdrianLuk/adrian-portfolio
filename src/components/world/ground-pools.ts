import {
  AdditiveBlending,
  Color,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import { fogChunk, fogUniforms } from "./palette";

export type Pool = {
  x: number;
  y: number;
  z: number;
  /** Footprint along x and z, in world units. */
  width: number;
  depth: number;
  color: Color;
};

const flat = new Quaternion();

/**
 * Light falling on the ground: soft additive ellipses lying on the terrain
 * under each emitter (tower bases, the beams, the plate's edge), so the light
 * reaches the world instead of stopping at the object that makes it.
 */
export function createGroundPools(capacity: number, intensity = 1) {
  const geometry = new PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { ...fogUniforms(), uIntensity: { value: intensity } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vFog;
      ${fogChunk}
      void main() {
        vUv = uv;
        vColor = instanceColor;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vFog = fogAmount(world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vFog;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float light = pow(max(1.0 - d, 0.0), 2.2);
        gl_FragColor = vec4(vColor * light * uIntensity * (1.0 - vFog), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new InstancedMesh(geometry, material, capacity);
  // Create the colour attribute now: the shader reads it from its first compile.
  mesh.setColorAt(0, new Color(0, 0, 0));
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  const m = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  return {
    mesh,
    /** Replaces every pool. Each sits just above the ground to avoid z-fighting. */
    set(pools: readonly Pool[]) {
      pools.slice(0, capacity).forEach((p, i) => {
        position.set(p.x, p.y + 0.12, p.z);
        scale.set(p.width, 1, p.depth);
        mesh.setMatrixAt(i, m.compose(position, flat, scale));
        mesh.setColorAt(i, p.color);
      });
      mesh.count = Math.min(pools.length, capacity);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
