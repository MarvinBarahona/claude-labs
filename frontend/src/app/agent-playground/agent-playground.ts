import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { DocsPanel } from '../shared/docs-panel/docs-panel';
import { InspectorPanel } from '../shared/inspector-panel/inspector-panel';
import { NO_CALL_YET } from '../shared/inspector-panel/inspector-call';
import type { InspectorCall, InspectorUsage } from '../shared/inspector-panel/inspector-call';
import { Skeleton } from '../shared/skeleton/skeleton';
import type { CallPair } from '../shared/anthropic-content/anthropic-content';
import { extractErrorMessage } from '../shared/http-error/extract-error-message';
import { raceWithMinDuration, waitOutMinDuration } from '../shared/min-duration/min-duration';
import { readSseStream } from '../shared/sse/sse';
import type { ParsedSseEvent } from '../shared/sse/sse';

type ToolName = 'list_files' | 'read_file' | 'search' | 'ask_deepwiki';

interface RunRequestBody {
  readonly stream: boolean;
}

interface ToolActivityEntry {
  readonly tool: ToolName;
  readonly input: unknown;
  readonly result: unknown;
  readonly isError: boolean;
}

interface AgentPlaygroundEnvelope {
  readonly request: unknown;
  readonly response: unknown;
  readonly calls: readonly CallPair[];
  readonly usage?: InspectorUsage;
  readonly stopReason: string | null;
  readonly toolActivity: readonly ToolActivityEntry[];
  readonly hitIterationCap: boolean;
  readonly finalAnswer: string;
}

interface DisplayToolActivityEntry {
  readonly tool: ToolName;
  readonly status: 'running' | 'done';
  readonly input?: unknown;
  readonly result?: unknown;
  readonly isError?: boolean;
  readonly isInspection: boolean;
}

interface RunResult {
  readonly toolActivity: readonly DisplayToolActivityEntry[];
  readonly hitIterationCap: boolean;
  readonly finalAnswer: string;
  readonly callCount: number;
}

type RunOutcome = { ok: true; envelope: AgentPlaygroundEnvelope } | { ok: false; message: string };

// Fake-mode responses are near-instant — hold the skeleton for at least this long to stay readable.
const MIN_RUN_MS = 500;

/** An entry re-checks a prior result — the environment-inspection pattern this lab calls out — when an earlier entry already used the same tool with the same input. */
function markInspectionEntries(
  entries: readonly { tool: ToolName; input: unknown }[],
): boolean[] {
  const seen = new Set<string>();
  return entries.map((entry) => {
    const key = `${entry.tool}:${JSON.stringify(entry.input)}`;
    const isInspection = seen.has(key);
    seen.add(key);
    return isInspection;
  });
}

function toDisplayActivity(
  toolActivity: readonly ToolActivityEntry[],
): DisplayToolActivityEntry[] {
  const inspectionFlags = markInspectionEntries(toolActivity);
  return toolActivity.map((entry, index) => ({
    tool: entry.tool,
    status: 'done',
    input: entry.input,
    result: entry.result,
    isError: entry.isError,
    isInspection: inspectionFlags[index],
  }));
}

function findLastRunningIndex(activity: readonly DisplayToolActivityEntry[], tool: string): number {
  for (let i = activity.length - 1; i >= 0; i--) {
    if (activity[i].tool === tool && activity[i].status === 'running') {
      return i;
    }
  }
  return -1;
}

@Component({
  selector: 'app-agent-playground',
  imports: [DocsPanel, InspectorPanel, Skeleton],
  templateUrl: './agent-playground.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentPlayground {
  private readonly http = inject(HttpClient);

  protected readonly streamingEnabled = signal(false);
  protected readonly isRunning = signal(false);

  protected readonly result = signal<RunResult | null>(null);
  protected readonly liveToolActivity = signal<readonly DisplayToolActivityEntry[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly inspectorCall = signal<InspectorCall>(NO_CALL_YET);

  // The finished run's own toolActivity once available; the live-accumulated list while a streamed run is still in flight.
  protected readonly displayToolActivity = computed(
    () => this.result()?.toolActivity ?? this.liveToolActivity(),
  );

  // Non-streaming run: trigger-signal → switchMap → toSignal() shape, raced against a floor timer (MIN_RUN_MS).
  private readonly trigger = signal<RunRequestBody | null>(null);
  private readonly runResult = toSignal(
    toObservable(this.trigger).pipe(
      switchMap((body) => {
        if (!body) {
          return of(null);
        }
        return raceWithMinDuration(
          this.http.post<AgentPlaygroundEnvelope>('/api/agent-playground/run', body).pipe(
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
              this.errorMessage.set(outcome.message);
              this.isRunning.set(false);
            }
          }),
        );
      }),
    ),
    { initialValue: null },
  );

  protected onStreamingToggle(event: Event): void {
    this.streamingEnabled.set((event.target as HTMLInputElement).checked);
  }

  protected run(): void {
    this.errorMessage.set(null);
    this.isRunning.set(true);
    this.result.set(null);
    this.liveToolActivity.set([]);

    const body: RunRequestBody = { stream: this.streamingEnabled() };

    if (this.streamingEnabled()) {
      void this.runStreaming(body);
    } else {
      this.trigger.set(body);
    }
  }

  private applyEnvelope(envelope: AgentPlaygroundEnvelope): void {
    this.result.set({
      toolActivity: toDisplayActivity(envelope.toolActivity),
      hitIterationCap: envelope.hitIterationCap,
      finalAnswer: envelope.finalAnswer,
      callCount: envelope.calls.length + 1,
    });
    this.inspectorCall.set({
      request: envelope.request,
      response: envelope.response,
      calls: envelope.calls,
      stopReason: envelope.stopReason,
      usage: envelope.usage,
    });
    this.errorMessage.set(null);
    this.isRunning.set(false);
  }

  private async runStreaming(body: RunRequestBody): Promise<void> {
    const startedAt = Date.now();
    this.inspectorCall.set({ request: body, streamEvents: [] });
    const streamEventsBuffer: unknown[] = [];

    try {
      const response = await fetch('/api/agent-playground/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      await readSseStream(response, (parsed) =>
        this.handleStreamEvent(parsed, body, streamEventsBuffer, startedAt),
      );
      await waitOutMinDuration(startedAt, MIN_RUN_MS);
      // Only a stream that never delivered turn_complete or a terminal error event falls through to here — isRunning is still true.
      if (this.isRunning()) {
        this.errorMessage.set('The streaming request failed. Please try again.');
        this.isRunning.set(false);
      }
    } catch {
      await waitOutMinDuration(startedAt, MIN_RUN_MS);
      this.errorMessage.set('The streaming request failed. Please try again.');
      this.isRunning.set(false);
    }
  }

  private async handleStreamEvent(
    parsed: ParsedSseEvent,
    requestBody: RunRequestBody,
    streamEventsBuffer: unknown[],
    startedAt: number,
  ): Promise<void> {
    if (parsed.event === 'turn_complete') {
      const envelope = parsed.data as AgentPlaygroundEnvelope;
      await waitOutMinDuration(startedAt, MIN_RUN_MS);
      this.applyEnvelope(envelope);
      return;
    }

    if (parsed.event === 'error') {
      const { error } = parsed.data as Record<string, unknown>;
      const { message } = (error ?? {}) as Record<string, unknown>;
      await waitOutMinDuration(startedAt, MIN_RUN_MS);
      this.errorMessage.set(typeof message === 'string' ? message : 'The streaming request failed.');
      this.isRunning.set(false);
      return;
    }

    if (parsed.event === 'tool_call_start') {
      const { name, input } = parsed.data as Record<string, unknown>;
      if (typeof name === 'string') {
        this.liveToolActivity.update((activity) => [
          ...activity,
          { tool: name as ToolName, status: 'running', input, isInspection: false },
        ]);
      }
      return;
    }

    if (parsed.event === 'tool_call_result') {
      const { name, result, isError } = parsed.data as Record<string, unknown>;
      if (typeof name === 'string') {
        this.liveToolActivity.update((activity) => {
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
  }
}
