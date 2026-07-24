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
import { ChatTranscript } from '../shared/chat-transcript/chat-transcript';
import type { ChatTranscriptTurn } from '../shared/chat-transcript/chat-transcript';
import { extractResponseText } from '../shared/anthropic-content/anthropic-content';
import { extractErrorMessage } from '../shared/http-error/extract-error-message';
import { raceWithMinDuration, waitOutMinDuration } from '../shared/min-duration/min-duration';
import { readSseStream } from '../shared/sse/sse';
import type { ParsedSseEvent } from '../shared/sse/sse';

interface TranscriptMessage {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

interface TurnRequestBody {
  readonly modelChoice: ModelChoice;
  readonly systemPrompt?: string;
  readonly temperature?: number;
  readonly messages: readonly TranscriptMessage[];
  readonly stream: boolean;
}

interface TurnEnvelope {
  readonly request: unknown;
  readonly response: unknown;
  readonly usage?: InspectorUsage;
  readonly stopReason: string | null;
}

type TurnOutcome = { ok: true; envelope: TurnEnvelope } | { ok: false; message: string };

/** Flattens turns back into the alternating user/assistant history the API expects. */
function buildMessageHistory(turns: readonly ChatTranscriptTurn[]): TranscriptMessage[] {
  const messages: TranscriptMessage[] = [];
  for (const turn of turns) {
    messages.push({ role: 'user', text: turn.question });
    if (turn.answerMarkdown !== null) {
      messages.push({ role: 'assistant', text: turn.answerMarkdown });
    }
  }
  return messages;
}

/** Fake mode answers near-instantly, which would otherwise make the pending-turn skeleton flash by unreadably. */
const MIN_TURN_MS = 500;

@Component({
  selector: 'app-messages-console',
  imports: [DocsPanel, InspectorPanel, ModelPicker, ChatTranscript],
  templateUrl: './messages-console.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesConsole {
  private readonly http = inject(HttpClient);

  protected readonly modelChoice = signal<ModelChoice>('default');
  protected readonly systemPrompt = signal('');
  protected readonly temperature = signal(0.7);
  protected readonly streamingEnabled = signal(false);

  protected readonly turns = signal<readonly ChatTranscriptTurn[]>([]);
  protected readonly pendingAnswerMarkdown = signal('');
  protected readonly transcriptError = signal<string | null>(null);
  protected readonly isSending = signal(false);

  private readonly streamEventsBuffer = signal<readonly unknown[]>([]);

  protected readonly inspectorCall = signal<InspectorCall>(NO_CALL_YET);

  // Non-streaming send: same trigger-signal → switchMap → toSignal() shape as DocsPanel, raced against MIN_TURN_MS per loading-states.md.
  private readonly turnTrigger = signal<TurnRequestBody | null>(null);
  private readonly turnResult = toSignal(
    toObservable(this.turnTrigger).pipe(
      switchMap((body) => {
        if (!body) {
          return of(null);
        }
        return raceWithMinDuration(
          this.http.post<TurnEnvelope>('/api/messages-console/turn', body).pipe(
            map((envelope): TurnOutcome => ({ ok: true, envelope })),
            catchError((err) =>
              of<TurnOutcome>({
                ok: false,
                message: extractErrorMessage(err, 'The request failed. Please try again.'),
              }),
            ),
          ),
          MIN_TURN_MS,
        ).pipe(
          tap((outcome) => {
            if (outcome.ok) {
              this.applyAnswerText(extractResponseText(outcome.envelope.response));
              this.inspectorCall.set({
                request: outcome.envelope.request,
                response: outcome.envelope.response,
                stopReason: outcome.envelope.stopReason,
                usage: outcome.envelope.usage,
              });
              this.transcriptError.set(null);
              this.isSending.set(false);
              this.pendingAnswerMarkdown.set('');
            } else {
              this.failLastTurn(outcome.message);
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

  protected onSystemPromptChange(event: Event): void {
    this.systemPrompt.set((event.target as HTMLTextAreaElement).value);
  }

  protected onTemperatureChange(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    this.temperature.set(Math.min(1, Math.max(0, raw)));
  }

  protected onStreamingToggle(event: Event): void {
    this.streamingEnabled.set((event.target as HTMLInputElement).checked);
  }

  protected onSend(question: string): void {
    if (this.isSending()) {
      return;
    }

    this.turns.update((turns) => [...turns, { question, answerMarkdown: null }]);
    this.transcriptError.set(null);
    this.isSending.set(true);
    this.pendingAnswerMarkdown.set('');

    const systemPrompt = this.systemPrompt().trim();
    const body: TurnRequestBody = {
      modelChoice: this.modelChoice(),
      ...(systemPrompt ? { systemPrompt } : {}),
      ...(this.modelChoice() === 'classification' ? { temperature: this.temperature() } : {}),
      messages: buildMessageHistory(this.turns()),
      stream: this.streamingEnabled(),
    };

    if (this.streamingEnabled()) {
      void this.sendStreamingMessage(body);
    } else {
      this.turnTrigger.set(body);
    }
  }

  private applyAnswerText(text: string): void {
    this.turns.update((turns) => {
      if (turns.length === 0) {
        return turns;
      }
      const updated = [...turns];
      updated[updated.length - 1] = { ...updated[updated.length - 1], answerMarkdown: text };
      return updated;
    });
  }

  /** Drops the still-pending last turn (question with no answer) so a failed send doesn't leave a stuck skeleton. */
  private failLastTurn(message: string): void {
    this.turns.update((turns) => turns.slice(0, -1));
    this.transcriptError.set(message);
    this.isSending.set(false);
    this.pendingAnswerMarkdown.set('');
  }

  private async sendStreamingMessage(body: TurnRequestBody): Promise<void> {
    const startedAt = Date.now();
    this.streamEventsBuffer.set([]);
    this.inspectorCall.set({ request: body, streamEvents: [] });

    try {
      const response = await fetch('/api/messages-console/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      await readSseStream(response, (parsed) => this.handleStreamEvent(parsed, body, startedAt));
    } catch {
      await waitOutMinDuration(startedAt, MIN_TURN_MS);
      this.failLastTurn('The streaming request failed. Please try again.');
    }
  }

  private async handleStreamEvent(
    parsed: ParsedSseEvent,
    requestBody: TurnRequestBody,
    startedAt: number,
  ): Promise<void> {
    if (parsed.event === 'turn_complete') {
      const envelope = parsed.data as TurnEnvelope;
      await waitOutMinDuration(startedAt, MIN_TURN_MS);
      this.applyAnswerText(extractResponseText(envelope.response));
      this.inspectorCall.set({
        request: envelope.request,
        response: envelope.response,
        streamEvents: this.streamEventsBuffer(),
        stopReason: envelope.stopReason,
        usage: envelope.usage,
      });
      this.transcriptError.set(null);
      this.isSending.set(false);
      this.pendingAnswerMarkdown.set('');
      return;
    }

    if (parsed.event === 'error') {
      const { error } = parsed.data as Record<string, unknown>;
      const { message } = (error ?? {}) as Record<string, unknown>;
      await waitOutMinDuration(startedAt, MIN_TURN_MS);
      this.failLastTurn(typeof message === 'string' ? message : 'The streaming request failed.');
      return;
    }

    this.streamEventsBuffer.update((events) => [...events, parsed.data]);
    this.inspectorCall.set({ request: requestBody, streamEvents: this.streamEventsBuffer() });

    if (parsed.event === 'content_block_delta') {
      const { delta } = parsed.data as Record<string, unknown>;
      if (typeof delta === 'object' && delta !== null) {
        const { type, text } = delta as Record<string, unknown>;
        if (type === 'text_delta' && typeof text === 'string') {
          this.pendingAnswerMarkdown.update((current) => current + text);
        }
      }
    }
  }
}
