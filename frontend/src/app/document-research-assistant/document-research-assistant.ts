import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { DocsPanel } from '../shared/docs-panel/docs-panel';
import { InspectorPanel } from '../shared/inspector-panel/inspector-panel';
import { NO_CALL_YET } from '../shared/inspector-panel/inspector-call';
import type { InspectorCall, InspectorUsage } from '../shared/inspector-panel/inspector-call';
import { Skeleton } from '../shared/skeleton/skeleton';
import { ChatTranscript } from '../shared/chat-transcript/chat-transcript';
import type { ChatTranscriptTurn } from '../shared/chat-transcript/chat-transcript';
import { renderMarkdown } from '../shared/markdown/render-markdown';
import { MarkdownPipe } from '../shared/markdown/markdown.pipe';
import { ParagraphsForTurnPipe } from './paragraphs-for-turn.pipe';
import {
  deriveToolActivityFromCalls,
  findLastRunningIndex,
} from '../shared/anthropic-content/anthropic-content';
import type { CallPair, ToolActivityEntry } from '../shared/anthropic-content/anthropic-content';
import { extractErrorMessage } from '../shared/http-error/extract-error-message';
import { raceWithMinDuration, waitOutMinDuration } from '../shared/min-duration/min-duration';
import { readSseStream } from '../shared/sse/sse';
import type { ParsedSseEvent } from '../shared/sse/sse';

type DeliveryMode = 'files-api' | 'base64';

const DELIVERY_MODE_OPTIONS: readonly { value: DeliveryMode; label: string }[] = [
  { value: 'files-api', label: 'Files API' },
  { value: 'base64', label: 'Base64' },
];

interface Paper {
  readonly arxivId: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly summary: string;
  readonly pdfUrl: string;
}

interface SessionResponse {
  readonly sessionId: string;
  readonly paper: Paper;
}

interface SessionRequestBody {
  readonly arxivId: string;
}

interface Citation {
  readonly citedText: string;
  readonly documentTitle: string;
  readonly startPage: number;
  readonly endPage: number;
}

interface AskRequestBody {
  readonly question: string;
  readonly deliveryMode: DeliveryMode;
  readonly stream: boolean;
}

interface TurnEnvelope {
  readonly request: unknown;
  readonly response: unknown;
  readonly calls?: readonly CallPair[];
  readonly usage?: InspectorUsage;
  readonly stopReason: string | null;
  readonly answer: string;
  readonly citations: readonly Citation[];
  readonly notes: string | null;
  readonly cache: { read: boolean; write: boolean };
}

export interface AnswerParagraph {
  readonly text: string;
  readonly citations: readonly Citation[];
}

export interface TranscriptTurn {
  readonly question: string;
  // null while the turn's answer hasn't landed yet (non-streaming: in flight; streaming: before turn_complete).
  readonly paragraphs: readonly AnswerParagraph[] | null;
}

type SessionOutcome = { ok: true; session: SessionResponse } | { ok: false; message: string };
type TurnOutcome = { ok: true; envelope: TurnEnvelope } | { ok: false; message: string };

// The fake-mode backend answers near-instantly, which would otherwise make the loading skeletons flash by too fast to read.
const MIN_SESSION_MS = 500;
const MIN_ASKING_MS = 500;

/** Pairs each text block with its own citations, consuming the flat `citations` array in block order. */
function buildAnswerParagraphs(response: unknown, citations: readonly Citation[]): readonly AnswerParagraph[] {
  if (typeof response !== 'object' || response === null) {
    return [];
  }
  const { content } = response as Record<string, unknown>;
  if (!Array.isArray(content)) {
    return [];
  }
  const paragraphs: AnswerParagraph[] = [];
  let cursor = 0;
  for (const block of content) {
    if (typeof block !== 'object' || block === null) {
      continue;
    }
    const { type, text, citations: blockCitations } = block as Record<string, unknown>;
    if (type === 'text' && typeof text === 'string') {
      const count = Array.isArray(blockCitations) ? blockCitations.length : 0;
      paragraphs.push({ text, citations: citations.slice(cursor, cursor + count) });
      cursor += count;
    }
  }
  return paragraphs;
}

@Component({
  selector: 'app-document-research-assistant',
  imports: [DocsPanel, InspectorPanel, Skeleton, ChatTranscript, MarkdownPipe, ParagraphsForTurnPipe],
  templateUrl: './document-research-assistant.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentResearchAssistant {
  private readonly http = inject(HttpClient);

  protected readonly deliveryModeOptions = DELIVERY_MODE_OPTIONS;

  // Session
  protected readonly arxivIdInput = signal('');
  protected readonly session = signal<SessionResponse | null>(null);
  protected readonly sessionError = signal<string | null>(null);
  protected readonly isStartingSession = signal(false);

  private readonly sessionTrigger = signal<SessionRequestBody | null>(null);
  private readonly sessionResult = toSignal(
    toObservable(this.sessionTrigger).pipe(
      switchMap((body) => {
        if (!body) {
          return of(null);
        }
        return raceWithMinDuration(
          this.http.post<SessionResponse>('/api/document-research-assistant/session', body).pipe(
            map((session): SessionOutcome => ({ ok: true, session })),
            catchError((err) =>
              of<SessionOutcome>({
                ok: false,
                message: extractErrorMessage(err, 'Could not start a session for that arXiv ID.'),
              }),
            ),
          ),
          MIN_SESSION_MS,
        ).pipe(
          tap((outcome) => {
            if (outcome.ok) {
              this.session.set(outcome.session);
              this.sessionError.set(null);
            } else {
              this.sessionError.set(outcome.message);
            }
            this.isStartingSession.set(false);
          }),
        );
      }),
    ),
    { initialValue: null },
  );

  // Ask / transcript
  protected readonly deliveryMode = signal<DeliveryMode>('files-api');
  protected readonly streamingEnabled = signal(false);
  protected readonly transcript = signal<readonly TranscriptTurn[]>([]);
  protected readonly streamingAnswerText = signal('');
  protected readonly toolActivity = signal<readonly ToolActivityEntry[]>([]);
  protected readonly isAsking = signal(false);
  protected readonly askError = signal<string | null>(null);
  protected readonly notes = signal<string | null>(null);
  protected readonly inspectorCall = signal<InspectorCall>(NO_CALL_YET);

  protected readonly chatTranscriptTurns = computed<readonly ChatTranscriptTurn[]>(() =>
    this.transcript().map((turn) => ({
      question: turn.question,
      answerMarkdown: turn.paragraphs !== null ? turn.paragraphs.map((p) => p.text).join('\n\n') : null,
    })),
  );

  protected readonly notesHtml = computed(() => {
    const notes = this.notes();
    return notes !== null ? renderMarkdown(notes) : '';
  });

  // Non-streaming ask: same trigger-signal → switchMap → toSignal() shape as the session flow, raced against MIN_ASKING_MS.
  private readonly turnTrigger = signal<AskRequestBody | null>(null);
  private readonly turnResult = toSignal(
    toObservable(this.turnTrigger).pipe(
      switchMap((body) => {
        const sessionId = this.session()?.sessionId;
        if (!body || !sessionId) {
          return of(null);
        }
        return raceWithMinDuration(
          this.http.post<TurnEnvelope>(`/api/document-research-assistant/session/${sessionId}/ask`, body).pipe(
            map((envelope): TurnOutcome => ({ ok: true, envelope })),
            catchError((err) =>
              of<TurnOutcome>({ ok: false, message: extractErrorMessage(err, 'The request failed. Please try again.') }),
            ),
          ),
          MIN_ASKING_MS,
        ).pipe(
          tap((outcome) => {
            if (outcome.ok) {
              this.applyTurnEnvelope(outcome.envelope);
            } else {
              this.failLastTurn(outcome.message);
            }
          }),
        );
      }),
    ),
    { initialValue: null },
  );

  protected onArxivIdChange(event: Event): void {
    this.arxivIdInput.set((event.target as HTMLInputElement).value);
  }

  protected startSession(): void {
    const arxivId = this.arxivIdInput().trim();
    if (!arxivId || this.isStartingSession()) {
      return;
    }
    this.sessionError.set(null);
    this.isStartingSession.set(true);
    this.sessionTrigger.set({ arxivId });
  }

  protected onDeliveryModeChange(value: DeliveryMode): void {
    this.deliveryMode.set(value);
  }

  protected onStreamingToggle(event: Event): void {
    this.streamingEnabled.set((event.target as HTMLInputElement).checked);
  }

  protected onSend(question: string): void {
    const sessionId = this.session()?.sessionId;
    if (!sessionId || this.isAsking()) {
      return;
    }

    this.askError.set(null);
    this.isAsking.set(true);
    this.streamingAnswerText.set('');
    this.toolActivity.set([]);
    this.transcript.update((turns) => [...turns, { question, paragraphs: null }]);

    const body: AskRequestBody = {
      question,
      deliveryMode: this.deliveryMode(),
      stream: this.streamingEnabled(),
    };

    if (this.streamingEnabled()) {
      void this.askStreaming(sessionId, body);
    } else {
      this.turnTrigger.set(body);
    }
  }

  private applyTurnEnvelope(envelope: TurnEnvelope): void {
    const paragraphs = buildAnswerParagraphs(envelope.response, envelope.citations);
    this.transcript.update((turns) => {
      if (turns.length === 0) {
        return turns;
      }
      const updated = [...turns];
      updated[updated.length - 1] = { ...updated[updated.length - 1], paragraphs };
      return updated;
    });
    this.toolActivity.set(
      deriveToolActivityFromCalls(envelope.calls, { request: envelope.request, response: envelope.response }),
    );
    this.notes.set(envelope.notes);
    this.inspectorCall.set({
      request: envelope.request,
      response: envelope.response,
      calls: envelope.calls,
      stopReason: envelope.stopReason,
      usage: envelope.usage,
    });
    this.askError.set(null);
    this.streamingAnswerText.set('');
    this.isAsking.set(false);
  }

  /** Drops the still-pending last turn (question with no answer) so a failed ask doesn't leave a stuck skeleton. */
  private failLastTurn(message: string): void {
    this.transcript.update((turns) => turns.slice(0, -1));
    this.askError.set(message);
    this.streamingAnswerText.set('');
    this.isAsking.set(false);
  }

  private async askStreaming(sessionId: string, body: AskRequestBody): Promise<void> {
    const startedAt = Date.now();
    this.inspectorCall.set({ request: body, streamEvents: [] });
    const streamEventsBuffer: unknown[] = [];

    try {
      const response = await fetch(`/api/document-research-assistant/session/${sessionId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      await readSseStream(response, (parsed) =>
        this.handleStreamEvent(parsed, body, streamEventsBuffer, startedAt),
      );
    } catch {
      await waitOutMinDuration(startedAt, MIN_ASKING_MS);
      this.failLastTurn('The streaming request failed. Please try again.');
    }
  }

  private async handleStreamEvent(
    parsed: ParsedSseEvent,
    requestBody: AskRequestBody,
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
      this.failLastTurn(typeof message === 'string' ? message : 'The streaming request failed.');
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
          this.streamingAnswerText.update((current) => current + text);
        }
      }
    }
  }
}
