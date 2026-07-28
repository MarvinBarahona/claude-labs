import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { DocsPanel } from '../shared/docs-panel/docs-panel';
import { InspectorPanel } from '../shared/inspector-panel/inspector-panel';
import { NO_CALL_YET } from '../shared/inspector-panel/inspector-call';
import type { InspectorCall, InspectorUsage } from '../shared/inspector-panel/inspector-call';
import { ModelPicker } from '../shared/model-picker/model-picker';
import type { ModelChoice } from '../shared/model-picker/model-picker';
import { Skeleton } from '../shared/skeleton/skeleton';
import { extractErrorMessage } from '../shared/http-error/extract-error-message';
import { raceWithMinDuration } from '../shared/min-duration/min-duration';

interface StructuredRequestBody {
  readonly modelChoice: ModelChoice;
  readonly input: string;
}

interface StructuredParsed {
  readonly summary: string;
  readonly sentiment: 'positive' | 'neutral' | 'negative';
  readonly actionItems: readonly string[];
}

interface StructuredEnvelope {
  readonly request: unknown;
  readonly response: unknown;
  readonly usage?: InspectorUsage;
  readonly stopReason: string | null;
  readonly parsed: StructuredParsed;
}

type RunOutcome = { ok: true; envelope: StructuredEnvelope } | { ok: false; message: string };

const MIN_RUN_MS = 500;

@Component({
  selector: 'app-structured-output-console',
  imports: [DocsPanel, InspectorPanel, ModelPicker, Skeleton],
  templateUrl: './structured-output-console.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StructuredOutputConsole {
  private readonly http = inject(HttpClient);

  protected readonly modelChoice = signal<ModelChoice>('default');
  protected readonly input = signal('');
  protected readonly isRunning = signal(false);
  protected readonly result = signal<StructuredParsed | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly inspectorCall = signal<InspectorCall>(NO_CALL_YET);

  // Non-streaming send: same trigger-signal → switchMap → toSignal() shape as MessagesConsole.
  private readonly trigger = signal<StructuredRequestBody | null>(null);
  private readonly httpResult = toSignal(
    toObservable(this.trigger).pipe(
      switchMap((body) => {
        if (!body) {
          return of(null);
        }
        return raceWithMinDuration(
          this.http.post<StructuredEnvelope>('/api/structured-output-console/run', body).pipe(
            map((envelope): RunOutcome => ({ ok: true, envelope })),
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
              this.applyEnvelope(outcome.envelope);
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

  protected onModelChoiceChange(value: ModelChoice): void {
    this.modelChoice.set(value);
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected run(): void {
    const input = this.input().trim();
    if (!input || this.isRunning()) {
      return;
    }
    this.error.set(null);
    this.isRunning.set(true);
    this.result.set(null);
    this.trigger.set({ modelChoice: this.modelChoice(), input });
  }

  private applyEnvelope(envelope: StructuredEnvelope): void {
    this.result.set(envelope.parsed);
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
