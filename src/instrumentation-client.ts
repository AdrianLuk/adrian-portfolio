import { addTransitionType } from "react";
import { worldTransits } from "./components/world-transits";
import { CROSSFADE_TRANSITION_TYPE } from "./components/world-places";

const transits = worldTransits();

/**
 * Every client navigation starts here, a link's or Back and Forward's, inside
 * its transition: one between two Places is a Transit (the world's camera
 * flies); any other carries the type that the layout crossfades.
 */
export function onRouterTransitionStart(url: string) {
  if (!transits.navigate(url)) addTransitionType(CROSSFADE_TRANSITION_TYPE);
}
