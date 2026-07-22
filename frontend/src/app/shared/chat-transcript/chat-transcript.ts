import { ChangeDetectionStrategy, Component, TemplateRef, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Skeleton } from '../skeleton/skeleton';
import { renderMarkdown } from '../markdown/render-markdown';

export interface ChatTranscriptTurn {
  readonly question: string;
  // null while this turn's answer hasn't landed yet.
  readonly answerMarkdown: string | null;
}

export interface ChatTranscriptBodyContext {
  readonly $implicit: ChatTranscriptTurn;
  readonly index: number;
}

@Component({
  selector: 'app-chat-transcript',
  imports: [NgTemplateOutlet, Skeleton],
  templateUrl: './chat-transcript.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatTranscript {
  readonly turns = input.required<readonly ChatTranscriptTurn[]>();
  readonly pendingAnswerMarkdown = input<string | null>(null);
  readonly disabled = input(false);
  readonly placeholder = input.required<string>();
  readonly ariaLabel = input.required<string>();
  readonly sendLabel = input('Send');
  readonly answerBodyTemplate = input<TemplateRef<ChatTranscriptBodyContext> | null>(null);

  readonly send = output<string>();

  protected readonly draftMessage = signal('');
  protected readonly renderMarkdown = renderMarkdown;

  protected onDraftChange(event: Event): void {
    this.draftMessage.set((event.target as HTMLInputElement).value);
  }

  protected onSend(): void {
    const text = this.draftMessage().trim();
    if (!text || this.disabled()) {
      return;
    }
    this.send.emit(text);
    this.draftMessage.set('');
  }
}
