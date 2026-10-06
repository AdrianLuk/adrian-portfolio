/**
 * The weather over the world, after Toronto's: plain data, so the hero can
 * read it (and the server decide it) before Three.js loads.
 */
export type Weather = "snow" | "rain" | "clear";

const WEATHERS: readonly Weather[] = ["snow", "rain", "clear"];

/**
 * A WMO weather code (as Open-Meteo reports it) as the world's weather: snow
 * and snow showers fall as snow; drizzle, rain, freezing rain, showers and
 * thunderstorms as rain. Clear, cloudy, foggy and unknown skies are clear.
 */
export function weatherForCode(code: number): Weather {
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    (code >= 95 && code <= 99)
  ) {
    return "rain";
  }
  return "clear";
}

/** The month in Toronto (1 to 12), whatever the server's own time zone. */
function torontoMonth(date: Date) {
  const month = new Intl.DateTimeFormat("en-CA", {
    month: "numeric",
    timeZone: "America/Toronto",
  }).format(date);
  return Number(month);
}

/**
 * The weather from the season alone, for when the forecast can't be had:
 * snow from December to February in Toronto, clear the rest of the year.
 */
export function seasonalWeather(date: Date): Weather {
  const month = torontoMonth(date);
  return month === 12 || month <= 2 ? "snow" : "clear";
}

/** A `?weather=` value as a condition, or null if it isn't one. */
export function parseWeather(value: string | null): Weather | null {
  return WEATHERS.find((w) => w === value) ?? null;
}
