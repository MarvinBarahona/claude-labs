import { ExternalApiError } from './external-api.error';
import { shapeError } from './shape-error';

describe('shapeError', () => {
  it('shapes an ExternalApiError as a 502 with its own message and source', () => {
    expect(shapeError(new ExternalApiError('anthropic', 'boom'))).toEqual({
      status: 502,
      body: { error: { message: 'boom', source: 'anthropic' } },
    });
  });

  it('shapes a plain Error as a generic 500, never leaking its message', () => {
    expect(shapeError(new Error('leaky internal detail'))).toEqual({
      status: 500,
      body: {
        error: { message: 'An unexpected error occurred', source: 'app' },
      },
    });
  });

  it('shapes a thrown non-Error value as the same generic 500', () => {
    expect(shapeError('some thrown string')).toEqual({
      status: 500,
      body: {
        error: { message: 'An unexpected error occurred', source: 'app' },
      },
    });
  });
});
