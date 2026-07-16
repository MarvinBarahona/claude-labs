import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, tap } from 'rxjs';
import { DocsPanel } from '../shared/docs-panel/docs-panel';
import { InspectorPanel } from '../shared/inspector-panel/inspector-panel';
import type { InspectorCall, InspectorUsage } from '../shared/inspector-panel/inspector-call';
import { ModelPicker } from '../shared/model-picker/model-picker';
import type { ModelChoice } from '../shared/model-picker/model-picker';

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

interface ParsedSseEvent {
  readonly event: string;
  readonly data: unknown;
}

/** Pulls the concatenated text of every `text` content block out of a Messages API response body. */
function extractResponseText(response: unknown): string {
  if (typeof response !== 'object' || response === null) {
    return '';
  }
  const { content } = response as Record<string, unknown>;
  if (!Array.isArray(content)) {
    return '';
  }
  let text = '';
  for (const block of content) {
    if (typeof block !== 'object' || block === null) {
      continue;
    }
    const { type, text: blockText } = block as Record<string, unknown>;
    if (type === 'text' && typeof blockText === 'string') {
      text += blockText;
    }
  }
  return text;
}

/** Parses one `event: <type>\ndata: <json>` SSE frame (blank-line-terminated) into a typed event. */
function parseSseFrame(frame: string): ParsedSseEvent | null {
  let eventType = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      eventType = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  try {
    return { event: eventType, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

const NO_CALL_YET: InspectorCall = { request: null };

@Component({
  selector: 'app-messages-console',
  imports: [DocsPanel, InspectorPanel, ModelPicker],
  templateUrl: './messages-console.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesConsole {
  private readonly http = inject(HttpClient);

  protected readonly modelChoice = signal<ModelChoice>('default');
  protected readonly systemPrompt = signal('');
  protected readonly temperature = signal(0.7);
  protected readonly streamingEnabled = signal(false);

  protected readonly messages = signal<readonly TranscriptMessage[]>([]);
  protected readonly draftMessage = signal('');
  protected readonly transcriptError = signal<string | null>(null);

  private readonly streamingInProgress = signal(false);
  private readonly streamingAssistantText = signal('');
  private readonly streamEventsBuffer = signal<readonly unknown[]>([]);

  protected readonly displayMessages = computed<readonly TranscriptMessage[]>(() => {
    const base = this.messages();
    const pending = this.streamingAssistantText();
    if (this.streamingInProgress() && pending) {
      return [...base, { role: 'assistant', text: pending }];
    }
    return base;
  });

  protected readonly inspectorCall = signal<InspectorCall>(NO_CALL_YET);

  // Non-streaming send: same trigger-signal → switchMap → toSignal() shape as DocsPanel.
  private readonly turnTrigger = signal<TurnRequestBody | null>(null);
  private readonly turnResult = toSignal(
    toObservable(this.turnTrigger).pipe(
      switchMap((body) => {
        if (!body) {
          return of(null);
        }
        return this.http.post<TurnEnvelope>('/api/messages-console/turn', body).pipe(
          tap((envelope) => this.applyTurnEnvelope(envelope)),
          catchError(() => {
            this.transcriptError.set('The request failed. Please try again.');
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

  protected onDraftMessageChange(event: Event): void {
    this.draftMessage.set((event.target as HTMLInputElement).value);
  }

  protected sendTranscriptMessage(): void {
    const text = this.draftMessage().trim();
    if (!text) {
      return;
    }

    const nextMessages = [...this.messages(), { role: 'user' as const, text }];
    this.messages.set(nextMessages);
    this.draftMessage.set('');
    this.transcriptError.set(null);

    const systemPrompt = this.systemPrompt().trim();
    const body: TurnRequestBody = {
      modelChoice: this.modelChoice(),
      ...(systemPrompt ? { systemPrompt } : {}),
      temperature: this.temperature(),
      messages: nextMessages,
      stream: this.streamingEnabled(),
    };

    if (this.streamingEnabled()) {
      void this.sendStreamingMessage(body);
    } else {
      this.turnTrigger.set(body);
    }
  }

  private applyTurnEnvelope(envelope: TurnEnvelope): void {
    this.messages.update((msgs) => [
      ...msgs,
      { role: 'assistant', text: extractResponseText(envelope.response) },
    ]);
    this.inspectorCall.set({
      request: envelope.request,
      response: envelope.response,
      stopReason: envelope.stopReason,
      usage: envelope.usage,
    });
    this.transcriptError.set(null);
  }

  private async sendStreamingMessage(body: TurnRequestBody): Promise<void> {
    this.streamingInProgress.set(true);
    this.streamingAssistantText.set('');
    this.streamEventsBuffer.set([]);
    this.inspectorCall.set({ request: body, streamEvents: [] });

    try {
      const response = await fetch('/api/messages-console/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;

      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        if (chunk.value) {
          buffer += decoder.decode(chunk.value, { stream: !done });
        }

        let boundaryIndex = buffer.indexOf('\n\n');
        while (boundaryIndex !== -1) {
          const frame = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + 2);
          this.handleStreamEvent(parseSseFrame(frame), body);
          boundaryIndex = buffer.indexOf('\n\n');
        }
      }
    } catch {
      this.transcriptError.set('The streaming request failed. Please try again.');
    } finally {
      this.streamingInProgress.set(false);
    }
  }

  private handleStreamEvent(parsed: ParsedSseEvent | null, requestBody: TurnRequestBody): void {
    if (!parsed) {
      return;
    }

    if (parsed.event === 'turn_complete') {
      const envelope = parsed.data as TurnEnvelope;
      this.streamingAssistantText.set('');
      this.messages.update((msgs) => [
        ...msgs,
        { role: 'assistant', text: extractResponseText(envelope.response) },
      ]);
      this.inspectorCall.set({
        request: envelope.request,
        response: envelope.response,
        streamEvents: this.streamEventsBuffer(),
        stopReason: envelope.stopReason,
        usage: envelope.usage,
      });
      this.transcriptError.set(null);
      return;
    }

    if (parsed.event === 'error') {
      const { error } = parsed.data as Record<string, unknown>;
      const { message } = (error ?? {}) as Record<string, unknown>;
      this.transcriptError.set(typeof message === 'string' ? message : 'The streaming request failed.');
      this.streamEventsBuffer.update((events) => [...events, parsed.data]);
      this.inspectorCall.set({ request: requestBody, streamEvents: this.streamEventsBuffer() });
      return;
    }

    this.streamEventsBuffer.update((events) => [...events, parsed.data]);
    this.inspectorCall.set({ request: requestBody, streamEvents: this.streamEventsBuffer() });

    if (parsed.event === 'content_block_delta') {
      const { delta } = parsed.data as Record<string, unknown>;
      if (typeof delta === 'object' && delta !== null) {
        const { type, text } = delta as Record<string, unknown>;
        if (type === 'text_delta' && typeof text === 'string') {
          this.streamingAssistantText.update((current) => current + text);
        }
      }
    }
  }
}
