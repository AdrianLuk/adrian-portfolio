import { Mesh, PlaneGeometry, ShaderMaterial } from "three";
import { fogChunk, fogUniforms, MOON, palette } from "./palette";
import { valleyHeight, WORLD_BACK, WORLD_FRONT } from "./terrain";
import type { Weather } from "./weather";

const WIDTH = 1100;
/** From behind the opening flight's start (+z) to the far end of the valley. */
const DEPTH = WORLD_BACK - WORLD_FRONT;
const NEAR_Z = WORLD_BACK;

/**
 * The valley as a low-poly mesh: faceted (flat-shaded from screen-space
 * derivatives), lit by a cold moon, its crests catching violet sky and faint
 * contour lines gathering towards them, all sinking into the shader fog.
 * The weather leaves its mark, still even under reduced motion: snow settles
 * on the flatter facets, and rain darkens the ground and wets the valley
 * floor into a sheen of the sky.
 */
export function createTerrain(weather: Weather = "clear") {
  // A facet about every 7 units down the valley.
  const geometry = new PlaneGeometry(WIDTH, DEPTH, 150, Math.round(DEPTH / 7));
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
      uMoon: { value: MOON },
      uSnow: { value: weather === "snow" ? 1 : 0 },
      uSnowColor: { value: palette.ink.clone().lerp(palette.violet, 0.45) },
      uWet: { value: weather === "rain" ? 1 : 0 },
      uSheen: { value: palette.fog.clone().lerp(palette.violet, 0.35) },
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
      uniform vec3 uLow, uHigh, uCyan, uViolet, uMoon, uSnowColor, uSheen;
      uniform float uSnow, uWet;
      varying vec3 vWorld;
      ${fogChunk}
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float diffuse = max(dot(n, uMoon), 0.0);
        float height = clamp(vWorld.y / 60.0, 0.0, 1.0);
        vec3 col = mix(uLow, uHigh, height) * (0.5 + 0.85 * diffuse);

        // Snow settles where the ground is flat enough to hold it.
        float settled = uSnow * smoothstep(0.5, 0.85, n.y);
        col = mix(col, uSnowColor * (0.05 + 0.15 * diffuse), settled * 0.85);

        // Rain darkens the ground, and the floor mirrors the sky at a glance.
        col *= 1.0 - 0.25 * uWet;
        vec3 toCamera = normalize(cameraPosition - vWorld);
        float glance = pow(1.0 - max(dot(n, toCamera), 0.0), 3.0);
        float floorWet = uWet * smoothstep(0.85, 0.97, n.y) * (1.0 - smoothstep(3.0, 16.0, vWorld.y));
        col += uSheen * glance * floorWet * 0.7;

        // Contour lines, gathering towards the crests: the lit ridges.
        float h = vWorld.y / 7.0;
        float fw = fwidth(h);
        float line = 1.0 - min(abs(fract(h - 0.5) - 0.5) / max(fw, 1e-4), 1.0);
        line *= smoothstep(25.0, 50.0, vWorld.y) * (1.0 - smoothstep(0.25, 0.7, fw));
        vec3 lineColor = mix(uCyan, uViolet, smoothstep(10.0, 45.0, vWorld.y));
        col += lineColor * line * 0.14;

        // Crests catch the violet sky.
        col += uViolet * 0.3 * smoothstep(0.55, 0.95, n.y) * smoothstep(28.0, 55.0, vWorld.y);

        col = mix(col, uFogColor, fogAmount(vWorld));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  return new Mesh(geometry, material);
}
