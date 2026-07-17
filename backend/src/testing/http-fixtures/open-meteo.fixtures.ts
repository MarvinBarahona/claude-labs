import nock from 'nock';

export const OPEN_METEO_GEOCODING_BASE_URL =
  'https://geocoding-api.open-meteo.com';
export const OPEN_METEO_FORECAST_BASE_URL = 'https://api.open-meteo.com';

export function mockOpenMeteoGeocode(
  location: string,
  results: Array<{ latitude: number; longitude: number }>,
): nock.Scope {
  return nock(OPEN_METEO_GEOCODING_BASE_URL)
    .get('/v1/search')
    .query(true)
    .reply(200, { results });
}

export function mockOpenMeteoGeocodeNotFound(location: string): nock.Scope {
  return mockOpenMeteoGeocode(location, []);
}

export function mockOpenMeteoForecast(
  latitude: number,
  longitude: number,
  response: { current: { temperature_2m: number; weather_code: number } },
): nock.Scope {
  return nock(OPEN_METEO_FORECAST_BASE_URL)
    .get('/v1/forecast')
    .query(true)
    .reply(200, response);
}

export function mockOpenMeteoGeocodeServerError(): nock.Scope {
  return nock(OPEN_METEO_GEOCODING_BASE_URL)
    .get('/v1/search')
    .query(true)
    .reply(500, { reason: 'internal error' });
}
