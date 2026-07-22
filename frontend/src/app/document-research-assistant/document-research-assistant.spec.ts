import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DocumentResearchAssistant } from './document-research-assistant';

// Mirrors the component's own MIN_SESSION_MS/MIN_ASKING_MS — neither is exported, so this is the spec's own local copy.
const MIN_SESSION_MS = 500;
const MIN_ASKING_MS = 500;

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A ReadableStreamDefaultReader-like stub whose chunks are fed in by the test, one at a time. */
function createControllableReader() {
  const encoder = new TextEncoder();
  interface Chunk {
    value?: Uint8Array;
    done: boolean;
  }
  const queue: Chunk[] = [];
  const waiters: ((chunk: Chunk) => void)[] = [];

  function deliver(chunk: Chunk): void {
    const waiter = waiters.shift();
    if (waiter) {
      waiter(chunk);
    } else {
      queue.push(chunk);
    }
  }

  return {
    reader: {
      read: (): Promise<Chunk> =>
        new Promise((resolve) => {
          const next = queue.shift();
          if (next) {
            resolve(next);
          } else {
            waiters.push(resolve);
          }
        }),
    },
    push: (text: string) => deliver({ value: encoder.encode(text), done: false }),
    finish: () => deliver({ done: true }),
  };
}

const SAMPLE_PAPER = {
  arxivId: '2301.00234',
  title: 'Attention Is All You Need',
  authors: ['A. Vaswani', 'N. Shazeer'],
  summary: 'Introduces the Transformer architecture based on self-attention.',
  pdfUrl: 'https://arxiv.org/pdf/2301.00234',
};

function sessionResponseBody(overrides: Partial<typeof SAMPLE_PAPER> = {}) {
  return { sessionId: 'sess_1', paper: { ...SAMPLE_PAPER, ...overrides } };
}

function turnEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    request: { model: 'claude-sonnet-5', messages: [] },
    response: {
      content: [
        {
          type: 'text',
          text: 'The Transformer relies entirely on self-attention.',
          citations: [{ type: 'char_location' }],
        },
        { type: 'text', text: 'It was introduced in 2017.' },
      ],
    },
    usage: { inputTokens: 50, outputTokens: 20, cacheReadInputTokens: 10 },
    stopReason: 'end_turn',
    answer: 'The Transformer relies entirely on self-attention. It was introduced in 2017.',
    citations: [
      { citedText: 'Attention Is All You Need, 2017.', documentTitle: 'Attention Is All You Need', startPage: 1, endPage: 1 },
    ],
    notes: '# Notes\n\nKey point about self-attention.',
    cache: { read: false, write: true },
    ...overrides,
  };
}

describe('DocumentResearchAssistant', () => {
  async function createFixture() {
    await TestBed.configureTestingModule({
      imports: [DocumentResearchAssistant],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(DocumentResearchAssistant);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // Drain the embedded DocsPanel's own markdown fetch so it doesn't count as an unexpected request.
    httpMock.expectOne('/lab-docs/document-research-assistant.md').flush('# Document Research Assistant');
    fixture.detectChanges();
    return { fixture, httpMock, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function arxivInput(el: HTMLElement): HTMLInputElement {
    return el.querySelector('[aria-label="arXiv ID or URL"]') as HTMLInputElement;
  }

  function startButton(el: HTMLElement): HTMLButtonElement {
    const buttons = Array.from(el.querySelectorAll('button'));
    return buttons.find((b) => b.textContent?.trim() === 'Start') as HTMLButtonElement;
  }

  function questionInput(el: HTMLElement): HTMLInputElement | null {
    return el.querySelector('[aria-label="Question"]') as HTMLInputElement | null;
  }

  function askButton(el: HTMLElement): HTMLButtonElement | undefined {
    const buttons = Array.from(el.querySelectorAll('button'));
    return buttons.find((b) => b.textContent?.trim() === 'Ask') as HTMLButtonElement | undefined;
  }

  function typeInto(input: HTMLInputElement, text: string): void {
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }

  /** Types the given arXiv ID, clicks Start, flushes the session endpoint, and waits out MIN_SESSION_MS. */
  async function startSession(
    fixture: ComponentFixture<DocumentResearchAssistant>,
    httpMock: HttpTestingController,
    el: HTMLElement,
    body: ReturnType<typeof sessionResponseBody> = sessionResponseBody(),
  ): Promise<void> {
    typeInto(arxivInput(el), body.paper.arxivId);
    fixture.detectChanges();
    startButton(el).click();
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/document-research-assistant/session');
    req.flush(body);
    await vi.advanceTimersByTimeAsync(MIN_SESSION_MS);
    fixture.detectChanges();
  }

  it('disables the Start button while the arXiv ID input is empty or whitespace-only', async () => {
    const { fixture, el } = await createFixture();

    expect(startButton(el).disabled).toBe(true);

    typeInto(arxivInput(el), '   ');
    fixture.detectChanges();
    expect(startButton(el).disabled).toBe(true);

    typeInto(arxivInput(el), '2301.00234');
    fixture.detectChanges();
    expect(startButton(el).disabled).toBe(false);
  });

  it('starts a session from the arXiv ID form and replaces the form with the fetched paper', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeInto(arxivInput(el), '2301.00234');
    fixture.detectChanges();
    startButton(el).click();
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/document-research-assistant/session');
    expect(req.request.body).toEqual({ arxivId: '2301.00234' });
    req.flush(sessionResponseBody());
    await vi.advanceTimersByTimeAsync(MIN_SESSION_MS);
    fixture.detectChanges();

    expect(arxivInput(el)).toBeFalsy();
    expect(el.textContent).toContain('Attention Is All You Need');
    expect(el.textContent).toContain('A. Vaswani, N. Shazeer');
    expect(el.textContent).toContain('Introduces the Transformer architecture based on self-attention.');
  });

  it('shows a clear error state when session creation fails', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeInto(arxivInput(el), 'not-a-real-id');
    fixture.detectChanges();
    startButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/document-research-assistant/session').flush(
      { error: { message: 'No arXiv paper found for that ID.', source: 'arxiv' } },
      { status: 502, statusText: 'Bad Gateway' },
    );
    await vi.advanceTimersByTimeAsync(MIN_SESSION_MS);
    fixture.detectChanges();

    const alert = el.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('No arXiv paper found for that ID.');
    // The form is still there — session creation never succeeded.
    expect(arxivInput(el)).toBeTruthy();
  });

  it('does not render the Ask section until a session exists', async () => {
    const { el } = await createFixture();
    expect(questionInput(el)).toBeFalsy();
  });

  it('renders a question/answer transcript turn with paired citation markers from a mocked non-streaming response', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();
    await startSession(fixture, httpMock, el);

    typeInto(questionInput(el)!, 'What architecture does this paper introduce?');
    fixture.detectChanges();
    askButton(el)!.click();
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/document-research-assistant/session/sess_1/ask');
    expect(req.request.body).toEqual({
      question: 'What architecture does this paper introduce?',
      deliveryMode: 'files-api',
      stream: false,
    });
    req.flush(turnEnvelope());
    await vi.advanceTimersByTimeAsync(MIN_ASKING_MS);
    fixture.detectChanges();

    const transcript = el.querySelector('[data-testid="transcript-list"]') as HTMLElement;
    expect(transcript.textContent).toContain('What architecture does this paper introduce?');
    expect(transcript.textContent).toContain('The Transformer relies entirely on self-attention.');
    expect(transcript.textContent).toContain('It was introduced in 2017.');

    // Only the first text block carries a citation — exactly one marker should be paired to it.
    const markers = transcript.querySelectorAll('[data-testid="citation-marker"]');
    expect(markers.length).toBe(1);
    expect(markers[0].textContent?.trim()).toBe('[1]');

    const detail = transcript.querySelector('[data-testid="citation-detail"]');
    expect(detail?.textContent).toContain('Attention Is All You Need, 2017.');
    expect(detail?.textContent).toContain('Attention Is All You Need');
    expect(detail?.textContent).toContain('1–1');
  });

  it('renders each answer paragraph as markdown, not literal text', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();
    await startSession(fixture, httpMock, el);

    typeInto(questionInput(el)!, 'Summarize the key idea.');
    fixture.detectChanges();
    askButton(el)!.click();
    fixture.detectChanges();

    httpMock.expectOne('/api/document-research-assistant/session/sess_1/ask').flush(
      turnEnvelope({
        response: { content: [{ type: 'text', text: '**Self-attention** is key.', citations: null }] },
        citations: [],
      }),
    );
    await vi.advanceTimersByTimeAsync(MIN_ASKING_MS);
    fixture.detectChanges();

    const transcript = el.querySelector('[data-testid="transcript-list"]') as HTMLElement;
    expect(transcript.querySelector('[data-testid="answer-text"] strong')?.textContent).toBe('Self-attention');
  });

  it('renders the notes panel from the notes field after an ask, as rendered Markdown', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();
    await startSession(fixture, httpMock, el);

    typeInto(questionInput(el)!, 'Summarize the abstract.');
    fixture.detectChanges();
    askButton(el)!.click();
    fixture.detectChanges();

    httpMock.expectOne('/api/document-research-assistant/session/sess_1/ask').flush(turnEnvelope());
    await vi.advanceTimersByTimeAsync(MIN_ASKING_MS);
    fixture.detectChanges();

    const notesPanel = el.querySelector('[data-testid="notes-panel"]') as HTMLElement;
    expect(notesPanel).toBeTruthy();
    expect(notesPanel.querySelector('h1')?.textContent).toBe('Notes');
    expect(notesPanel.textContent).toContain('Key point about self-attention.');
  });

  it('sends the currently selected delivery mode, and re-asking after toggling it sends the new mode', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();
    await startSession(fixture, httpMock, el);

    typeInto(questionInput(el)!, 'First question?');
    fixture.detectChanges();
    askButton(el)!.click();
    fixture.detectChanges();

    const firstReq = httpMock.expectOne('/api/document-research-assistant/session/sess_1/ask');
    expect(firstReq.request.body.deliveryMode).toBe('files-api');
    firstReq.flush(turnEnvelope());
    await vi.advanceTimersByTimeAsync(MIN_ASKING_MS);
    fixture.detectChanges();

    const base64Radio = el.querySelector('[aria-label="Base64"]') as HTMLInputElement;
    base64Radio.checked = true;
    base64Radio.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    typeInto(questionInput(el)!, 'Second question?');
    fixture.detectChanges();
    askButton(el)!.click();
    fixture.detectChanges();

    const secondReq = httpMock.expectOne('/api/document-research-assistant/session/sess_1/ask');
    expect(secondReq.request.body.deliveryMode).toBe('base64');
    secondReq.flush(turnEnvelope());
    await vi.advanceTimersByTimeAsync(MIN_ASKING_MS);
    fixture.detectChanges();
  });

  it('shows skeleton placeholders instead of blanking the transcript/notes sections while a second-onward ask is in flight', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();
    await startSession(fixture, httpMock, el);

    typeInto(questionInput(el)!, 'First question?');
    fixture.detectChanges();
    askButton(el)!.click();
    fixture.detectChanges();

    // Before the very first ask resolves, the notes panel has nothing to show yet — a skeleton, not a blank.
    expect(el.querySelector('[data-testid="notes-skeleton"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="notes-panel"]')).toBeFalsy();

    httpMock.expectOne('/api/document-research-assistant/session/sess_1/ask').flush(turnEnvelope());
    await vi.advanceTimersByTimeAsync(MIN_ASKING_MS);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="notes-panel"]')).toBeTruthy();
    const transcript = el.querySelector('[data-testid="transcript-list"]') as HTMLElement;
    expect(transcript.querySelectorAll('[data-testid="answer-text"]').length).toBe(2);

    typeInto(questionInput(el)!, 'Second question?');
    fixture.detectChanges();
    askButton(el)!.click();
    fixture.detectChanges();

    // The prior turn/notes stay visible; the new turn shows a skeleton rather than the whole section blanking.
    expect(transcript.textContent).toContain('First question?');
    expect(el.querySelector('[data-testid="notes-panel"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="notes-skeleton"]')).toBeFalsy();
    const answerSkeletons = transcript.querySelectorAll('[data-testid="answer-skeleton"]');
    expect(answerSkeletons.length).toBe(1);

    httpMock.expectOne('/api/document-research-assistant/session/sess_1/ask').flush(
      turnEnvelope({ notes: '# Notes\n\nUpdated note.' }),
    );

    // Still mid-flight — even once the HTTP response has landed, the skeleton holds until MIN_ASKING_MS.
    await vi.advanceTimersByTimeAsync(MIN_ASKING_MS - 50);
    fixture.detectChanges();
    expect(transcript.querySelectorAll('[data-testid="answer-skeleton"]').length).toBe(1);

    await vi.advanceTimersByTimeAsync(50);
    fixture.detectChanges();

    expect(transcript.querySelectorAll('[data-testid="answer-skeleton"]').length).toBe(0);
    expect(transcript.textContent).toContain('Second question?');
    expect(el.querySelector('[data-testid="notes-panel"]')?.textContent).toContain('Updated note.');
  });

  it('shows a visible error when a non-streaming ask fails', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();
    await startSession(fixture, httpMock, el);

    typeInto(questionInput(el)!, 'A question');
    fixture.detectChanges();
    askButton(el)!.click();
    fixture.detectChanges();

    httpMock.expectOne('/api/document-research-assistant/session/sess_1/ask').flush(
      { error: { message: 'Session not found', source: 'internal' } },
      { status: 404, statusText: 'Not Found' },
    );
    await vi.advanceTimersByTimeAsync(MIN_ASKING_MS);
    fixture.detectChanges();

    const alert = el.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('Session not found');
    // The failed turn shouldn't remain stuck in the transcript with a permanent skeleton.
    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeFalsy();
  });

  it('accumulates the streaming answer live, shows tool activity, and renders citation markers once turn_complete lands', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();
    await startSession(fixture, httpMock, el);
    // The streaming path below drives real Promise-based delays by hand (see waitMs), which fake timers would hang.
    vi.useRealTimers();

    const { reader, push, finish } = createControllableReader();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      body: { getReader: () => reader },
    } as unknown as Response);

    const streamToggle = el.querySelector('[aria-label="Stream response"]') as HTMLInputElement;
    streamToggle.checked = true;
    streamToggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    typeInto(questionInput(el)!, 'What architecture does this paper introduce?');
    fixture.detectChanges();
    askButton(el)!.click();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(fetch).toHaveBeenCalledWith(
      '/api/document-research-assistant/session/sess_1/ask',
      expect.objectContaining({ method: 'POST' }),
    );

    push(sseFrame('tool_call_start', { name: 'str_replace_based_edit_tool', input: { command: 'str_replace' } }));
    await flushMicrotasks();
    fixture.detectChanges();

    let activityItems = el.querySelectorAll('[data-testid="tool-activity-list"] li');
    expect(activityItems.length).toBe(1);
    expect(activityItems[0].textContent).toContain('str_replace_based_edit_tool');
    expect(activityItems[0].textContent).toContain('running');

    push(sseFrame('tool_call_result', { name: 'str_replace_based_edit_tool', result: 'OK', isError: false }));
    await flushMicrotasks();
    fixture.detectChanges();

    activityItems = el.querySelectorAll('[data-testid="tool-activity-list"] li');
    expect(activityItems[0].textContent).toContain('done');

    push(sseFrame('content_block_delta', { delta: { type: 'text_delta', text: 'The Transformer ' } }));
    await flushMicrotasks();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="transcript-list"]')?.textContent).toContain('The Transformer');

    push(sseFrame('content_block_delta', { delta: { type: 'text_delta', text: 'relies on self-attention.' } }));
    await flushMicrotasks();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="answer-text"]')?.textContent).toContain(
      'The Transformer relies on self-attention.',
    );

    push(sseFrame('turn_complete', turnEnvelope()));
    finish();
    // turn_complete is held back until MIN_ASKING_MS has elapsed since the ask started — wait it out for real.
    await waitMs(MIN_ASKING_MS + 100);
    fixture.detectChanges();

    const transcript = el.querySelector('[data-testid="transcript-list"]') as HTMLElement;
    expect(transcript.textContent).toContain('The Transformer relies entirely on self-attention.');
    const markers = transcript.querySelectorAll('[data-testid="citation-marker"]');
    expect(markers.length).toBe(1);
    expect(el.querySelector('[data-testid="notes-panel"]')?.textContent).toContain('Key point about self-attention.');
  });

  it('surfaces a visible error when the stream sends a terminal error event', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();
    await startSession(fixture, httpMock, el);
    vi.useRealTimers();

    const { reader, push, finish } = createControllableReader();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      body: { getReader: () => reader },
    } as unknown as Response);

    const streamToggle = el.querySelector('[aria-label="Stream response"]') as HTMLInputElement;
    streamToggle.checked = true;
    streamToggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    typeInto(questionInput(el)!, 'trigger an error');
    fixture.detectChanges();
    askButton(el)!.click();
    await flushMicrotasks();

    push(sseFrame('error', { error: { message: 'Upstream overloaded', source: 'anthropic' } }));
    finish();
    await waitMs(MIN_ASKING_MS + 100);
    fixture.detectChanges();

    const alert = el.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('Upstream overloaded');
  });
});
