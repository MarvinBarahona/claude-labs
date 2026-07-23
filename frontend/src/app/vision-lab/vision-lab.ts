import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of, switchMap, tap, timer } from 'rxjs';
import { DocsPanel } from '../shared/docs-panel/docs-panel';
import { InspectorPanel } from '../shared/inspector-panel/inspector-panel';
import type { InspectorCall, InspectorUsage } from '../shared/inspector-panel/inspector-call';
import { Skeleton } from '../shared/skeleton/skeleton';

type DeliveryMode = 'files-api' | 'base64';
type ImageCount = 1 | 2 | 3 | 4;

const DELIVERY_MODE_OPTIONS: readonly { value: DeliveryMode; label: string }[] = [
  { value: 'files-api', label: 'Files API' },
  { value: 'base64', label: 'Base64' },
];

const IMAGE_COUNT_OPTIONS: readonly ImageCount[] = [1, 2, 3, 4];

interface VisionImage {
  readonly url: string;
  readonly title: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

interface RunRequestBody {
  readonly query: string;
  readonly imageCount: ImageCount;
  readonly instruction: string;
  readonly deliveryMode: DeliveryMode;
  readonly stream: boolean;
}

interface RunEnvelope {
  readonly request: unknown;
  readonly response: unknown;
  readonly usage?: InspectorUsage;
  readonly stopReason: string | null;
  readonly images: readonly VisionImage[];
  readonly answer: string;
  readonly dimensionCapApplied: boolean;
}

interface ParsedSseEvent {
  readonly event: string;
  readonly data: unknown;
}

type RunOutcome = { ok: true; envelope: RunEnvelope } | { ok: false; message: string };

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error;
    if (body && typeof body === 'object') {
      const errorField = (body as Record<string, unknown>)['error'];
      if (errorField && typeof errorField === 'object') {
        const message = (errorField as Record<string, unknown>)['message'];
        if (typeof message === 'string' && message) {
          return message;
        }
      }
    }
  }
  return fallback;
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
/** Fake mode answers near-instantly, which would otherwise make the gallery/answer skeleton flash by unreadably. */
const MIN_RUN_MS = 500;

@Component({
  selector: 'app-vision-lab',
  imports: [DocsPanel, InspectorPanel, Skeleton],
  templateUrl: './vision-lab.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisionLab {
  private readonly http = inject(HttpClient);

  protected readonly deliveryModeOptions = DELIVERY_MODE_OPTIONS;
  protected readonly imageCountOptions = IMAGE_COUNT_OPTIONS;

  protected readonly query = signal('');
  protected readonly imageCount = signal<ImageCount>(2);
  protected readonly instruction = signal('');
  protected readonly deliveryMode = signal<DeliveryMode>('files-api');
  protected readonly streamingEnabled = signal(false);

  protected readonly isRunning = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly images = signal<readonly VisionImage[]>([]);
  protected readonly answerText = signal('');
  protected readonly streamingAnswerText = signal('');
  protected readonly dimensionCapApplied = signal(false);
  protected readonly inspectorCall = signal<InspectorCall>(NO_CALL_YET);

  protected readonly skeletonPlaceholders = computed(() =>
    Array.from({ length: this.imageCount() }, (_, index) => index),
  );

  // Non-streaming run: same trigger-signal → switchMap → toSignal() shape as every other lab, raced against MIN_RUN_MS per loading-states.md.
  private readonly runTrigger = signal<RunRequestBody | null>(null);
  private readonly runResult = toSignal(
    toObservable(this.runTrigger).pipe(
      switchMap((body) => {
        if (!body) {
          return of(null);
        }
        return forkJoin([
          this.http.post<RunEnvelope>('/api/vision-lab/run', body).pipe(
            map((envelope): RunOutcome => ({ ok: true, envelope })),
            catchError((err) =>
              of<RunOutcome>({ ok: false, message: extractErrorMessage(err, 'The request failed. Please try again.') }),
            ),
          ),
          timer(MIN_RUN_MS),
        ]).pipe(
          map(([outcome]) => outcome),
          tap((outcome) => {
            if (outcome.ok) {
              this.applyEnvelope(outcome.envelope);
            } else {
              this.failRun(outcome.message);
            }
          }),
        );
      }),
    ),
    { initialValue: null },
  );

  protected onQueryChange(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onImageCountChange(value: ImageCount): void {
    this.imageCount.set(value);
  }

  protected onInstructionChange(event: Event): void {
    this.instruction.set((event.target as HTMLTextAreaElement).value);
  }

  protected onDeliveryModeChange(value: DeliveryMode): void {
    this.deliveryMode.set(value);
  }

  protected onStreamingToggle(event: Event): void {
    this.streamingEnabled.set((event.target as HTMLInputElement).checked);
  }

  protected run(): void {
    const query = this.query().trim();
    const instruction = this.instruction().trim();
    if (!query || !instruction || this.isRunning()) {
      return;
    }

    this.error.set(null);
    this.isRunning.set(true);
    this.images.set([]);
    this.answerText.set('');
    this.streamingAnswerText.set('');
    this.dimensionCapApplied.set(false);

    const body: RunRequestBody = {
      query,
      imageCount: this.imageCount(),
      instruction,
      deliveryMode: this.deliveryMode(),
      stream: this.streamingEnabled(),
    };

    if (this.streamingEnabled()) {
      void this.runStreaming(body);
    } else {
      this.runTrigger.set(body);
    }
  }

  private applyEnvelope(envelope: RunEnvelope, streamEvents?: readonly unknown[]): void {
    this.images.set(envelope.images);
    this.answerText.set(envelope.answer);
    this.dimensionCapApplied.set(envelope.dimensionCapApplied);
    this.inspectorCall.set({
      request: envelope.request,
      response: envelope.response,
      ...(streamEvents ? { streamEvents } : {}),
      stopReason: envelope.stopReason,
      usage: envelope.usage,
    });
    this.error.set(null);
    this.isRunning.set(false);
    this.streamingAnswerText.set('');
  }

  private failRun(message: string): void {
    this.error.set(message);
    this.isRunning.set(false);
    this.images.set([]);
    this.streamingAnswerText.set('');
  }

  /** Resolves once at least MIN_RUN_MS has passed since `startedAt` — awaited just before any isRunning-clearing transition, so a near-instant fake-mode run still holds its skeleton for a readable moment. */
  private async waitOutMinRunDuration(startedAt: number): Promise<void> {
    const remaining = MIN_RUN_MS - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  private async runStreaming(body: RunRequestBody): Promise<void> {
    const startedAt = Date.now();
    const streamEventsBuffer: unknown[] = [];
    this.inspectorCall.set({ request: body, streamEvents: [] });

    try {
      const response = await fetch('/api/vision-lab/run', {
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
          await this.handleStreamEvent(parseSseFrame(frame), body, streamEventsBuffer, startedAt);
          boundaryIndex = buffer.indexOf('\n\n');
        }
      }
    } catch {
      await this.waitOutMinRunDuration(startedAt);
      this.failRun('The streaming request failed. Please try again.');
    }
  }

  private async handleStreamEvent(
    parsed: ParsedSseEvent | null,
    requestBody: RunRequestBody,
    streamEventsBuffer: unknown[],
    startedAt: number,
  ): Promise<void> {
    if (!parsed) {
      return;
    }

    if (parsed.event === 'turn_complete') {
      const envelope = parsed.data as RunEnvelope;
      await this.waitOutMinRunDuration(startedAt);
      this.applyEnvelope(envelope, streamEventsBuffer);
      return;
    }

    if (parsed.event === 'error') {
      const { error } = parsed.data as Record<string, unknown>;
      const { message } = (error ?? {}) as Record<string, unknown>;
      await this.waitOutMinRunDuration(startedAt);
      this.failRun(typeof message === 'string' ? message : 'The streaming request failed.');
      return;
    }

    streamEventsBuffer.push(parsed.data);
    this.inspectorCall.set({ request: requestBody, streamEvents: [...streamEventsBuffer] });

    if (parsed.event === 'content_block_delta') {
      const { delta } = parsed.data as Record<string, unknown>;
      if (typeof delta === 'object' && delta !== null) {
        const { type, text } = delta as Record<string, unknown>;
        if (type === 'text_delta' && typeof text === 'string') {
          this.streamingAnswerText.update((current) => current + text);
        }
      }
    }
  }
}
