import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { DocsPanel } from '../shared/docs-panel/docs-panel';
import { InspectorPanel } from '../shared/inspector-panel/inspector-panel';
import { NO_CALL_YET } from '../shared/inspector-panel/inspector-call';
import type { InspectorCall, InspectorUsage } from '../shared/inspector-panel/inspector-call';
import { Skeleton } from '../shared/skeleton/skeleton';
import { MarkdownPipe } from '../shared/markdown/markdown.pipe';
import { extractResponseText } from '../shared/anthropic-content/anthropic-content';
import { extractErrorMessage } from '../shared/http-error/extract-error-message';
import { raceWithMinDuration } from '../shared/min-duration/min-duration';

interface RunRequestBody {
  readonly prompt: string;
  readonly useSkill: boolean;
}

interface ExecutedCodeEntry {
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly returnCode: number;
}

interface OutputFile {
  readonly fileId: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly dataBase64: string;
}

interface DataCodeSandboxEnvelope {
  readonly request: unknown;
  readonly response: unknown;
  readonly usage?: InspectorUsage;
  readonly stopReason: string | null;
  readonly executedCode: readonly ExecutedCodeEntry[];
  readonly outputFiles: readonly OutputFile[];
  readonly skillUsed: boolean;
}

interface RunResult {
  readonly answerText: string;
  readonly executedCode: readonly ExecutedCodeEntry[];
  readonly outputFiles: readonly OutputFile[];
  readonly skillUsed: boolean;
}

type RunOutcome = { ok: true; envelope: DataCodeSandboxEnvelope } | { ok: false; message: string };

// Fake-mode responses are near-instant — hold the skeleton for at least this long to stay readable.
const MIN_RUN_MS = 500;

@Component({
  selector: 'app-data-code-sandbox',
  imports: [DocsPanel, InspectorPanel, Skeleton, MarkdownPipe],
  templateUrl: './data-code-sandbox.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataCodeSandbox {
  private readonly http = inject(HttpClient);

  protected readonly prompt = signal('');
  protected readonly useSkill = signal(false);
  protected readonly isRunning = signal(false);

  protected readonly result = signal<RunResult | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly inspectorCall = signal<InspectorCall>(NO_CALL_YET);

  private readonly trigger = signal<RunRequestBody | null>(null);
  private readonly runResult = toSignal(
    toObservable(this.trigger).pipe(
      switchMap((body) => {
        if (!body) {
          return of(null);
        }
        return raceWithMinDuration(
          this.http.post<DataCodeSandboxEnvelope>('/api/data-code-sandbox/run', body).pipe(
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

  protected onPromptChange(event: Event): void {
    this.prompt.set((event.target as HTMLTextAreaElement).value);
  }

  protected onUseSkillChange(event: Event): void {
    this.useSkill.set((event.target as HTMLInputElement).checked);
  }

  protected run(): void {
    const prompt = this.prompt().trim();
    if (!prompt || this.isRunning()) {
      return;
    }

    this.error.set(null);
    this.isRunning.set(true);
    this.result.set(null);
    this.trigger.set({ prompt, useSkill: this.useSkill() });
  }

  protected isImage(mediaType: string): boolean {
    return mediaType.startsWith('image/');
  }

  protected dataUrl(file: OutputFile): string {
    return `data:${file.mediaType};base64,${file.dataBase64}`;
  }

  private applyEnvelope(envelope: DataCodeSandboxEnvelope): void {
    this.result.set({
      answerText: extractResponseText(envelope.response),
      executedCode: envelope.executedCode,
      outputFiles: envelope.outputFiles,
      skillUsed: envelope.skillUsed,
    });
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
