import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  ShaderMaterial,
  ShapePath,
  Vector3,
  type Camera,
  type Color,
} from "three";
import { createGlowPoints } from "./glow-points";
import type { Pool } from "./ground-pools";
import { nameGlyphs } from "./name-glyphs";
import { fogUniforms, palette } from "./palette";
import type { WordFit } from "./plate-fit";
import { CAMERA } from "./pose";
import type { SharedUniforms } from "./shared";
import { valleyHeight } from "./terrain";

/** Extrusion, in font units (2000 to the em). */
const EXTRUDE = { depth: 1500, bevel: 70 };
const TOTAL_DEPTH = EXTRUDE.depth + 2 * EXTRUDE.bevel;

/** Beams lean slightly away from the camera and sweep about the plate normal. */
const BEAM_LEAN = -0.18;
function sweepAngles(t: number) {
  const swing = Math.sin(t * 0.42);
  return [0.2 + 0.32 * swing, -0.2 + 0.32 * swing];
}

export type PlacedWord = { text: string; fit: WordFit; advance: number };

/** Parses the generated outline commands (m, l, q, z) into three.js shapes. */
export function outlineToShapes(outline: string) {
  const path = new ShapePath();
  const t = outline.split(" ");
  for (let i = 0; i < t.length;) {
    const op = t[i++];
    if (op === "m") path.moveTo(+t[i++], +t[i++]);
    else if (op === "l") path.lineTo(+t[i++], +t[i++]);
    else if (op === "q") {
      const cx = +t[i++];
      const cy = +t[i++];
      path.quadraticCurveTo(cx, cy, +t[i++], +t[i++]);
    }
  }
  return path.toShapes();
}

function createBeam(color: Color, shared: SharedUniforms) {
  const length = 130;
  const geometry = new CylinderGeometry(7.5, 0.22, length, 32, 1, true);
  geometry.translate(0, length / 2, 0);
  const cone = new Mesh(
    geometry,
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: {
        ...shared,
        uColor: { value: color },
        uLength: { value: length },
      },
      vertexShader: /* glsl */ `
        uniform float uLength;
        varying float vAlong;
        varying vec3 vNormalView;
        varying vec3 vViewPos;
        void main() {
          vAlong = position.y / uLength;
          vNormalView = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlong;
        varying vec3 vNormalView;
        varying vec3 vViewPos;
        void main() {
          float facing = abs(dot(normalize(vNormalView), normalize(-vViewPos)));
          float core = pow(facing, 3.0);
          float fade = pow(1.0 - vAlong, 1.7) * smoothstep(0.0, 0.04, vAlong);
          gl_FragColor = vec4(uColor * core * fade * 0.13, 1.0);
          #include <colorspace_fragment>
        }
      `,
    }),
  );

  const pivot = new Group();
  pivot.add(cone);
  return pivot;
}

/**
 * ADRIAN LUK as monumental extruded letterforms: faces lit from above and
 * sinking into the ground fog at their feet, sides glowing violet into depth,
 * a cyan chamfer along every front edge (the emissive edge), and two beams
 * rising from behind the plate whose light sweeps across the letter faces.
 *
 * The plate group is the plate plane: it sits `plateDepth` ahead of the camera
 * and shares its orientation, so words placed at their fits (camera space)
 * cover the DOM headline exactly.
 */
export function createNamePlate(shared: SharedUniforms) {
  const group = new Group();

  // Plate-local beam axes, for the light they throw across the faces:
  // (origin x, base y, tan of the sweep angle).
  const beamA = new Vector3();
  const beamB = new Vector3();
  const toPlate = new Matrix4();
  const cap = new ShaderMaterial({
    uniforms: {
      ...fogUniforms(),
      uInk: { value: palette.ink },
      uLow: { value: palette.violet.clone().lerp(palette.dusk, 0.45) },
      uCyan: { value: palette.cyan },
      uViolet: { value: palette.violet },
      uCapHeight: { value: nameGlyphs.capHeight },
      uToPlate: { value: toPlate },
      uBeamA: { value: beamA },
      uBeamB: { value: beamB },
    },
    vertexShader: /* glsl */ `
      uniform mat4 uToPlate;
      varying float vHeight;
      varying vec2 vPlate;
      void main() {
        vHeight = position.y;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vPlate = (uToPlate * world).xy;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInk, uLow, uCyan, uViolet, uFogColor;
      uniform float uCapHeight;
      uniform vec3 uBeamA, uBeamB;
      varying float vHeight;
      varying vec2 vPlate;
      float band(vec3 beam, vec2 p) {
        float rise = max(p.y - beam.y, 0.0);
        float dx = p.x - (beam.x - beam.z * rise);
        float width = 0.7 + 0.12 * rise;
        return exp(-(dx * dx) / (width * width));
      }
      void main() {
        float g = clamp(vHeight / uCapHeight, 0.0, 1.0);
        // Lit from above: near-white at the cap line, violet-dusk at the baseline.
        vec3 col = mix(uLow, uInk * 0.95, smoothstep(0.0, 1.0, g));
        // The beams' light crossing the faces.
        col += uCyan * band(uBeamA, vPlate) * 0.42;
        col += uViolet * band(uBeamB, vPlate) * 0.5;
        // The feet sink into the ground fog.
        col = mix(col, uFogColor, (1.0 - smoothstep(0.0, 0.18, g)) * 0.45);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const sides = new ShaderMaterial({
    uniforms: {
      uCyan: { value: palette.cyan },
      uViolet: { value: palette.violet },
      uDeep: { value: palette.night },
      uDepth: { value: TOTAL_DEPTH },
      uBevel: { value: EXTRUDE.bevel },
    },
    vertexShader: /* glsl */ `
      uniform float uDepth;
      varying vec3 vNormal;
      varying float vDepth;
      varying float vFromFront;
      void main() {
        vNormal = normal;
        vFromFront = -position.z;
        vDepth = vFromFront / uDepth;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uCyan, uViolet, uDeep;
      uniform float uBevel;
      varying vec3 vNormal;
      varying float vDepth;
      varying float vFromFront;
      void main() {
        float front = 1.0 - clamp(vDepth, 0.0, 1.0);
        vec3 col = mix(uDeep, uViolet * 0.75, pow(front, 2.6));
        // The chamfer emits: brightest at the face edge, fading back across it.
        float rim = smoothstep(0.15, 0.95, normalize(vNormal).z);
        float edge = 1.0 - smoothstep(0.0, uBevel * 1.6, vFromFront);
        col = mix(col, uCyan * 1.1, rim * 0.85 * (0.45 + 0.55 * edge));
        col += uCyan * edge * 0.25;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  const words = new Map<string, Mesh>();
  for (const [text, word] of Object.entries(nameGlyphs.words)) {
    const geometry = new ExtrudeGeometry(outlineToShapes(word.outline), {
      depth: EXTRUDE.depth,
      bevelEnabled: true,
      bevelThickness: EXTRUDE.bevel,
      bevelSize: EXTRUDE.bevel,
      bevelSegments: 3,
      curveSegments: 6,
    });
    // The face toward the camera is the extrusion's far cap: bring it to z = 0.
    geometry.translate(0, 0, -(EXTRUDE.depth + EXTRUDE.bevel));
    const mesh = new Mesh(geometry, [cap, sides]);
    mesh.visible = false;
    words.set(text, mesh);
    group.add(mesh);
  }

  /** Light the beams and the plate's lit edge throw onto the ground. */
  let pools: Pool[] = [];
  function poolAt(
    x: number,
    z: number,
    width: number,
    depth: number,
    color: Color,
  ) {
    const world = group.localToWorld(new Vector3(x, 0, z));
    return {
      x: world.x,
      y: valleyHeight(world.x, world.z),
      z: world.z,
      width,
      depth,
      color,
    };
  }

  const beams = [
    createBeam(palette.cyan, shared),
    createBeam(palette.violet, shared),
  ];
  group.add(...beams);
  const flares = createGlowPoints(
    [
      { x: 0, y: 0, z: 0, color: palette.cyan, size: 2.6, seed: 0.3 },
      { x: 0, y: 0, z: 0, color: palette.violet, size: 2.6, seed: 0.7 },
    ],
    shared,
    { intensity: 1.2 },
  );
  group.add(flares.points);

  return {
    group,
    flares,

    /** Stands the words where the DOM headline sits, as seen from `camera`. */
    place(placed: readonly PlacedWord[], camera: Camera) {
      camera.updateMatrixWorld();
      group.position.copy(
        camera.localToWorld(new Vector3(0, 0, -CAMERA.plateDepth)),
      );
      group.quaternion.copy(camera.quaternion);

      for (const mesh of words.values()) mesh.visible = false;
      for (const { text, fit } of placed) {
        const mesh = words.get(text);
        if (!mesh) continue;
        mesh.position.set(fit.x, fit.y, 0);
        mesh.scale.setScalar(fit.scale);
        mesh.visible = true;
      }

      // The beams rise from the ground behind each end of the plate, so the
      // letters hide their bases.
      const left = Math.min(...placed.map((p) => p.fit.x));
      const right = Math.max(
        ...placed.map((p) => p.fit.x + p.advance * p.fit.scale),
      );
      const base = Math.min(...placed.map((p) => p.fit.y));
      const scale = Math.max(...placed.map((p) => p.fit.scale));
      const behind = -TOTAL_DEPTH * scale - 2;
      const span = right - left;
      const origins = [left + span * 0.2, left + span * 0.8];
      const position = flares.points.geometry.attributes.position;
      beams.forEach((beam, i) => {
        beam.position.set(origins[i], base, behind);
        position.setXYZ(i, origins[i], base + 0.2, behind);
      });
      position.needsUpdate = true;
      beamA.set(origins[0], base, beamA.z);
      beamB.set(origins[1], base, beamB.z);

      group.updateMatrixWorld();
      toPlate.copy(group.matrixWorld).invert();

      const edgeLight = palette.cyan.clone().lerp(palette.violet, 0.35);
      pools = [
        poolAt(origins[0], behind, 10, 10, palette.cyan),
        poolAt(origins[1], behind, 10, 10, palette.violet),
        // A soft wash of the edge colour on the ground at the plate's feet, deep
        // enough towards the camera that it never flattens into a line.
        poolAt((left + right) / 2, 7, span * 1.1, 22, edgeLight),
      ];
    },

    pools: () => pools,

    /** Sweeps the beams; `t` in seconds. The still frame uses a fixed t. */
    sweep(t: number) {
      const [a, b] = sweepAngles(t);
      beams[0].rotation.set(BEAM_LEAN, 0, a, "ZYX");
      beams[1].rotation.set(BEAM_LEAN, 0, b, "ZYX");
      // Turning +y about z by s tips it towards -x: x(rise) = x0 - tan(s) * rise.
      beamA.z = Math.tan(a);
      beamB.z = Math.tan(b);
    },
  };
}
