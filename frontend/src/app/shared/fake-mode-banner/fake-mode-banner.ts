import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

interface ModeResponse {
  fakeMode: boolean;
  repoUrl?: string;
}

const REAL_MODE: ModeResponse = { fakeMode: false };

@Component({
  selector: 'app-fake-mode-banner',
  templateUrl: './fake-mode-banner.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FakeModeBanner {
  private readonly http = inject(HttpClient);

  private readonly mode = toSignal(
    this.http.get<ModeResponse>('/api/mode').pipe(catchError(() => of(REAL_MODE))),
    { initialValue: REAL_MODE },
  );

  protected readonly fakeMode = computed(() => this.mode().fakeMode);
  protected readonly repoUrl = computed(() => this.mode().repoUrl);
}
