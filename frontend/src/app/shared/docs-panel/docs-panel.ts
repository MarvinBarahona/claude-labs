import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of, switchMap, timer } from 'rxjs';
import { marked } from 'marked';
import { Skeleton } from '../skeleton/skeleton';

type DocsPanelState =
  { status: 'loading' } | { status: 'loaded'; html: string } | { status: 'error' };

const LOADING: DocsPanelState = { status: 'loading' };
const MIN_LOADING_MS = 500;

@Component({
  selector: 'app-docs-panel',
  imports: [Skeleton],
  templateUrl: './docs-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsPanel {
  readonly slug = input.required<string>();

  private readonly http = inject(HttpClient);

  private readonly state = toSignal(
    toObservable(this.slug).pipe(
      switchMap((slug) =>
        forkJoin([
          this.http.get(`/lab-docs/${slug}.md`, { responseType: 'text' }).pipe(
            map((markdown): DocsPanelState => ({
              status: 'loaded',
              html: marked.parse(markdown, { async: false }),
            })),
            catchError(() => of<DocsPanelState>({ status: 'error' })),
          ),
          timer(MIN_LOADING_MS),
        ]).pipe(map(([state]) => state)),
      ),
    ),
    { initialValue: LOADING },
  );

  protected readonly isLoading = computed(() => this.state().status === 'loading');
  protected readonly isError = computed(() => this.state().status === 'error');
  protected readonly html = computed(() => {
    const current = this.state();
    return current.status === 'loaded' ? current.html : null;
  });
}
