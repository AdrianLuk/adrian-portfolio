import { addTransitionType } from "react";
import {
  FLIGHT_TRANSITION,
  worldFlights,
} from "./components/world-flights";

// Created now, so it knows the page the visit starts on: Back and Forward
// report only where they are going.
const flights = worldFlights();

/**
 * Every client navigation starts here, a link's or Back and Forward's, inside
 * its transition: one between home and the Resume page flies the world's
 * camera, and carries a type that turns the layout's crossfade off for it.
 */
export function onRouterTransitionStart(url: string) {
  if (flights.navigate(url)) addTransitionType(FLIGHT_TRANSITION);
}
