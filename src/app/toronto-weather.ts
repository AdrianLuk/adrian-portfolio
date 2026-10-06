import {
  seasonalWeather,
  weatherForCode,
  type Weather,
} from "@/components/world/weather";

/** How long the weather (and the home page with it) is cached, in seconds. */
export const WEATHER_REVALIDATE = 3600;

const FORECAST = new URL("https://api.open-meteo.com/v1/forecast");
FORECAST.search = new URLSearchParams({
  latitude: "43.65",
  longitude: "-79.38",
  current: "weather_code",
}).toString();

/** Past this, the season decides: the page never waits on the forecast. */
const TIMEOUT_MS = 2000;

/**
 * Toronto's weather now, from Open-Meteo (no key needed), for the server
 * render: the page is cached with it, so a visitor's browser never asks.
 * Never throws: on any failure the season decides.
 */
export async function torontoWeather(now = new Date()): Promise<Weather> {
  try {
    const response = await fetch(FORECAST, {
      next: { revalidate: WEATHER_REVALIDATE },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return seasonalWeather(now);
    const body: unknown = await response.json();
    const code = (body as { current?: { weather_code?: unknown } })?.current
      ?.weather_code;
    return typeof code === "number" ? weatherForCode(code) : seasonalWeather(now);
  } catch {
    return seasonalWeather(now);
  }
}
