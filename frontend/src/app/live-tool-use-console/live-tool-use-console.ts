import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of, switchMap, tap, timer } from 'rxjs';
import { DocsPanel } from '../shared/docs-panel/docs-panel';
import { InspectorPanel } from '../shared/inspector-panel/inspector-panel';
import type { InspectorCall, InspectorUsage } from '../shared/inspector-panel/inspector-call';
import { ModelPicker } from '../shared/model-picker/model-picker';
import type { ModelChoice } from '../shared/model-picker/model-picker';
import { Skeleton } from '../shared/skeleton/skeleton';

interface LiveToolUseConsoleConfig {
  readonly targetRepo: string;
}

interface TurnRequestBody {
  readonly modelChoice: ModelChoice;
  readonly question: string;
  readonly stream: boolean;
}

interface CallPair {
  readonly request: unknown;
  readonly response: unknown;
}

interface TurnEnvelope {
  readonly request: unknown;
  readonly response: unknown;
  readonly calls?: readonly CallPair[];
  readonly usage?: InspectorUsage;
  readonly stopReason: string | null;
}

interface ParsedSseEvent {
  readonly event: string;
  readonly data: unknown;
}

interface ToolActivityEntry {
  readonly name: string;
  readonly status: 'running' | 'done';
  readonly input?: unknown;
  readonly result?: unknown;
  readonly isError?: boolean;
}

interface ToolUseBlock {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

type TurnOutcome = { ok: true; envelope: TurnEnvelope } | { ok: false };

// The fake-mode backend answers near-instantly, which otherwise makes the Answer/Tool Activity
// skeletons flash by too fast to read as a loading state — hold isAsking for at least this long.
const MIN_ASKING_MS = 500;

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

/** Pulls every `tool_use` content block out of a Messages API response body. */
function extractToolUses(response: unknown): readonly ToolUseBlock[] {
  if (typeof response !== 'object' || response === null) {
    return [];
  }
  const { content } = response as Record<string, unknown>;
  if (!Array.isArray(content)) {
    return [];
  }
  const uses: ToolUseBlock[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null) {
      continue;
    }
    const { type, id, name, input } = block as Record<string, unknown>;
    if (type === 'tool_use' && typeof id === 'string' && typeof name === 'string') {
      uses.push({ id, name, input });
    }
  }
  return uses;
}

/** Pulls every `tool_result` content block out of a request body's messages, keyed by `tool_use_id`. */
function extractToolResults(request: unknown): Map<string, { result: unknown; isError: boolean }> {
  const results = new Map<string, { result: unknown; isError: boolean }>();
  if (typeof request !== 'object' || request === null) {
    return results;
  }
  const { messages } = request as Record<string, unknown>;
  if (!Array.isArray(messages)) {
    return results;
  }
  for (const message of messages) {
    if (typeof message !== 'object' || message === null) {
      continue;
    }
    const { content } = message as Record<string, unknown>;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      if (typeof block !== 'object' || block === null) {
        continue;
      }
      const record = block as Record<string, unknown>;
      const toolUseId = record['tool_use_id'];
      if (record['type'] === 'tool_result' && typeof toolUseId === 'string') {
        results.set(toolUseId, { result: record['content'], isError: Boolean(record['is_error']) });
      }
    }
  }
  return results;
}

/**
 * Non-streaming has no live per-tool feed to observe — once the full envelope lands, every
 * tool_use/tool_result pair across the whole turn is already resolved, so they're rendered as
 * already-`done` activity entries in one pass.
 */
function deriveToolActivityFromCalls(calls: readonly CallPair[] | undefined, finalCall: CallPair): readonly ToolActivityEntry[] {
  const sequence = [...(calls ?? []), finalCall];
  const entries: ToolActivityEntry[] = [];
  for (let i = 0; i < sequence.length; i++) {
    const uses = extractToolUses(sequence[i].response);
    if (uses.length === 0) {
      continue;
    }
    const nextRequest = sequence[i + 1]?.request;
    const results = nextRequest !== undefined ? extractToolResults(nextRequest) : new Map<string, { result: unknown; isError: boolean }>();
    for (const use of uses) {
      const resolved = results.get(use.id);
      entries.push({
        name: use.name,
        status: resolved ? 'done' : 'running',
        input: use.input,
        result: resolved?.result,
        isError: resolved?.isError,
      });
    }
  }
  return entries;
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

  // True from the moment Ask is clicked until the turn resolves (success or error) — drives the
  // Answer/Tool Activity skeletons so a second-onward ask doesn't blank those sections while it loads.
  protected readonly isAsking = signal(false);

  protected readonly answerText = signal('');
  protected readonly toolActivity = signal<readonly ToolActivityEntry[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly inspectorCall = signal<InspectorCall>(NO_CALL_YET);

  // Non-streaming ask: same trigger-signal → switchMap → toSignal() shape as MessagesConsole,
  // raced against a minimum-duration timer (see MIN_ASKING_MS) so the response is never applied sooner.
  private readonly turnTrigger = signal<TurnRequestBody | null>(null);
  private readonly turnResult = toSignal(
    toObservable(this.turnTrigger).pipe(
      switchMap((body) => {
        if (!body) {
          return of(null);
        }
        return forkJoin([
          this.http.post<TurnEnvelope>('/api/live-tool-use-console/turn', body).pipe(
            map((envelope): TurnOutcome => ({ ok: true, envelope })),
            catchError(() => of<TurnOutcome>({ ok: false })),
          ),
          timer(MIN_ASKING_MS),
        ]).pipe(
          map(([outcome]) => outcome),
          tap((outcome) => {
            if (outcome.ok) {
              this.applyTurnEnvelope(outcome.envelope);
            } else {
              this.errorMessage.set('The request failed. Please try again.');
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

  /** Resolves once at least MIN_ASKING_MS has passed since `startedAt` — awaited just before any isAsking-clearing transition, so a near-instant fake-mode turn still holds its skeleton for a readable moment. */
  private async waitOutMinAskingDuration(startedAt: number): Promise<void> {
    const remaining = MIN_ASKING_MS - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
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
      await this.waitOutMinAskingDuration(startedAt);
      this.errorMessage.set('The streaming request failed. Please try again.');
      this.isAsking.set(false);
    }
  }

  private async handleStreamEvent(
    parsed: ParsedSseEvent | null,
    requestBody: TurnRequestBody,
    streamEventsBuffer: unknown[],
    startedAt: number,
  ): Promise<void> {
    if (!parsed) {
      return;
    }

    if (parsed.event === 'turn_complete') {
      const envelope = parsed.data as TurnEnvelope;
      await this.waitOutMinAskingDuration(startedAt);
      this.applyTurnEnvelope(envelope);
      return;
    }

    if (parsed.event === 'error') {
      const { error } = parsed.data as Record<string, unknown>;
      const { message } = (error ?? {}) as Record<string, unknown>;
      await this.waitOutMinAskingDuration(startedAt);
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

/** Finds the most recent still-`running` activity entry for a given tool name. */
function findLastRunningIndex(activity: readonly ToolActivityEntry[], name: string): number {
  for (let i = activity.length - 1; i >= 0; i--) {
    if (activity[i].name === name && activity[i].status === 'running') {
      return i;
    }
  }
  return -1;
}
