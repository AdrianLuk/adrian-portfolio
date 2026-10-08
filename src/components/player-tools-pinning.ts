import { SCENE, SCENE_STATES, toolCopySelector } from "./player-tools-markup";

/**
 * Where the Player tools scene pins, shared by the page, its scripts and (by
 * test) the CSS that lays it out.
 */

/**
 * When the Player tools may pin: wide and tall enough for the stage beside a
 * readable column, with motion allowed. Anything else gets the stacked list.
 * The `pinned` variant in globals.css lays the scene out by the same query
 * (a test holds the two in step), and only while the scene's root carries
 * `data-scene`, which only a script sets.
 */
export const PINNED_MEDIA =
  "(min-width: 64rem) and (min-height: 30rem) and (prefers-reduced-motion: no-preference)";

/**
 * How long the page waits, from parsing the scene, for its island to take
 * over before it falls back to the stacked list: a page that never hydrates
 * never leaves the stage stuck on the first tool.
 */
export const EARLY_PIN_TIMEOUT = 8000;

/**
 * Pins the scene's layout as the page is parsed, before its first paint, so a
 * reader arriving mid-section (a refresh, a link) sees no layout shift when
 * the island arrives: the root's `data-scene` goes to "pending", and the
 * copy's own recordings, out of sight while pinned, lose their controls so
 * the keyboard never stops on them. Unless the island has taken over by
 * EARLY_PIN_TIMEOUT, it all goes back to the stacked list. Runs as an inline
 * script placed last inside the scene's root.
 */
export const EARLY_PIN_SCRIPT = `(function () {
  var root = document.currentScript && document.currentScript.parentElement;
  if (!root || !window.matchMedia(${JSON.stringify(PINNED_MEDIA)}).matches) return;
  var scene = ${JSON.stringify(SCENE)};
  var pending = ${JSON.stringify(SCENE_STATES.pending)};
  var videos = root.querySelectorAll(${JSON.stringify(`${toolCopySelector} video`)});
  function offStage(off) {
    if (off) root.setAttribute(scene, pending);
    else root.removeAttribute(scene);
    for (var i = 0; i < videos.length; i++) videos[i].controls = !off;
  }
  offStage(true);
  setTimeout(function () {
    if (root.getAttribute(scene) === pending) offStage(false);
  }, ${EARLY_PIN_TIMEOUT});
})();`;
