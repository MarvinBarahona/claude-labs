import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

export interface AppMode {
  readonly fakeMode: boolean;
  readonly repoUrl?: string;
  readonly keyStatus?: 'valid' | 'invalid';
}

const UNKNOWN_MODE: AppMode = { fakeMode: false, keyStatus: 'valid' };

/** Single shared fetch of GET /api/mode — every consumer reads the same signal instead of each issuing its own request. */
@Injectable({ providedIn: 'root' })
export class AppModeService {
  private readonly http = inject(HttpClient);

  readonly mode = toSignal(
    this.http.get<AppMode>('/api/mode').pipe(catchError(() => of(UNKNOWN_MODE))),
    { initialValue: UNKNOWN_MODE },
  );
}
