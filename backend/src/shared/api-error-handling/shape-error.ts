import { ExternalApiError } from './external-api.error';

export interface ShapedError {
  status: number;
  body: {
    error: {
      message: string;
      source: string;
    };
  };
}

export function shapeError(exception: unknown): ShapedError {
  if (exception instanceof ExternalApiError) {
    return {
      status: 502,
      body: {
        error: { message: exception.message, source: exception.source },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: { message: 'An unexpected error occurred', source: 'app' },
    },
  };
}
