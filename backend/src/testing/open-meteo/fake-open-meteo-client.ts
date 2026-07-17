import {
  OpenMeteoClient,
  OpenMeteoWeather,
} from '../../live-tool-use-console/open-meteo-client';

/** Test double for `OpenMeteoClient`; see docs/shared/test-doubles.md. Per-location responses, falling back to a default when a location wasn't specifically configured. */
export class FakeOpenMeteoClient extends OpenMeteoClient {
  private responses = new Map<string, OpenMeteoWeather | null>();
  private defaultResponse: OpenMeteoWeather | null = {
    temperatureC: 20,
    description: 'Clear sky',
  };

  setWeather(location: string, result: OpenMeteoWeather | null): this {
    this.responses.set(location, result);
    return this;
  }

  setDefaultWeather(result: OpenMeteoWeather | null): this {
    this.defaultResponse = result;
    return this;
  }

  getWeather(location: string): Promise<OpenMeteoWeather | null> {
    return Promise.resolve(
      this.responses.has(location)
        ? this.responses.get(location)!
        : this.defaultResponse,
    );
  }
}
