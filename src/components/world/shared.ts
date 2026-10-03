import type { IUniform } from "three";

/** Uniforms every material in the world reads, updated once per frame. */
export type SharedUniforms = {
  uTime: IUniform<number>;
  uPixelRatio: IUniform<number>;
};
