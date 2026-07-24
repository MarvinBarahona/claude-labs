import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import {
  deriveToolActivityFromCalls,
  extractResponseText,
  findLastRunningIndex,
} from '../shared/anthropic-content/anthropic-content';
import type { CallPair, ToolActivityEntry } from '../shared/anthropic-content/anthropic-content';
import { extractErrorMessage } from '../shared/http-error/extract-error-message';
import { raceWithMinDuration, waitOutMinDuration } from '../shared/min-duration/min-duration';
import { readSseStream } from '../shared/sse/sse';
import type { ParsedSseEvent } from '../shared/sse/sse';

interface LiveToolUseConsoleConfig {
  readonly targetRepo: string;
}

interface TurnRequestBody {
  readonly modelChoice: ModelChoice;
  readonly question: string;
  readonly stream: boolean;
}

interface TurnEnvelope {
  readonly request: unknown;
  readonly response: unknown;
  readonly calls?: readonly CallPair[];
  readonly usage?: InspectorUsage;
  readonly stopReason: string | null;
}

type TurnOutcome = { ok: true; envelope: TurnEnvelope } | { ok: false; message: string };

// Fake-mode responses are near-instant, which would otherwise make the Answer/Tool Activity skeletons flash by unreadably.
const MIN_ASKING_MS = 500;

@Component({
  selector: 'app-live-tool-use-console',
  imports: [DocsPanel, InspectorPanel, ModelPicker, Skeleton],
  templateUrl: './live-tool-use-console.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveToolUseConsole {
  private readonly http = inject(HttpClient);

  protected readonly modelChoice = signal<ModelChoice>('default');
  protected readonly question = signal('');
  protected readonly streamingEnabled = signal(false);

  // The repo get_repo_stats actually queries — named in the question placeholder so "a repo" isn't left vague.
  private readonly config = toSignal(
    this.http
      .get<LiveToolUseConsoleConfig>('/api/live-tool-use-console/config')
      .pipe(catchError(() => of(null))),
    { initialValue: null },
  );
  protected readonly questionPlaceholder = computed(() => {
    const targetRepo = this.config()?.targetRepo;
    return targetRepo ? `Ask about the weather or the ${targetRepo} repo…` : 'Ask about the weather or a repo…';
  });

  // True from Ask until the turn resolves — drives the Answer/Tool Activity skeletons so a second-onward ask doesn't blank those sections while it loads.
  protected readonly isAsking = signal(false);

  protected readonly answerText = signal('');
  protected readonly toolActivity = signal<readonly ToolActivityEntry[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly inspectorCall = signal<InspectorCall>(NO_CALL_YET);

  // Non-streaming ask: trigger-signal → switchMap → toSignal(), raced against MIN_ASKING_MS.
  private readonly turnTrigger = signal<TurnRequestBody | null>(null);
  private readonly turnResult = toSignal(
    toObservable(this.turnTrigger).pipe(
      switchMap((body) => {
        if (!body) {
          return of(null);
        }
        return raceWithMinDuration(
          this.http.post<TurnEnvelope>('/api/live-tool-use-console/turn', body).pipe(
            map((envelope): TurnOutcome => ({ ok: true, envelope })),
            catchError((err) =>
              of<TurnOutcome>({
                ok: false,
                message: extractErrorMessage(err, 'The request failed. Please try again.'),
              }),
            ),
          ),
          MIN_ASKING_MS,
        ).pipe(
          tap((outcome) => {
            if (outcome.ok) {
              this.applyTurnEnvelope(outcome.envelope);
            } else {
              this.errorMessage.set(outcome.message);
              this.isAsking.set(false);
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

  protected onQuestionChange(event: Event): void {
    this.question.set((event.target as HTMLInputElement).value);
  }

  protected onStreamingToggle(event: Event): void {
    this.streamingEnabled.set((event.target as HTMLInputElement).checked);
  }

  protected askQuestion(): void {
    const question = this.question().trim();
    if (!question) {
      return;
    }

    this.errorMessage.set(null);
    this.isAsking.set(true);
    this.answerText.set('');
    this.toolActivity.set([]);

    const body: TurnRequestBody = {
      modelChoice: this.modelChoice(),
      question,
      stream: this.streamingEnabled(),
    };

    if (this.streamingEnabled()) {
      void this.askStreaming(body);
    } else {
      this.turnTrigger.set(body);
    }
  }

  private applyTurnEnvelope(envelope: TurnEnvelope): void {
    this.answerText.set(extractResponseText(envelope.response));
    this.toolActivity.set(
      deriveToolActivityFromCalls(envelope.calls, { request: envelope.request, response: envelope.response }),
    );
    this.inspectorCall.set({
      request: envelope.request,
      response: envelope.response,
      calls: envelope.calls,
      stopReason: envelope.stopReason,
      usage: envelope.usage,
    });
    this.errorMessage.set(null);
    this.isAsking.set(false);
  }

  private async askStreaming(body: TurnRequestBody): Promise<void> {
    const startedAt = Date.now();
    this.inspectorCall.set({ request: body, streamEvents: [] });
    const streamEventsBuffer: unknown[] = [];

    try {
      const response = await fetch('/api/live-tool-use-console/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      await readSseStream(response, (parsed) =>
        this.handleStreamEvent(parsed, body, streamEventsBuffer, startedAt),
      );
    } catch {
      await waitOutMinDuration(startedAt, MIN_ASKING_MS);
      this.errorMessage.set('The streaming request failed. Please try again.');
      this.isAsking.set(false);
    }
  }

  private async handleStreamEvent(
    parsed: ParsedSseEvent,
    requestBody: TurnRequestBody,
    streamEventsBuffer: unknown[],
    startedAt: number,
  ): Promise<void> {
    if (parsed.event === 'turn_complete') {
      const envelope = parsed.data as TurnEnvelope;
      await waitOutMinDuration(startedAt, MIN_ASKING_MS);
      this.applyTurnEnvelope(envelope);
      return;
    }

    if (parsed.event === 'error') {
      const { error } = parsed.data as Record<string, unknown>;
      const { message } = (error ?? {}) as Record<string, unknown>;
      await waitOutMinDuration(startedAt, MIN_ASKING_MS);
      this.errorMessage.set(typeof message === 'string' ? message : 'The streaming request failed.');
      this.isAsking.set(false);
      return;
    }

    if (parsed.event === 'tool_call_start') {
      const { name, input } = parsed.data as Record<string, unknown>;
      if (typeof name === 'string') {
        this.toolActivity.update((activity) => [...activity, { name, status: 'running', input }]);
      }
      return;
    }

    if (parsed.event === 'tool_call_result') {
      const { name, result, isError } = parsed.data as Record<string, unknown>;
      if (typeof name === 'string') {
        this.toolActivity.update((activity) => {
          const index = findLastRunningIndex(activity, name);
          if (index === -1) {
            return activity;
          }
          const updated = [...activity];
          updated[index] = { ...updated[index], status: 'done', result, isError: Boolean(isError) };
          return updated;
        });
      }
      return;
    }

    streamEventsBuffer.push(parsed.data);
    this.inspectorCall.set({ request: requestBody, streamEvents: [...streamEventsBuffer] });

    if (parsed.event === 'content_block_delta') {
      const { delta } = parsed.data as Record<string, unknown>;
      if (typeof delta === 'object' && delta !== null) {
        const { type, text } = delta as Record<string, unknown>;
        if (type === 'text_delta' && typeof text === 'string') {
          this.answerText.update((current) => current + text);
        }
      }
    }
  }
}
