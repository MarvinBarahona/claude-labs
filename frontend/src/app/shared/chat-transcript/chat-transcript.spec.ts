import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChatTranscript, ChatTranscriptTurn } from './chat-transcript';

function typeInto(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event('input'));
}

describe('ChatTranscript', () => {
  async function createFixture(overrides: {
    turns?: ChatTranscriptTurn[];
    pendingAnswerMarkdown?: string | null;
    disabled?: boolean;
  } = {}) {
    await TestBed.configureTestingModule({ imports: [ChatTranscript] }).compileComponents();
    const fixture = TestBed.createComponent(ChatTranscript);
    fixture.componentRef.setInput('turns', overrides.turns ?? []);
    fixture.componentRef.setInput('placeholder', 'Say something…');
    fixture.componentRef.setInput('ariaLabel', 'Message');
    if (overrides.pendingAnswerMarkdown !== undefined) {
      fixture.componentRef.setInput('pendingAnswerMarkdown', overrides.pendingAnswerMarkdown);
    }
    if (overrides.disabled !== undefined) {
      fixture.componentRef.setInput('disabled', overrides.disabled);
    }
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function messageInput(el: HTMLElement): HTMLInputElement {
    return el.querySelector('[aria-label="Message"]') as HTMLInputElement;
  }

  function sendButton(el: HTMLElement): HTMLButtonElement {
    const buttons = Array.from(el.querySelectorAll('button'));
    return buttons.find((b) => b.textContent?.trim() === 'Send') as HTMLButtonElement;
  }

  it('renders one <li> per turn, user bubble right-aligned, assistant bubble left-aligned', async () => {
    const { el } = await createFixture({
      turns: [{ question: 'Hi', answerMarkdown: 'Hello there' }],
    });

    const items = el.querySelectorAll('[data-testid="transcript-list"] li');
    expect(items.length).toBe(1);
    const bubbleContainers = items[0].querySelectorAll(':scope > div');
    expect(bubbleContainers[0].className).toContain('justify-end');
    expect(bubbleContainers[1].className).toContain('justify-start');
  });

  it('renders markdown for a turn whose answerMarkdown is not null', async () => {
    const { el } = await createFixture({
      turns: [{ question: 'Hi', answerMarkdown: '**bold**' }],
    });

    expect(el.querySelector('[data-testid="answer-text"] strong')?.textContent).toBe('bold');
  });

  it('renders pendingAnswerMarkdown, markdown-rendered, for the one pending turn', async () => {
    const { el } = await createFixture({
      turns: [{ question: 'Hi', answerMarkdown: null }],
      pendingAnswerMarkdown: '**partial**',
    });

    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="answer-text"] strong')?.textContent).toBe('partial');
  });

  it('renders the skeleton placeholder when the turn is pending and nothing has streamed yet', async () => {
    const { el } = await createFixture({
      turns: [{ question: 'Hi', answerMarkdown: null }],
    });

    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="answer-text"]')).toBeFalsy();
  });

  it('renders a consumer-supplied custom body slot instead of the default rendering', async () => {
    @Component({
      selector: 'app-chat-transcript-test-host',
      imports: [ChatTranscript],
      template: `
        <ng-template #customBody let-turn>
          <div data-testid="custom-body">{{ turn.question }} (custom)</div>
        </ng-template>
        <app-chat-transcript
          [turns]="turns"
          [placeholder]="'Ask…'"
          [ariaLabel]="'Question'"
          [answerBodyTemplate]="customBody"
        />
      `,
    })
    class TestHostComponent {
      turns: ChatTranscriptTurn[] = [{ question: 'What is this?', answerMarkdown: 'plain answer' }];
    }

    await TestBed.configureTestingModule({ imports: [TestHostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="custom-body"]')?.textContent).toContain('What is this? (custom)');
    expect(el.querySelector('[data-testid="answer-text"]')).toBeFalsy();
  });

  it('disables Send when the draft is empty/whitespace-only, or when disabled is true', async () => {
    const { fixture, el } = await createFixture();

    expect(sendButton(el).disabled).toBe(true);

    typeInto(messageInput(el), '   ');
    fixture.detectChanges();
    expect(sendButton(el).disabled).toBe(true);

    typeInto(messageInput(el), 'hello');
    fixture.detectChanges();
    expect(sendButton(el).disabled).toBe(false);

    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(sendButton(el).disabled).toBe(true);
  });

  it('emits the trimmed draft text and clears it on Send click', async () => {
    const { fixture, el } = await createFixture();
    const emitted: string[] = [];
    fixture.componentInstance.send.subscribe((text) => emitted.push(text));

    typeInto(messageInput(el), '  hello world  ');
    fixture.detectChanges();
    sendButton(el).click();
    fixture.detectChanges();

    expect(emitted).toEqual(['hello world']);
    expect(messageInput(el).value).toBe('');
  });

  it('emits the trimmed draft text on Enter', async () => {
    const { fixture, el } = await createFixture();
    const emitted: string[] = [];
    fixture.componentInstance.send.subscribe((text) => emitted.push(text));

    typeInto(messageInput(el), 'hi there');
    fixture.detectChanges();
    messageInput(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    expect(emitted).toEqual(['hi there']);
  });
});
