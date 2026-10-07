/**
 * Class strings the pages share, so a change to the theme's look is one edit.
 */

/**
 * The small label above each section: ink after a violet rule, shadowed in
 * the night so it holds over the world's lit ridges and towers.
 */
export const sectionLabel =
  "flex items-center gap-3 font-display text-sm font-bold tracking-[0.3em] text-ink uppercase [font-stretch:75%] [text-shadow:0_0_12px_var(--color-night),0_1px_3px_var(--color-night)] before:h-0.5 before:w-8 before:bg-violet";

/** The cyan HUD line under a title: dates, bylines. */
export const metaLine =
  "font-display text-sm tracking-widest text-cyan uppercase [font-stretch:75%]";

/** Title of one entry (a Role, a Side project). */
export const entryTitle = "font-display text-2xl font-bold [font-stretch:115%]";

/** The ember-filled primary action: one per page. */
export const primaryAction =
  "inline-block rounded-full bg-ember px-6 py-3 font-display font-bold tracking-wide text-night uppercase [font-stretch:110%]";

export const textLink =
  "font-semibold text-cyan underline decoration-cyan/40 underline-offset-4 hover:decoration-cyan";

/** A raised panel, as the Resume page's entries use. (The home page's Highlights have their own holographic panel.) */
export const panel = "rounded-2xl bg-dusk/70 p-6 sm:p-8";

/**
 * Copy standing over the world that arrives as a camera flight lands: held
 * back while the camera flies to its page (the world's root carries
 * data-transit), then faded in. On any other arrival it is simply there.
 */
export const arrivesWithCamera =
  "in-data-transit:opacity-0 motion-safe:transition-opacity motion-safe:duration-500";
