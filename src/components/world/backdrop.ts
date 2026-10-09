import {
  AlwaysDepth,
  DepthTexture,
  HalfFloatType,
  Matrix4,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Object3D,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from "three";

/**
 * The world as a backdrop, for a software renderer while the Rally game is
 * on the court: every frame of the game would redraw the whole world on
 * the CPU (CI's frames take half a second), though only the game moves.
 * Instead the world is drawn once into a target, colour and depth, and each
 * frame draws it back as one quad over the screen, with only the `live`
 * objects (the game's, and the veils, whose additive light lies over it)
 * drawn on top, hidden behind the world where they should be. Drawn afresh
 * whenever the camera or the screen moves, the world's `look` (its clock,
 * its lights) changes, or `invalidate` says the world has.
 */
export function createBackdrop(renderer: WebGLRenderer) {
  const size = new Vector2();
  const drawnFrom = { view: new Matrix4(), projection: new Matrix4(), look: "" };
  let target: WebGLRenderTarget | null = null;
  let stale = true;

  const material = new ShaderMaterial({
    uniforms: {
      tColor: { value: null as Texture | null },
      tDepth: { value: null as Texture | null },
    },
    // Written whatever is there: it is the first thing drawn.
    depthFunc: AlwaysDepth,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor;
      uniform sampler2D tDepth;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(tColor, vUv);
        gl_FragDepth = texture2D(tDepth, vUv).r;
        #include <colorspace_fragment>
      }
    `,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  quad.renderOrder = -1;

  /** A target the drawing buffer's size; half float, where it can be drawn to, so the night's darks don't band. */
  function fit() {
    renderer.getDrawingBufferSize(size);
    if (target && target.width === size.x && target.height === size.y) return;
    target?.dispose();
    const float = renderer.extensions.has("EXT_color_buffer_float");
    target = new WebGLRenderTarget(size.x, size.y, {
      type: float ? HalfFloatType : UnsignedByteType,
      depthTexture: new DepthTexture(size.x, size.y),
    });
    material.uniforms.tColor.value = target.texture;
    material.uniforms.tDepth.value = target.depthTexture;
    stale = true;
  }

  return {
    /** Draws `scene` from `camera`: the backdrop, then `live` over it. */
    draw(scene: Scene, camera: Camera, live: readonly Object3D[], look: string) {
      fit();
      if (
        stale ||
        look !== drawnFrom.look ||
        !camera.matrixWorldInverse.equals(drawnFrom.view) ||
        !camera.projectionMatrix.equals(drawnFrom.projection)
      ) {
        for (const object of live) object.visible = false;
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        for (const object of live) object.visible = true;
        drawnFrom.view.copy(camera.matrixWorldInverse);
        drawnFrom.projection.copy(camera.projectionMatrix);
        drawnFrom.look = look;
        stale = false;
      }
      // Over it, only what moves: every other part of the scene stands aside.
      const hidden = scene.children.filter(
        (child) => child.visible && !live.includes(child),
      );
      for (const child of hidden) child.visible = false;
      scene.add(quad);
      renderer.render(scene, camera);
      scene.remove(quad);
      for (const child of hidden) child.visible = true;
    },

    /** The world has changed: the next frame draws it afresh. */
    invalidate() {
      stale = true;
    },

    dispose() {
      target?.dispose();
      target = null;
      quad.geometry.dispose();
      material.dispose();
    },
  };
}
