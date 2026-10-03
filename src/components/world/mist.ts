import { DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from "three";
import { fogChunk, fogUniforms, palette } from "./palette";
import type { SharedUniforms } from "./shared";
import { WORLD_BACK } from "./terrain";

/**
 * Two drifting sheets of ground mist over the valley floor: fractal noise,
 * thin near the camera, so the fog reads as volume rather than a tint.
 */
export function createMist(shared: SharedUniforms) {
  const layers = [
    { y: 0.9, opacity: 0.28, scale: 0.018, speed: 0.5 },
    { y: 4.5, opacity: 0.12, scale: 0.011, speed: -0.32 },
  ];
  return layers.map(({ y, opacity, scale, speed }) => {
    // From the opening flight's start (+z) to the far end of the valley.
    const far = -1160;
    const geometry = new PlaneGeometry(1100, WORLD_BACK - far);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, y, (WORLD_BACK + far) / 2);
    const mesh = new Mesh(
      geometry,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: {
          ...shared,
          ...fogUniforms(),
          uTint: { value: palette.fog.clone().lerp(palette.violet, 0.18) },
          uOpacity: { value: opacity },
          uScale: { value: scale },
          uSpeed: { value: speed },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime, uOpacity, uScale, uSpeed;
          uniform vec3 uTint;
          varying vec3 vWorld;
          ${fogChunk}
          float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
          }
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i), b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }
          void main() {
            vec2 p = vWorld.xz * uScale + vec2(uTime * 0.02 * uSpeed, uTime * 0.013);
            float n = noise(p) * 0.55 + noise(p * 2.07 + 3.1) * 0.3 + noise(p * 4.3 - 1.7) * 0.15;
            float density = smoothstep(0.35, 0.85, n);
            float dist = distance(vWorld, cameraPosition);
            float fadeNear = smoothstep(4.0, 30.0, dist);
            float fadeFar = 1.0 - fogAmount(vWorld) * 0.7;
            gl_FragColor = vec4(uTint, density * uOpacity * fadeNear * fadeFar);
            #include <colorspace_fragment>
          }
        `,
      }),
    );
    mesh.renderOrder = 2;
    return mesh;
  });
}
