import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of, switchMap, tap, timer } from 'rxjs';
import { DocsPanel } from '../shared/docs-panel/docs-panel';
import { InspectorPanel } from '../shared/inspector-panel/inspector-panel';
import type { InspectorCall, InspectorUsage } from '../shared/inspector-panel/inspector-call';
import { Skeleton } from '../shared/skeleton/skeleton';

const MIN_SEARCHES = 1;
const MAX_SEARCHES = 10;
const DEFAULT_MAX_SEARCHES = 5;

// Fake-mode responses are near-instant — hold the skeleton for at least this long to stay readable.
const MIN_RUN_MS = 500;

interface WebRepoResearchReporterConfig {
  readonly targetRepo: string;
}

interface RunRequestBody {
  readonly question: string;
  readonly maxSearches: number;
}

interface Finding {
  readonly claim: string;
  readonly source: string;
}

interface ResearchBrief {
  readonly summary: string;
  readonly findings: readonly Finding[];
}

interface ResearchEnvelope {
  readonly request: unknown;
  readonly response: unknown;
  readonly usage?: InspectorUsage;
  readonly stopReason: string | null;
  readonly brief: ResearchBrief;
  readonly searchesPerformed: number;
  readonly mcpCallsPerformed: number;
}

interface RunResult {
  readonly brief: ResearchBrief;
  readonly searchesPerformed: number;
  readonly mcpCallsPerformed: number;
}

type RunOutcome = { ok: true; envelope: ResearchEnvelope } | { ok: false };

const NO_CALL_YET: InspectorCall = { request: null };

@Component({
  selector: 'app-web-repo-research-reporter',
  imports: [DocsPanel, InspectorPanel, Skeleton],
  templateUrl: './web-repo-research-reporter.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebRepoResearchReporter {
  private readonly http = inject(HttpClient);

  protected readonly minSearches = MIN_SEARCHES;
  protected readonly maxSearchesLimit = MAX_SEARCHES;

  // The repo this lab actually researches — named in the question placeholder so "the repo" isn't left vague.
  private readonly config = toSignal(
    this.http
      .get<WebRepoResearchReporterConfig>('/api/web-repo-research-reporter/config')
      .pipe(catchError(() => of(null))),
    { initialValue: null },
  );
  protected readonly questionPlaceholder = computed(() => {
    const targetRepo = this.config()?.targetRepo;
    return targetRepo
      ? `Ask a research question about the ${targetRepo} repo or its ecosystem…`
      : 'Ask a research question about the repo or its ecosystem…';
  });

  protected readonly question = signal('');
  protected readonly maxSearches = signal(DEFAULT_MAX_SEARCHES);
  protected readonly isRunning = signal(false);

  protected readonly result = signal<RunResult | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly inspectorCall = signal<InspectorCall>(NO_CALL_YET);

  // Raced against a floor timer (MIN_RUN_MS) so a near-instant response is never applied too soon.
  private readonly trigger = signal<RunRequestBody | null>(null);
  private readonly runResult = toSignal(
    toObservable(this.trigger).pipe(
      switchMap((body) => {
        if (!body) {
          return of(null);
        }
        return forkJoin([
          this.http.post<ResearchEnvelope>('/api/web-repo-research-reporter/run', body).pipe(
            map((envelope): RunOutcome => ({ ok: true, envelope })),
            catchError(() => of<RunOutcome>({ ok: false })),
          ),
          timer(MIN_RUN_MS),
        ]).pipe(
          map(([outcome]) => outcome),
          tap((outcome) => {
            if (outcome.ok) {
              this.applyEnvelope(outcome.envelope);
            } else {
              this.error.set('The request failed. Please try again.');
              this.isRunning.set(false);
            }
          }),
        );
      }),
    ),
    { initialValue: null },
  );

  protected onQuestionChange(event: Event): void {
    this.question.set((event.target as HTMLTextAreaElement).value);
  }

  protected onMaxSearchesChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isInteger(value) && value >= MIN_SEARCHES && value <= MAX_SEARCHES) {
      this.maxSearches.set(value);
    }
  }

  protected run(): void {
    const question = this.question().trim();
    if (!question) {
      return;
    }

    this.error.set(null);
    this.isRunning.set(true);
    this.trigger.set({ question, maxSearches: this.maxSearches() });
  }

  private applyEnvelope(envelope: ResearchEnvelope): void {
    this.result.set({
      brief: envelope.brief,
      searchesPerformed: envelope.searchesPerformed,
      mcpCallsPerformed: envelope.mcpCallsPerformed,
    });
    this.inspectorCall.set({
      request: envelope.request,
      response: envelope.response,
      stopReason: envelope.stopReason,
      usage: envelope.usage,
    });
    this.error.set(null);
    this.isRunning.set(false);
  }
}
