import type { ReactNode } from "react";

/**
 * The pieces the games' UIs share (the Rally game's, the Home Run Derby's):
 * their buttons, titles and lines over the field, the copy that steps aside
 * in play, and the slow mode switch.
 */

export const gameButton =
  "rounded-full border border-cyan/60 bg-night/80 px-5 py-2 font-display text-sm font-bold tracking-widest text-ink uppercase [font-stretch:90%] hover:border-cyan";

export const gamePrimary =
  "rounded-full bg-ember px-7 py-3 font-display font-bold tracking-wide text-night uppercase [font-stretch:110%] disabled:opacity-60";

export const overlayTitle =
  "font-display text-3xl font-extrabold uppercase [font-stretch:120%]";

/** Shadowed in the night, so a line on the field holds over its lights. */
export const overField =
  "[text-shadow:0_0_12px_var(--color-night),0_1px_3px_var(--color-night)]";

/**
 * The page's copy over the field: held back while the camera flies there
 * (`arrives`, the Place's own classes for that), and stepping aside (faded
 * out, then out of reach of focus) while `away`, the field filling the
 * screen. It comes back within reach at once, so focus can return to it.
 */
export function StepsAside({
  away,
  arrives = "",
  children,
}: {
  away: boolean;
  arrives?: string;
  children: ReactNode;
}) {
  return (
    <div className={arrives}>
      <div
        className={
          away
            ? "invisible opacity-0 motion-safe:[transition:opacity_500ms,visibility_0s_500ms]"
            : "motion-safe:transition-opacity motion-safe:duration-500"
        }
      >
        {children}
      </div>
    </div>
  );
}

export function SlowMode({
  copy,
  checked,
  onChange,
}: {
  copy: { label: string; description: string };
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex max-w-xs cursor-pointer items-start gap-3 text-left">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-5 accent-cyan"
        aria-describedby="slow-mode-description"
      />
      <span>
        <span className="font-semibold">{copy.label}</span>
        <span id="slow-mode-description" className="block text-sm text-ink/75">
          {copy.description}
        </span>
      </span>
    </label>
  );
}
