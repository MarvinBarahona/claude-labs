import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FoundationsConsole } from './foundations-console';

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A ReadableStreamDefaultReader-like stub whose chunks are fed in by the test, one at a time. */
function createControllableReader() {
  const encoder = new TextEncoder();
  type Chunk = { value?: Uint8Array; done: boolean };
  const queue: Chunk[] = [];
  const waiters: Array<(chunk: Chunk) => void> = [];

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

describe('FoundationsConsole', () => {
  async function createFixture() {
    await TestBed.configureTestingModule({
      imports: [FoundationsConsole],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(FoundationsConsole);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // Drain the embedded DocsPanel's own markdown fetch so it doesn't count as an unexpected request.
    httpMock.expectOne('/lab-docs/foundations-console.md').flush('# Foundations Console');
    fixture.detectChanges();
    return { fixture, httpMock, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
  });

  function typeMessage(el: HTMLElement, text: string): void {
    const input = el.querySelector('[aria-label="Message"]') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }

  function clickSend(el: HTMLElement): void {
    const buttons = Array.from(el.querySelectorAll('button'));
    const send = buttons.find((b) => b.textContent?.trim() === 'Send') as HTMLButtonElement;
    send.click();
  }

  function selectModel(el: HTMLElement, label: string): void {
    const radios = Array.from(el.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    const radio = radios.find((r) => r.getAttribute('aria-label') === label)!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
  }

  it('shows all three model options labeled Sonnet/Haiku/Opus', async () => {
    const { el } = await createFixture();

    const labels = Array.from(el.querySelectorAll('input[type="radio"]')).map((r) =>
      r.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['Sonnet', 'Haiku', 'Opus']);
  });

  it('reflects the selected model in the next request modelChoice', async () => {
    const { fixture, httpMock, el } = await createFixture();

    selectModel(el, 'Opus');
    fixture.detectChanges();
    typeMessage(el, 'hello');
    fixture.detectChanges();
    clickSend(el);
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/foundations-console/messages');
    expect(req.request.body.modelChoice).toBe('hardest-call');
    req.flush({ request: {}, response: { content: [] }, usage: {}, stopReason: 'end_turn' });
  });

  it('clamps the temperature slider to 0-1 and includes it in the request body', async () => {
    const { fixture, httpMock, el } = await createFixture();

    const range = el.querySelector('[aria-label="Temperature"]') as HTMLInputElement;
    range.value = '1.7';
    range.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    typeMessage(el, 'hello');
    fixture.detectChanges();
    clickSend(el);
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/foundations-console/messages');
    expect(req.request.body.temperature).toBe(1);
    req.flush({ request: {}, response: { content: [] }, usage: {}, stopReason: 'end_turn' });
    fixture.detectChanges();

    range.value = '-0.4';
    range.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    typeMessage(el, 'hello again');
    fixture.detectChanges();
    clickSend(el);
    fixture.detectChanges();

    const req2 = httpMock.expectOne('/api/foundations-console/messages');
    expect(req2.request.body.temperature).toBe(0);
    req2.flush({ request: {}, response: { content: [] }, usage: {}, stopReason: 'end_turn' });
  });

  it('appends the user message immediately and the assistant reply once the (non-streaming) response arrives', async () => {
    const { fixture, httpMock, el } = await createFixture();

    typeMessage(el, 'What is prompt caching?');
    fixture.detectChanges();
    clickSend(el);
    fixture.detectChanges();

    expect(el.textContent).toContain('What is prompt caching?');
    expect(el.querySelectorAll('[data-testid="transcript-list"] li').length).toBe(1);

    const req = httpMock.expectOne('/api/foundations-console/messages');
    expect(req.request.body.stream).toBe(false);
    req.flush({
      request: { model: 'claude-sonnet-5' },
      response: { content: [{ type: 'text', text: 'It reduces token cost.' }] },
      usage: { inputTokens: 10, outputTokens: 5 },
      stopReason: 'end_turn',
    });
    fixture.detectChanges();

    expect(el.querySelectorAll('[data-testid="transcript-list"] li').length).toBe(2);
    expect(el.textContent).toContain('It reduces token cost.');
  });

  it('streams transcript updates incrementally from mocked SSE chunks before the terminal event', async () => {
    const { fixture, el } = await createFixture();
    const { reader, push, finish } = createControllableReader();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      body: { getReader: () => reader },
    } as unknown as Response);

    const toggle = el.querySelector('[aria-label="Stream response"]') as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    typeMessage(el, 'Write a haiku');
    fixture.detectChanges();
    clickSend(el);
    await flushMicrotasks();
    fixture.detectChanges();

    expect(fetch).toHaveBeenCalledWith(
      '/api/foundations-console/messages',
      expect.objectContaining({ method: 'POST' }),
    );

    push(sseFrame('content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Old ' } }));
    await flushMicrotasks();
    fixture.detectChanges();
    expect(el.textContent).toContain('Old');

    push(sseFrame('content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: 'pond' } }));
    await flushMicrotasks();
    fixture.detectChanges();
    expect(el.textContent).toContain('Old pond');

    push(
      sseFrame('turn_complete', {
        request: { model: 'claude-sonnet-5' },
        response: { content: [{ type: 'text', text: 'Old pond' }] },
        usage: { inputTokens: 3, outputTokens: 2 },
        stopReason: 'end_turn',
      }),
    );
    finish();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(el.querySelectorAll('[data-testid="transcript-list"] li').length).toBe(2);
    expect(el.textContent).toContain('stop_reason: end_turn');
  });

  it('surfaces a visible error when the stream sends a terminal error event', async () => {
    const { fixture, el } = await createFixture();
    const { reader, push, finish } = createControllableReader();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      body: { getReader: () => reader },
    } as unknown as Response);

    const toggle = el.querySelector('[aria-label="Stream response"]') as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    typeMessage(el, 'trigger an error');
    fixture.detectChanges();
    clickSend(el);
    await flushMicrotasks();

    push(sseFrame('error', { error: { message: 'Upstream overloaded', source: 'anthropic' } }));
    finish();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(el.textContent).toContain('Upstream overloaded');
  });

  it('runs the structured-output demo and renders the parsed fields, not raw JSON', async () => {
    const { fixture, httpMock, el } = await createFixture();

    const textarea = el.querySelector('[aria-label="Structured input"]') as HTMLTextAreaElement;
    textarea.value = 'Team decided to ship on Friday.';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const buttons = Array.from(el.querySelectorAll('button'));
    const run = buttons.find((b) => b.textContent?.trim() === 'Run') as HTMLButtonElement;
    run.click();
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/foundations-console/structured');
    expect(req.request.body.input).toBe('Team decided to ship on Friday.');
    req.flush({
      request: {},
      response: {},
      usage: {},
      stopReason: 'end_turn',
      parsed: {
        summary: 'Team will ship on Friday.',
        sentiment: 'positive',
        actionItems: ['Ship on Friday'],
      },
    });
    fixture.detectChanges();

    expect(el.textContent).toContain('Team will ship on Friday.');
    expect(el.textContent).toContain('positive');
    expect(el.textContent).toContain('Ship on Friday');
  });

  it('binds the inspector panel to whichever of the two demo actions most recently completed', async () => {
    const { fixture, httpMock, el } = await createFixture();

    typeMessage(el, 'hi there');
    fixture.detectChanges();
    clickSend(el);
    fixture.detectChanges();
    httpMock.expectOne('/api/foundations-console/messages').flush({
      request: { marker: 'transcript-call' },
      response: { content: [{ type: 'text', text: 'hello back' }] },
      usage: {},
      stopReason: 'end_turn',
    });
    fixture.detectChanges();
    expect(el.textContent).toContain('transcript-call');

    const textarea = el.querySelector('[aria-label="Structured input"]') as HTMLTextAreaElement;
    textarea.value = 'some free text';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const buttons = Array.from(el.querySelectorAll('button'));
    const run = buttons.find((b) => b.textContent?.trim() === 'Run') as HTMLButtonElement;
    run.click();
    fixture.detectChanges();
    httpMock.expectOne('/api/foundations-console/structured').flush({
      request: { marker: 'structured-call' },
      response: {},
      usage: {},
      stopReason: 'end_turn',
      parsed: { summary: 's', sentiment: 'neutral', actionItems: [] },
    });
    fixture.detectChanges();

    expect(el.textContent).toContain('structured-call');
    expect(el.textContent).not.toContain('transcript-call');
  });
});
