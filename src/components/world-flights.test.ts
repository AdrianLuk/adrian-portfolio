import { describe, expect, it } from "vitest";
import { flightBetween } from "./world-flights";

describe("which navigations fly the camera", () => {
  it("flies from home down the valley to the Resume page", () => {
    expect(flightBetween("/", "/resume")).toBe("outpost");
  });

  it("flies from the Resume page back up the valley home, to any of home's anchors", () => {
    expect(flightBetween("/resume", "/")).toBe("hero");
    expect(flightBetween("/resume", "/#work")).toBe("hero");
    expect(flightBetween("/resume", "/#contact")).toBe("hero");
  });

  it("reads full URLs (Back and Forward) and query strings as their page", () => {
    expect(flightBetween("/resume", "https://adrianluk.com/")).toBe("hero");
    expect(flightBetween("/?weather=snow", "/resume?x=1")).toBe("outpost");
  });

  it("never flies within a page (an anchor on home is the scroll route's)", () => {
    expect(flightBetween("/", "/#work")).toBeNull();
    expect(flightBetween("/resume", "/resume#control-d")).toBeNull();
  });

  it("never flies to or from a page with no place in the world", () => {
    for (const other of ["/work/juice-bros", "/play", "/missing"]) {
      expect(flightBetween("/", other)).toBeNull();
      expect(flightBetween(other, "/")).toBeNull();
      expect(flightBetween("/resume", other)).toBeNull();
      expect(flightBetween(other, "/resume")).toBeNull();
    }
  });
});
