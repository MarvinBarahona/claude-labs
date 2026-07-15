import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, tap } from 'rxjs';
import { DocsPanel } from '../shared/docs-panel/docs-panel';
import { InspectorPanel } from '../shared/inspector-panel/inspector-panel';
import type { InspectorCall, InspectorUsage } from '../shared/inspector-panel/inspector-call';

/** The model picker's 3 options — union order is also the labeled display order (Sonnet/Haiku/Opus). */
type ModelChoice = 'default' | 'classification' | 'hardest-call';

const MODEL_OPTIONS: readonly { value: ModelChoice; label: string }[] = [
  { value: 'default', label: 'Sonnet' },
  { value: 'classification', label: 'Haiku' },
  { value: 'hardest-call', label: 'Opus' },
];

interface TranscriptMessage {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

interface MessagesRequestBody {
  readonly modelChoice: ModelChoice;
  readonly systemPrompt?: string;
  readonly temperature?: number;
  readonly messages: readonly TranscriptMessage[];
  readonly stream: boolean;
}

interface MessagesEnvelope {
  readonly request: unknown;
  readonly response: unknown;
  readonly usage?: InspectorUsage;
  readonly stopReason: string | null;
}

interface StructuredRequestBody {
  readonly modelChoice: ModelChoice;
  readonly input: string;
}

interface StructuredParsed {
  readonly summary: string;
  readonly sentiment: 'positive' | 'neutral' | 'negative';
  readonly actionItems: readonly string[];
}

interface StructuredEnvelope extends MessagesEnvelope {
  readonly parsed: StructuredParsed;
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
  selector: 'app-foundations-console',
  imports: [DocsPanel, InspectorPanel],
  templateUrl: './foundations-console.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoundationsConsole {
  private readonly http = inject(HttpClient);

  protected readonly modelOptions = MODEL_OPTIONS;

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

  protected readonly structuredInput = signal('');
  protected readonly structuredResult = signal<StructuredParsed | null>(null);
  protected readonly structuredError = signal<string | null>(null);

  protected readonly inspectorCall = signal<InspectorCall>(NO_CALL_YET);

  // Non-streaming send: same trigger-signal → switchMap → toSignal() shape as DocsPanel.
  private readonly transcriptTrigger = signal<MessagesRequestBody | null>(null);
  private readonly transcriptResult = toSignal(
    toObservable(this.transcriptTrigger).pipe(
      switchMap((body) => {
        if (!body) {
          return of(null);
        }
        return this.http.post<MessagesEnvelope>('/api/foundations-console/messages', body).pipe(
          tap((envelope) => this.applyTranscriptEnvelope(envelope)),
          catchError(() => {
            this.transcriptError.set('The request failed. Please try again.');
            return of(null);
          }),
        );
      }),
    ),
    { initialValue: null },
  );

  private readonly structuredTrigger = signal<StructuredRequestBody | null>(null);
  private readonly structuredHttpResult = toSignal(
    toObservable(this.structuredTrigger).pipe(
      switchMap((body) => {
        if (!body) {
          return of(null);
        }
        return this.http.post<StructuredEnvelope>('/api/foundations-console/structured', body).pipe(
          tap((envelope) => this.applyStructuredEnvelope(envelope)),
          catchError(() => {
            this.structuredError.set('The request failed. Please try again.');
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

  protected onStructuredInputChange(event: Event): void {
    this.structuredInput.set((event.target as HTMLTextAreaElement).value);
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
    const body: MessagesRequestBody = {
      modelChoice: this.modelChoice(),
      ...(systemPrompt ? { systemPrompt } : {}),
      temperature: this.temperature(),
      messages: nextMessages,
      stream: this.streamingEnabled(),
    };

    if (this.streamingEnabled()) {
      void this.sendStreamingMessage(body);
    } else {
      this.transcriptTrigger.set(body);
    }
  }

  protected runStructuredDemo(): void {
    const input = this.structuredInput().trim();
    if (!input) {
      return;
    }
    this.structuredError.set(null);
    this.structuredTrigger.set({ modelChoice: this.modelChoice(), input });
  }

  private applyTranscriptEnvelope(envelope: MessagesEnvelope): void {
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

  private applyStructuredEnvelope(envelope: StructuredEnvelope): void {
    this.structuredResult.set(envelope.parsed);
    this.inspectorCall.set({
      request: envelope.request,
      response: envelope.response,
      stopReason: envelope.stopReason,
      usage: envelope.usage,
    });
    this.structuredError.set(null);
  }

  private async sendStreamingMessage(body: MessagesRequestBody): Promise<void> {
    this.streamingInProgress.set(true);
    this.streamingAssistantText.set('');
    this.streamEventsBuffer.set([]);
    this.inspectorCall.set({ request: body, streamEvents: [] });

    try {
      const response = await fetch('/api/foundations-console/messages', {
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

  private handleStreamEvent(parsed: ParsedSseEvent | null, requestBody: MessagesRequestBody): void {
    if (!parsed) {
      return;
    }

    if (parsed.event === 'turn_complete') {
      const envelope = parsed.data as MessagesEnvelope;
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
