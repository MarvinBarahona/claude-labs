import { HttpErrorResponse } from '@angular/common/http';

/** Pulls the backend's own `{ error: { message } }` body out of a failed HttpClient request, falling back when the response wasn't shaped that way (e.g. an upstream 502 with no JSON body). */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error;
    if (body && typeof body === 'object') {
      const errorField = (body as Record<string, unknown>)['error'];
      if (errorField && typeof errorField === 'object') {
        const message = (errorField as Record<string, unknown>)['message'];
        if (typeof message === 'string' && message) {
          return message;
        }
      }
    }
  }
  return fallback;
}
