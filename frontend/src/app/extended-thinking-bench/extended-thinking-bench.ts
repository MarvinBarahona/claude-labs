import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { DocsPanel } from '../shared/docs-panel/docs-panel';
import { InspectorPanel } from '../shared/inspector-panel/inspector-panel';
import { NO_CALL_YET } from '../shared/inspector-panel/inspector-call';
import type { InspectorCall, InspectorUsage } from '../shared/inspector-panel/inspector-call';
import { Skeleton } from '../shared/skeleton/skeleton';
import { extractErrorMessage } from '../shared/http-error/extract-error-message';
import { raceWithMinDuration } from '../shared/min-duration/min-duration';

type ThinkingRunLabel = 'thinking-off' | 'thinking-medium' | 'thinking-high';

interface ExtendedThinkingBenchIssue {
  readonly number: number;
  readonly title: string;
}

interface IssuesResponse {
  readonly issues: readonly ExtendedThinkingBenchIssue[];
}

interface RunRequestBody {
  readonly issueNumber: number;
}

interface RunEnvelope {
  readonly request: unknown;
  readonly response: unknown;
  readonly usage?: InspectorUsage;
  readonly stopReason: string | null;
}

interface ComparisonRun {
  readonly label: ThinkingRunLabel;
  readonly envelope: RunEnvelope;
  readonly latencyMs: number;
  readonly answer: string;
  readonly reasoningTrace: string | null;
}

interface RunResponseBody {
  readonly issue: ExtendedThinkingBenchIssue;
  readonly runs: readonly ComparisonRun[];
}

interface ComparisonColumn {
  readonly heading: string;
}

const COLUMN_HEADINGS: Readonly<Record<ThinkingRunLabel, string>> = {
  'thinking-off': 'Thinking Off',
  'thinking-medium': 'Thinking — Medium Effort',
  'thinking-high': 'Thinking — High Effort',
};

type RunOutcome = { ok: true; body: RunResponseBody } | { ok: false; message: string };

// Fake-mode responses are near-instant — hold the skeleton for at least this long to stay readable.
const MIN_RUN_MS = 500;

@Component({
  selector: 'app-extended-thinking-bench',
  imports: [DocsPanel, InspectorPanel, Skeleton],
  templateUrl: './extended-thinking-bench.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtendedThinkingBench {
  private readonly http = inject(HttpClient);

  protected readonly issues = toSignal(
    this.http.get<IssuesResponse>('/api/extended-thinking-bench/issues').pipe(
      map((response) => response.issues),
      catchError(() => of<readonly ExtendedThinkingBenchIssue[]>([])),
    ),
    { initialValue: [] as readonly ExtendedThinkingBenchIssue[] },
  );

  protected readonly skeletonColumns: readonly ComparisonColumn[] = [
    { heading: COLUMN_HEADINGS['thinking-off'] },
    { heading: COLUMN_HEADINGS['thinking-medium'] },
    { heading: COLUMN_HEADINGS['thinking-high'] },
  ];

  protected readonly selectedIssueNumber = signal<number | null>(null);

  // A <select> with a disabled first option auto-displays the next option without firing `change` — this keeps selectedIssueNumber in sync with what's already shown, instead of leaving Run silently (and invisibly) disabled.
  private readonly autoSelectFirstIssue = effect(() => {
    const list = this.issues();
    if (list.length > 0 && this.selectedIssueNumber() === null) {
      this.selectedIssueNumber.set(list[0].number);
    }
  });

  protected readonly isRunning = signal(false);

  protected readonly runs = signal<readonly ComparisonRun[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly inspectorCalls = signal<readonly InspectorCall[]>([
    NO_CALL_YET,
    NO_CALL_YET,
    NO_CALL_YET,
  ]);

  // Raced against a floor timer (MIN_RUN_MS) so a near-instant response is never applied too soon.
  private readonly trigger = signal<RunRequestBody | null>(null);
  private readonly runResult = toSignal(
    toObservable(this.trigger).pipe(
      switchMap((body) => {
        if (!body) {
          return of(null);
        }
        return raceWithMinDuration(
          this.http.post<RunResponseBody>('/api/extended-thinking-bench/run', body).pipe(
            map((responseBody): RunOutcome => ({ ok: true, body: responseBody })),
            catchError((err) =>
              of<RunOutcome>({
                ok: false,
                message: extractErrorMessage(err, 'The request failed. Please try again.'),
              }),
            ),
          ),
          MIN_RUN_MS,
        ).pipe(
          tap((outcome) => {
            if (outcome.ok) {
              this.applyResult(outcome.body);
            } else {
              this.error.set(outcome.message);
              this.isRunning.set(false);
            }
          }),
        );
      }),
    ),
    { initialValue: null },
  );

  protected columnHeading(label: ThinkingRunLabel): string {
    return COLUMN_HEADINGS[label];
  }

  protected onIssueChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedIssueNumber.set(value ? Number(value) : null);
  }

  protected run(): void {
    const issueNumber = this.selectedIssueNumber();
    if (issueNumber === null || this.isRunning()) {
      return;
    }

    this.error.set(null);
    this.isRunning.set(true);
    this.runs.set(null);
    this.trigger.set({ issueNumber });
  }

  private applyResult(body: RunResponseBody): void {
    this.runs.set(body.runs);
    this.inspectorCalls.set(
      body.runs.map((run) => ({
        request: run.envelope.request,
        response: run.envelope.response,
        stopReason: run.envelope.stopReason,
        usage: run.envelope.usage,
      })),
    );
    this.error.set(null);
    this.isRunning.set(false);
  }
}
