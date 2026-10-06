import { afterEach, describe, expect, it, vi } from "vitest";
import { torontoWeather } from "./toronto-weather";

const JANUARY = new Date("2027-01-15T12:00:00Z");
const JULY = new Date("2027-07-15T12:00:00Z");

function respond(body: unknown, init: ResponseInit = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), init)),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("torontoWeather", () => {
  it("asks Open-Meteo for Toronto's current weather code", async () => {
    respond({ current: { weather_code: 0 } });
    await torontoWeather(JULY);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const asked = new URL(String(url));
    expect(asked.host).toBe("api.open-meteo.com");
    expect(asked.searchParams.get("latitude")).toBe("43.65");
    expect(asked.searchParams.get("longitude")).toBe("-79.38");
    expect(asked.searchParams.get("current")).toBe("weather_code");
    // Cached with the page for an hour, and never waited on for long.
    expect(init).toMatchObject({ next: { revalidate: 3600 } });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps the current code to the world's weather", async () => {
    respond({ current: { weather_code: 73 } });
    expect(await torontoWeather(JULY)).toBe("snow");
    respond({ current: { weather_code: 63 } });
    expect(await torontoWeather(JANUARY)).toBe("rain");
    respond({ current: { weather_code: 2 } });
    expect(await torontoWeather(JANUARY)).toBe("clear");
  });

  it("falls back to the season when the network fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await torontoWeather(JANUARY)).toBe("snow");
    expect(await torontoWeather(JULY)).toBe("clear");
  });

  it("falls back to the season on an error status", async () => {
    respond({ error: true, reason: "down" }, { status: 503 });
    expect(await torontoWeather(JANUARY)).toBe("snow");
  });

  it("falls back to the season on an unexpected body", async () => {
    respond({ current: { weather_code: "73" } });
    expect(await torontoWeather(JANUARY)).toBe("snow");
    respond({});
    expect(await torontoWeather(JULY)).toBe("clear");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>")),
    );
    expect(await torontoWeather(JULY)).toBe("clear");
  });
});
