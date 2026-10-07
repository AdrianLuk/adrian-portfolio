import { addTransitionType } from "react";
import { worldTransits } from "./components/world-transits";
import { TRANSIT_TRANSITION_TYPE } from "./components/world-places";

const transits = worldTransits();

/**
 * Every client navigation starts here, a link's or Back and Forward's, inside
 * its transition: one between home and the Resume page is a transit (the
 * world's camera flies), and carries a type that turns the layout's
 * crossfade off for it.
 */
export function onRouterTransitionStart(url: string) {
  if (transits.navigate(url)) addTransitionType(TRANSIT_TRANSITION_TYPE);
}
