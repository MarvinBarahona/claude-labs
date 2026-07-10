import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { HlmButton } from '@spartan-ng/helm/button';

@Component({
  selector: 'app-root',
  imports: [HlmButton],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly http = inject(HttpClient);
  protected readonly retry = signal(0);
  protected readonly smokeTest = toSignal(
    toObservable(this.retry).pipe(
      switchMap(() => this.http.get<{ message: string }>('/api/smoke-test')),
    ),
  );

  protected reload(): void {
    this.retry.update((value) => value + 1);
  }
}
