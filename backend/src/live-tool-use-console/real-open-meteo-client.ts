import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ExternalApiError } from '../shared/api-error-handling';
import { OpenMeteoClient, OpenMeteoWeather } from './open-meteo-client';

const GEOCODING_BASE_URL = 'https://geocoding-api.open-meteo.com';
const FORECAST_BASE_URL = 'https://api.open-meteo.com';

/** Fixed WMO weather-code lookup; an unmapped code falls back to its own numeric string. */
const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

interface GeocodingResponse {
  results?: Array<{ latitude: number; longitude: number }>;
}

interface ForecastResponse {
  current: { temperature_2m: number; weather_code: number };
}

@Injectable()
export class RealOpenMeteoClient extends OpenMeteoClient {
  private readonly geocodingHttp: AxiosInstance = axios.create({
    baseURL: GEOCODING_BASE_URL,
  });
  private readonly forecastHttp: AxiosInstance = axios.create({
    baseURL: FORECAST_BASE_URL,
  });

  async getWeather(location: string): Promise<OpenMeteoWeather | null> {
    try {
      const { data: geocode } = await this.geocodingHttp.get<GeocodingResponse>(
        '/v1/search',
        { params: { name: location, count: 1 } },
      );
      const match = geocode.results?.[0];
      if (!match) {
        return null;
      }

      const { data: forecast } = await this.forecastHttp.get<ForecastResponse>(
        '/v1/forecast',
        {
          params: {
            latitude: match.latitude,
            longitude: match.longitude,
            current: 'temperature_2m,weather_code',
          },
        },
      );

      return {
        temperatureC: forecast.current.temperature_2m,
        description:
          WEATHER_CODE_DESCRIPTIONS[forecast.current.weather_code] ??
          String(forecast.current.weather_code),
      };
    } catch (error) {
      throw toExternalApiError(error);
    }
  }
}

function toExternalApiError(error: unknown): ExternalApiError {
  const message = error instanceof Error ? error.message : String(error);
  return new ExternalApiError('open-meteo', message);
}
