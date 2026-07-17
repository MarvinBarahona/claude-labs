export interface OpenMeteoWeather {
  temperatureC: number;
  description: string;
}

/** DI token every consumer depends on instead of the concrete Open-Meteo REST API. */
export abstract class OpenMeteoClient {
  /** `null` means the location couldn't be resolved — a resolvable request, nothing found, not an error. */
  abstract getWeather(location: string): Promise<OpenMeteoWeather | null>;
}
