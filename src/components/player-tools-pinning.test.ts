import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EARLY_PIN_SCRIPT, PINNED_MEDIA } from "./player-tools-pinning";

/** The `pinned` variant in globals.css, up to the slot its rules fill. */
function pinnedVariant() {
  const css = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const start = css.indexOf("@custom-variant pinned");
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("@slot", start));
}

describe("where the Player tools pin", () => {
  it("asks for a wide, tall screen with motion allowed", () => {
    expect(PINNED_MEDIA).toContain("min-width: 64rem");
    expect(PINNED_MEDIA).toContain("prefers-reduced-motion: no-preference");
  });

  it("is one query: the CSS lays the scene out by the one the scripts run on", () => {
    expect(pinnedVariant()).toContain(`@media ${PINNED_MEDIA} {`);
  });

  it("lays the scene out pinned only once a script has marked it", () => {
    expect(pinnedVariant()).toContain("&:is([data-scene], [data-scene] *)");
  });

  it("is checked by the early script against the same query", () => {
    expect(EARLY_PIN_SCRIPT).toContain(JSON.stringify(PINNED_MEDIA));
  });
});
