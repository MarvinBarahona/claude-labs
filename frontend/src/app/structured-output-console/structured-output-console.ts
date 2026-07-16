import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, tap } from 'rxjs';
import { DocsPanel } from '../shared/docs-panel/docs-panel';
import { InspectorPanel } from '../shared/inspector-panel/inspector-panel';
import type { InspectorCall, InspectorUsage } from '../shared/inspector-panel/inspector-call';
import { ModelPicker } from '../shared/model-picker/model-picker';
import type { ModelChoice } from '../shared/model-picker/model-picker';

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

const NO_CALL_YET: InspectorCall = { request: null };

@Component({
  selector: 'app-structured-output-console',
  imports: [DocsPanel, InspectorPanel, ModelPicker],
  templateUrl: './structured-output-console.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StructuredOutputConsole {
  private readonly http = inject(HttpClient);

  protected readonly modelChoice = signal<ModelChoice>('default');
  protected readonly input = signal('');
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
        return this.http.post<StructuredEnvelope>('/api/structured-output-console/run', body).pipe(
          tap((envelope) => this.applyEnvelope(envelope)),
          catchError(() => {
            this.error.set('The request failed. Please try again.');
            return of(null);
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
    if (!input) {
      return;
    }
    this.error.set(null);
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
  }
}
