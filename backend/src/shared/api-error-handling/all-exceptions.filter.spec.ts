import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ExternalApiError } from './external-api.error';

function buildHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shapes an ExternalApiError as a 502 with the documented body', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = buildHost();

    filter.catch(new ExternalApiError('anthropic', 'boom'), host);

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith({
      error: { message: 'boom', source: 'anthropic' },
    });
  });

  it('leaves a Nest HttpException (e.g. a validation rejection) completely unchanged', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = buildHost();
    const exception = new BadRequestException('bad request');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(exception.getStatus());
    expect(json).toHaveBeenCalledWith(exception.getResponse());
  });

  it('shapes an unexpected Error as a generic 500 and logs the original exception', () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const filter = new AllExceptionsFilter();
    const { host, status, json } = buildHost();
    const exception = new Error('leaky internal detail');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { message: 'An unexpected error occurred', source: 'app' },
    });
    expect(loggerSpy).toHaveBeenCalledWith(exception);
  });
});
