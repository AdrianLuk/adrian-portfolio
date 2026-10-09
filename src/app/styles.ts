/**
 * Class strings the pages share, so a change to the theme's look is one edit.
 */

/**
 * A link's light coming up on hover and on keyboard focus: a cyan glow round
 * its text, eased in with motion allowed (and there at once without).
 */
export const glowsLit =
  "hover:[text-shadow:0_0_14px_color-mix(in_srgb,var(--color-cyan)_70%,transparent)] focus-visible:[text-shadow:0_0_14px_color-mix(in_srgb,var(--color-cyan)_70%,transparent)] motion-safe:transition-[color,text-decoration-color,text-shadow] motion-safe:duration-200";

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

/** A cyan link that brightens, glowing, on hover and on keyboard focus. */
export const textLink = `font-semibold text-cyan underline decoration-cyan/40 underline-offset-4 hover:decoration-cyan focus-visible:decoration-cyan ${glowsLit}`;

/** A raised panel, as the Resume page's entries use. (The home page's Highlights have their own holographic panel.) */
export const panel = "rounded-2xl bg-dusk/70 p-6 sm:p-8";

/**
 * The panel copy stands on over a live Place, so no line is lost to the
 * world's lights behind it: its glow in the Place's light (its corner
 * brackets too, by `PanelCorners`), or at the Skyline, whose magenta is the
 * world's alone, in the world's cyan. Written out in full, so Tailwind finds
 * the classes.
 */
export const overPlace = {
  skyline:
    "relative rounded-sm bg-dusk/80 p-6 shadow-2xl shadow-cyan/10 sm:p-8",
  court:
    "relative rounded-sm bg-dusk/80 p-6 shadow-2xl shadow-violet/10 sm:p-8",
} as const;

/**
 * The Resume page's copy over the Skyline, which arrives as a transit lands
 * there: held back, unseen and out of reach of focus, while the world's root
 * carries data-arriving="skyline" (as the camera lands, and never longer than
 * TRANSIT_MAX_SECONDS from the navigation's start), then faded in. On any
 * other arrival it is simply there.
 */
export const arrivesAtSkyline =
  "in-data-[arriving=skyline]:invisible in-data-[arriving=skyline]:opacity-0 motion-safe:transition-opacity motion-safe:duration-500";

/**
 * The Juice Bros Case study's copy over the court, held back the same way
 * while the world's root carries data-arriving="court", then faded in.
 * (Tailwind needs the literal class, so it is spelt out, not built.)
 */
export const arrivesAtCourt =
  "in-data-[arriving=court]:invisible in-data-[arriving=court]:opacity-0 motion-safe:transition-opacity motion-safe:duration-500";

/**
 * /play's copy over the court, held back the same way while the world's
 * root carries data-arriving="play" (the camera flying to the court's view
 * from behind the player's baseline), then faded in.
 */
export const arrivesAtPlay =
  "in-data-[arriving=play]:invisible in-data-[arriving=play]:opacity-0 motion-safe:transition-opacity motion-safe:duration-500";
