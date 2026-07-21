import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of, switchMap, tap, timer } from 'rxjs';
import { DocsPanel } from '../shared/docs-panel/docs-panel';
import { InspectorPanel } from '../shared/inspector-panel/inspector-panel';
import type { InspectorCall, InspectorUsage } from '../shared/inspector-panel/inspector-call';
import { Skeleton } from '../shared/skeleton/skeleton';

interface WorkflowGalleryIssue {
  readonly number: number;
  readonly title: string;
}

interface IssuesResponse {
  readonly issues: readonly WorkflowGalleryIssue[];
}

interface RunRequestBody {
  readonly issueNumber: number;
}

interface CallPair {
  readonly request: unknown;
  readonly response: unknown;
}

interface GradingResult {
  readonly criterion: 'tone' | 'technical-accuracy' | 'policy-compliance';
  readonly pass: boolean;
  readonly feedback: string;
}

interface WorkflowGalleryEnvelope {
  readonly request: unknown;
  readonly response: unknown;
  readonly calls: readonly CallPair[];
  readonly usage?: InspectorUsage;
  readonly stopReason: string | null;
  readonly route: 'bug' | 'feature-request' | 'question' | 'support';
  readonly draft: string;
  readonly grading: readonly GradingResult[];
  readonly iterations: number;
  readonly passed: boolean;
  readonly cache: { read: boolean; write: boolean };
}

interface RunResult {
  readonly route: string;
  readonly draft: string;
  readonly grading: readonly GradingResult[];
  readonly iterations: number;
  readonly passed: boolean;
}

type RunOutcome = { ok: true; envelope: WorkflowGalleryEnvelope } | { ok: false };

const NO_CALL_YET: InspectorCall = { request: null };

// Fake-mode responses are near-instant — hold the skeleton for at least this long to stay readable.
const MIN_RUN_MS = 500;

@Component({
  selector: 'app-workflow-gallery',
  imports: [DocsPanel, InspectorPanel, Skeleton],
  templateUrl: './workflow-gallery.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowGallery {
  private readonly http = inject(HttpClient);

  protected readonly issues = toSignal(
    this.http.get<IssuesResponse>('/api/workflow-gallery/issues').pipe(
      map((response) => response.issues),
      catchError(() => of<readonly WorkflowGalleryIssue[]>([])),
    ),
    { initialValue: [] as readonly WorkflowGalleryIssue[] },
  );

  protected readonly selectedIssueNumber = signal<number | null>(null);

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
          this.http.post<WorkflowGalleryEnvelope>('/api/workflow-gallery/run', body).pipe(
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

  protected onIssueChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedIssueNumber.set(value ? Number(value) : null);
  }

  protected run(): void {
    const issueNumber = this.selectedIssueNumber();
    if (issueNumber === null) {
      return;
    }

    this.error.set(null);
    this.isRunning.set(true);
    this.trigger.set({ issueNumber });
  }

  private applyEnvelope(envelope: WorkflowGalleryEnvelope): void {
    this.result.set({
      route: envelope.route,
      draft: envelope.draft,
      grading: envelope.grading,
      iterations: envelope.iterations,
      passed: envelope.passed,
    });
    this.inspectorCall.set({
      request: envelope.request,
      response: envelope.response,
      calls: envelope.calls,
      stopReason: envelope.stopReason,
      usage: envelope.usage,
    });
    this.error.set(null);
    this.isRunning.set(false);
  }
}
