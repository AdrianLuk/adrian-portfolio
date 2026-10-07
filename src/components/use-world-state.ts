import { useSyncExternalStore } from "react";
import { worldHost, type WorldState } from "./world-host";

/** On the server, and in the server's HTML, the world is never drawn yet. */
const serverWorldState = (): WorldState => "pending";

/**
 * The one world's state, for a page's data-world: a page arriving into a
 * live world renders it drawn from its first client render, with no fade.
 */
export function useWorldState() {
  const host = worldHost();
  return useSyncExternalStore(host.subscribe, host.state, serverWorldState);
}
