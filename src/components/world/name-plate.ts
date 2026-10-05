import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  ShaderMaterial,
  ShapePath,
  Vector3,
  type Camera,
  type Color,
  type Texture,
} from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { createGlowPoints } from "./glow-points";
import type { Pool } from "./ground-pools";
import { nameGlyphs } from "./name-glyphs";
import { fogUniforms, palette } from "./palette";
import type { WordFit } from "./plate-fit";
import { CAMERA } from "./pose";
import type { PlateFinish } from "./quality";
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

/**
 * One word of the plate, extruded with its chamfer, the face toward the
 * camera at z = 0. The tier's segment counts set how finely its curves and
 * chamfer are rounded.
 */
export function wordGeometry(
  outline: string,
  {
    curveSegments,
    bevelSegments,
  }: Pick<PlateFinish, "curveSegments" | "bevelSegments">,
) {
  const geometry = new ExtrudeGeometry(outlineToShapes(outline), {
    depth: EXTRUDE.depth,
    bevelEnabled: true,
    bevelThickness: EXTRUDE.bevel,
    bevelSize: EXTRUDE.bevel,
    bevelSegments,
    curveSegments,
  });
  // The face toward the camera is the extrusion's far cap: bring it to z = 0.
  geometry.translate(0, 0, -(EXTRUDE.depth + EXTRUDE.bevel));
  smoothFlanks(geometry);
  return geometry;
}

function createBeam(
  color: Color,
  shared: SharedUniforms,
  level: { value: number },
) {
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
        uLevel: level,
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
        uniform float uLevel;
        varying float vAlong;
        varying vec3 vNormalView;
        varying vec3 vViewPos;
        void main() {
          float facing = abs(dot(normalize(vNormalView), normalize(-vViewPos)));
          float core = pow(facing, 3.0);
          float fade = pow(1.0 - vAlong, 1.7) * smoothstep(0.0, 0.04, vAlong);
          gl_FragColor = vec4(uColor * core * fade * 0.13 * uLevel, 1.0);
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
 * Smooths the curved flanks so reflections run along them instead of
 * breaking at every facet, while the faces (group 0, the caps) keep their
 * exact flat normals: creasing would tilt them towards the chamfer and streak
 * the reflections across each face's long triangles.
 */
function smoothFlanks(geometry: ExtrudeGeometry) {
  const normal = geometry.attributes.normal;
  // One cap group per letter.
  const caps = geometry.groups
    .filter((g) => g.materialIndex === 0)
    .map((g) => ({
      start: g.start * 3,
      flat: normal.array.slice(g.start * 3, (g.start + g.count) * 3),
    }));
  toCreasedNormals(geometry, Math.PI / 6);
  const creased = geometry.attributes.normal;
  for (const { start, flat } of caps) creased.array.set(flat, start);
  creased.needsUpdate = true;
}

/**
 * ADRIAN LUK as the hero object: monumental extruded letterforms in physically
 * based materials that reflect a baked night environment. The faces are pale,
 * clearcoated and lit from above, sinking into the ground fog at their feet;
 * the sides are dark reflective metal glowing violet into depth; a cyan
 * chamfer emits along every front edge (the signature, which reflections add
 * to, never replace); and two beams rise from behind the plate, their light
 * sweeping across the faces.
 *
 * The plate group is the plate plane: it sits `plateDepth` ahead of the camera
 * and shares its orientation, so words placed at their fits (camera space)
 * cover the DOM headline exactly.
 */
export function createNamePlate(
  shared: SharedUniforms,
  {
    envMap,
    finish,
  }: {
    /** The baked night environment, or null on the lite tier. */
    envMap: Texture | null;
    finish: PlateFinish;
  },
) {
  const group = new Group();

  // Plate-local beam axes, for the light they throw across the faces:
  // (origin x, base y, tan of the sweep angle).
  const beamA = new Vector3();
  const beamB = new Vector3();
  const toPlate = new Matrix4();
  /** The beams' brightness: 1 at rest, brighter as the camera arrives. */
  const beamLevel = { value: 1 };
  // The plate's own light goes in as emissive, through onBeforeCompile, so
  // the physical shading (reflections, clearcoat) adds on top of it.
  const capUniforms = {
    ...fogUniforms(),
    uInk: { value: palette.ink },
    uLow: { value: palette.violet.clone().lerp(palette.dusk, 0.45) },
    uCyan: { value: palette.cyan },
    uViolet: { value: palette.violet },
    uCapHeight: { value: nameGlyphs.capHeight },
    uToPlate: { value: toPlate },
    uBeamA: { value: beamA },
    uBeamB: { value: beamB },
    uBeamLevel: beamLevel,
  };
  const cap = new MeshPhysicalMaterial({
    color: palette.ink.clone().lerp(palette.violet, 0.1),
    roughness: 0.2,
    metalness: 0.1,
    envMap,
    envMapIntensity: 1.45,
    clearcoat: finish.clearcoat,
    clearcoatRoughness: 0.05,
    iridescence: finish.iridescence,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [180, 420],
    fog: false,
  });
  cap.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, capUniforms);
    shader.vertexShader =
      "uniform mat4 uToPlate;\nvarying float vHeight;\nvarying vec2 vPlate;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vHeight = position.y;
        vPlate = (uToPlate * modelMatrix * vec4(position, 1.0)).xy;`,
      );
    shader.fragmentShader =
      /* glsl */ `
      uniform vec3 uInk, uLow, uCyan, uViolet, uFogColor;
      uniform float uCapHeight;
      uniform vec3 uBeamA, uBeamB;
      uniform float uBeamLevel;
      varying float vHeight;
      varying vec2 vPlate;
      float band(vec3 beam, vec2 p) {
        float rise = max(p.y - beam.y, 0.0);
        float dx = p.x - (beam.x - beam.z * rise);
        float width = 0.7 + 0.12 * rise;
        return exp(-(dx * dx) / (width * width));
      }
    ` +
      shader.fragmentShader
        .replace(
          "#include <emissivemap_fragment>",
          /* glsl */ `#include <emissivemap_fragment>
          float g = clamp(vHeight / uCapHeight, 0.0, 1.0);
          // Lit from above: pale at the cap line, violet-dusk at the baseline.
          totalEmissiveRadiance = mix(uLow, uInk * 0.64, smoothstep(0.0, 1.0, g));
          // The beams' light crossing the faces.
          totalEmissiveRadiance += uCyan * band(uBeamA, vPlate) * 0.42 * uBeamLevel;
          totalEmissiveRadiance += uViolet * band(uBeamB, vPlate) * 0.5 * uBeamLevel;`,
        )
        .replace(
          "#include <opaque_fragment>",
          /* glsl */ `// The feet sink into the ground fog.
          outgoingLight = mix(outgoingLight, uFogColor, (1.0 - smoothstep(0.0, 0.18, g)) * 0.45);
          #include <opaque_fragment>`,
        );
  };

  const sideUniforms = {
    uCyan: { value: palette.cyan },
    uViolet: { value: palette.violet },
    uDeep: { value: palette.night },
    uDepth: { value: TOTAL_DEPTH },
    uBevel: { value: EXTRUDE.bevel },
  };
  const sides = new MeshPhysicalMaterial({
    color: palette.night.clone().lerp(palette.violet, 0.3),
    metalness: 0.8,
    roughness: 0.26,
    envMap,
    envMapIntensity: 0.9,
    fog: false,
  });
  sides.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sideUniforms);
    shader.vertexShader =
      "varying float vFromFront;\nvarying float vNormalZ;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vFromFront = -position.z;
        vNormalZ = normal.z;`,
      );
    shader.fragmentShader =
      /* glsl */ `
      uniform vec3 uCyan, uViolet, uDeep;
      uniform float uDepth, uBevel;
      varying float vFromFront;
      varying float vNormalZ;
    ` +
      shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `#include <emissivemap_fragment>
        float front = 1.0 - clamp(vFromFront / uDepth, 0.0, 1.0);
        vec3 glow = mix(uDeep, uViolet * 0.75, pow(front, 2.6));
        // The chamfer emits: brightest at the face edge, fading back across it.
        float rim = smoothstep(0.15, 0.95, vNormalZ);
        float edge = 1.0 - smoothstep(0.0, uBevel * 1.6, vFromFront);
        glow = mix(glow, uCyan * 1.1, rim * 0.85 * (0.45 + 0.55 * edge));
        totalEmissiveRadiance = glow + uCyan * edge * 0.25;`,
      );
  };

  const words = new Map<string, Mesh>();
  for (const [text, word] of Object.entries(nameGlyphs.words)) {
    const geometry = wordGeometry(word.outline, finish);
    const mesh = new Mesh(geometry, [cap, sides]);
    mesh.visible = false;
    words.set(text, mesh);
    group.add(mesh);
  }

  /** Light the beams and the plate's lit edge throw onto the ground. */
  let pools: Pool[] = [];
  /** The middle of the letterforms' face, in world space. */
  const centre = new Vector3();
  /** Radians added to the beams' swing: they sweep across the letters on arrival. */
  let sweepOffset = 0;
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
    createBeam(palette.cyan, shared, beamLevel),
    createBeam(palette.violet, shared, beamLevel),
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
      const top = Math.max(
        ...placed.map((p) => p.fit.y + nameGlyphs.capHeight * p.fit.scale),
      );
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
      centre.copy(
        group.localToWorld(
          new Vector3((left + right) / 2, (base + top) / 2, 0),
        ),
      );

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

    centre: () => centre,

    /** Lights the arrival: the beams' brightness and their sweep's offset. */
    setArrival(level: number, sweep: number) {
      beamLevel.value = level;
      flares.setIntensity(1.2 * level);
      sweepOffset = sweep;
    },

    /** Swaps the reflected environment (after a lost context is restored). */
    setEnvironment(texture: Texture | null) {
      cap.envMap = texture;
      sides.envMap = texture;
    },

    /** Sweeps the beams; `t` in seconds. The still frame uses a fixed t. */
    sweep(t: number) {
      const [a, b] = sweepAngles(t).map((s) => s + sweepOffset);
      beams[0].rotation.set(BEAM_LEAN, 0, a, "ZYX");
      beams[1].rotation.set(BEAM_LEAN, 0, b, "ZYX");
      // Turning +y about z by s tips it towards -x: x(rise) = x0 - tan(s) * rise.
      beamA.z = Math.tan(a);
      beamB.z = Math.tan(b);
    },
  };
}
