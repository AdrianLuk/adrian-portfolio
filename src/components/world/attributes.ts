import { type BufferGeometry, Float32BufferAttribute } from "three";

/** A per-vertex attribute holding `value` for each of `g`'s vertices. */
export function each(g: BufferGeometry, value: number[]) {
  const n = g.getAttribute("position").count;
  return new Float32BufferAttribute(
    Array.from({ length: n }, () => value).flat(),
    value.length,
  );
}

/** `g`, tagged with which part of a merged model it is (`aPart`, for the shader). */
export function piece(g: BufferGeometry, part: number) {
  g.setAttribute("aPart", each(g, [part]));
  return g;
}
