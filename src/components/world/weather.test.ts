import { describe, expect, it } from "vitest";
import { parseWeather, seasonalWeather, weatherForCode } from "./weather";

describe("weatherForCode", () => {
  it("reads WMO snow codes as snow", () => {
    for (const code of [71, 73, 75, 77, 85, 86]) {
      expect(weatherForCode(code)).toBe("snow");
    }
  });

  it("reads drizzle, rain, freezing rain, showers and storms as rain", () => {
    for (const code of [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]) {
      expect(weatherForCode(code)).toBe("rain");
    }
    for (const code of [95, 96, 99]) expect(weatherForCode(code)).toBe("rain");
  });

  it("reads clear, cloudy and foggy skies as clear", () => {
    for (const code of [0, 1, 2, 3, 45, 48]) {
      expect(weatherForCode(code)).toBe("clear");
    }
  });

  it("reads an unknown code as clear", () => {
    expect(weatherForCode(42)).toBe("clear");
    expect(weatherForCode(-1)).toBe("clear");
    expect(weatherForCode(Number.NaN)).toBe("clear");
  });
});

describe("seasonalWeather", () => {
  it("snows in a Toronto winter", () => {
    expect(seasonalWeather(new Date("2027-01-15T12:00:00Z"))).toBe("snow");
    expect(seasonalWeather(new Date("2026-12-20T12:00:00Z"))).toBe("snow");
    expect(seasonalWeather(new Date("2027-02-28T12:00:00Z"))).toBe("snow");
  });

  it("is clear the rest of the year", () => {
    expect(seasonalWeather(new Date("2027-07-15T12:00:00Z"))).toBe("clear");
    expect(seasonalWeather(new Date("2027-03-15T12:00:00Z"))).toBe("clear");
    expect(seasonalWeather(new Date("2026-11-15T12:00:00Z"))).toBe("clear");
  });

  it("goes by the date in Toronto, not UTC", () => {
    // 03:00 UTC on 1 March is still the evening of 28 February in Toronto.
    expect(seasonalWeather(new Date("2027-03-01T03:00:00Z"))).toBe("snow");
    // 03:00 UTC on 1 December is still the evening of 30 November.
    expect(seasonalWeather(new Date("2026-12-01T03:00:00Z"))).toBe("clear");
  });
});

describe("parseWeather", () => {
  it("accepts each condition", () => {
    expect(parseWeather("snow")).toBe("snow");
    expect(parseWeather("rain")).toBe("rain");
    expect(parseWeather("clear")).toBe("clear");
  });

  it("ignores anything else", () => {
    expect(parseWeather(null)).toBeNull();
    expect(parseWeather("")).toBeNull();
    expect(parseWeather("Snow")).toBeNull();
    expect(parseWeather("hail")).toBeNull();
  });
});
