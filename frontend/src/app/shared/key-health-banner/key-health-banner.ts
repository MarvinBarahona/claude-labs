import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

interface ModeResponse {
  fakeMode: boolean;
  keyStatus?: 'valid' | 'invalid';
}

const UNKNOWN_MODE: ModeResponse = { fakeMode: false, keyStatus: 'valid' };

@Component({
  selector: 'app-key-health-banner',
  templateUrl: './key-health-banner.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyHealthBanner {
  private readonly http = inject(HttpClient);

  private readonly mode = toSignal(
    this.http.get<ModeResponse>('/api/mode').pipe(catchError(() => of(UNKNOWN_MODE))),
    { initialValue: UNKNOWN_MODE },
  );

  protected readonly keyInvalid = computed(() => this.mode().keyStatus === 'invalid');
}
