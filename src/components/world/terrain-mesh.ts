import { Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from "three";
import { fogChunk, fogUniforms, palette } from "./palette";
import { valleyHeight } from "./terrain";

const WIDTH = 1100;
const DEPTH = 1400;
const NEAR_Z = 80;

/**
 * The valley as a low-poly mesh: faceted (flat-shaded from screen-space
 * derivatives), lit by a cold moon, with faint contour lines tracing the ridges
 * in cyan and violet, all sinking into the shader fog.
 */
export function createTerrain() {
  const geometry = new PlaneGeometry(WIDTH, DEPTH, 150, 200);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, NEAR_Z - DEPTH / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    position.setY(i, valleyHeight(position.getX(i), position.getZ(i)));
  }
  geometry.computeBoundingSphere();

  const material = new ShaderMaterial({
    uniforms: {
      ...fogUniforms(),
      uLow: { value: palette.night.clone().lerp(palette.dusk, 0.6) },
      uHigh: { value: palette.fog },
      uCyan: { value: palette.cyan },
      uViolet: { value: palette.violet },
      uMoon: { value: new Vector3(-0.35, 0.8, -0.5).normalize() },
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
      uniform vec3 uLow, uHigh, uCyan, uViolet, uMoon;
      varying vec3 vWorld;
      ${fogChunk}
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float diffuse = max(dot(n, uMoon), 0.0);
        float height = clamp(vWorld.y / 60.0, 0.0, 1.0);
        vec3 col = mix(uLow, uHigh, height) * (0.5 + 0.85 * diffuse);

        // Contour lines on the walls: the lit ridges.
        float h = vWorld.y / 3.5;
        float fw = fwidth(h);
        float line = 1.0 - min(abs(fract(h - 0.5) - 0.5) / max(fw, 1e-4), 1.0);
        line *= smoothstep(2.0, 9.0, vWorld.y) * (1.0 - smoothstep(0.25, 0.7, fw));
        vec3 lineColor = mix(uCyan, uViolet, smoothstep(10.0, 45.0, vWorld.y));
        col += lineColor * line * 0.32;

        // Crests catch the violet sky.
        col += uViolet * 0.12 * smoothstep(0.55, 0.95, n.y) * smoothstep(28.0, 55.0, vWorld.y);

        col = mix(col, uFogColor, fogAmount(vWorld));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  return new Mesh(geometry, material);
}
