/**
 * A data attribute a page sets on an element for a script to find it by,
 * named once: the page sets it with `props`, the script finds it with
 * `selector`.
 */
export function mark<Name extends `data-${string}`>(name: Name) {
  return {
    selector: `[${name}]`,
    props: { [name]: true } as { [K in Name]: true },
  };
}
