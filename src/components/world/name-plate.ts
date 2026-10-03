import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  ShaderMaterial,
  ShapePath,
  SpotLight,
  Vector3,
  type Camera,
  type Color,
} from "three";
import { createGlowPoints } from "./glow-points";
import { nameGlyphs } from "./name-glyphs";
import { palette } from "./palette";
import type { WordFit } from "./plate-fit";
import { CAMERA } from "./pose";
import type { SharedUniforms } from "./shared";

/** Extrusion, in font units (2000 to the em). */
const EXTRUDE = { depth: 1500, bevel: 34 };

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

  const light = new SpotLight(color, 5, 0, 0.2, 0.7, 0);
  const target = new Object3D();
  target.position.set(0, 40, 0);
  light.target = target;

  const pivot = new Group();
  pivot.add(cone, light, target);
  return pivot;
}

/**
 * ADRIAN LUK as monumental extruded letterforms: pale lit faces, sides glowing
 * violet into depth, a cyan bevel along every front edge (the emissive edge),
 * and two beams sweeping up across the letters from the ground in front.
 *
 * The plate group is the plate plane: it sits `plateDepth` ahead of the camera
 * and shares its orientation, so words placed at their fits (camera space)
 * cover the DOM headline exactly.
 */
export function createNamePlate(shared: SharedUniforms) {
  const group = new Group();

  const cap = new MeshStandardMaterial({
    color: palette.ink,
    emissive: palette.violet.clone().lerp(palette.ink, 0.72),
    emissiveIntensity: 0.62,
    roughness: 0.38,
    metalness: 0.15,
  });
  const totalDepth = EXTRUDE.depth + 2 * EXTRUDE.bevel;
  const sides = new ShaderMaterial({
    uniforms: {
      uCyan: { value: palette.cyan },
      uViolet: { value: palette.violet },
      uDeep: { value: palette.night },
      uDepth: { value: totalDepth },
    },
    vertexShader: /* glsl */ `
      uniform float uDepth;
      varying vec3 vNormal;
      varying float vDepth;
      void main() {
        vNormal = normal;
        vDepth = -position.z / uDepth;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uCyan, uViolet, uDeep;
      varying vec3 vNormal;
      varying float vDepth;
      void main() {
        float front = 1.0 - clamp(vDepth, 0.0, 1.0);
        vec3 col = mix(uDeep, uViolet * 0.75, pow(front, 2.6));
        col += uCyan * pow(front, 14.0) * 0.5;
        float rim = smoothstep(0.3, 0.9, normalize(vNormal).z);
        col = mix(col, uCyan * 1.1, rim);
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
      bevelSegments: 2,
      curveSegments: 6,
    });
    // The face toward the camera is the extrusion's far cap: bring it to z = 0.
    geometry.translate(0, 0, -(EXTRUDE.depth + EXTRUDE.bevel));
    const mesh = new Mesh(geometry, [cap, sides]);
    mesh.visible = false;
    words.set(text, mesh);
    group.add(mesh);
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

      // The beams rise from the ground just in front, under each end of the plate.
      const left = Math.min(...placed.map((p) => p.fit.x));
      const right = Math.max(
        ...placed.map((p) => p.fit.x + p.advance * p.fit.scale),
      );
      const base = Math.min(...placed.map((p) => p.fit.y));
      const span = right - left;
      const origins = [left + span * 0.2, left + span * 0.8];
      const position = flares.points.geometry.attributes.position;
      beams.forEach((beam, i) => {
        beam.position.set(origins[i], base, 3.5);
        position.setXYZ(i, origins[i], base + 0.2, 3.5);
      });
      position.needsUpdate = true;
    },

    /** Sweeps the beams; `t` in seconds. The still frame uses a fixed t. */
    sweep(t: number) {
      const swing = Math.sin(t * 0.42);
      beams[0].rotation.set(-0.42, 0, 0.2 + 0.32 * swing, "ZYX");
      beams[1].rotation.set(-0.42, 0, -0.2 + 0.32 * swing, "ZYX");
    },
  };
}
