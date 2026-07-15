export class ExternalApiError extends Error {
  constructor(
    public readonly source: string,
    message: string,
  ) {
    super(message);
    this.name = 'ExternalApiError';
  }
}
