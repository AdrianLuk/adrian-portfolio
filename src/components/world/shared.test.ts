import { describe, expect, it } from "vitest";
import { STILL_TIME, trafficTime } from "./shared";

describe("the traffic clock", () => {
  it("runs with the world's clock when motion is allowed on a GPU", () => {
    expect(trafficTime(42.5, { motion: true, software: false })).toBe(42.5);
  });

  it("holds the still frame's moment under reduced motion, and in software, where motes still drift", () => {
    expect(trafficTime(42.5, { motion: false, software: false })).toBe(11.5);
    expect(trafficTime(42.5, { motion: true, software: true })).toBe(11.5);
    expect(STILL_TIME).toBe(11.5);
  });
});
