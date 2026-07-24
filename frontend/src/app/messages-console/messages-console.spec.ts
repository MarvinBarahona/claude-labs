import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MessagesConsole } from './messages-console';

// Mirrors the component's own MIN_TURN_MS — not exported, so this is the spec's own local copy (see docs/technical/loading-states.md's testing guidance).
const MIN_TURN_MS = 500;

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

describe('MessagesConsole', () => {
  async function createFixture() {
    await TestBed.configureTestingModule({
      imports: [MessagesConsole],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(MessagesConsole);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // Drain the embedded DocsPanel's own markdown fetch so it doesn't count as an unexpected request.
    httpMock.expectOne('/lab-docs/messages-console.md').flush('# Messages Console');
    fixture.detectChanges();
    return { fixture, httpMock, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
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
    const radio = Array.from(el.querySelectorAll('input[type="radio"]')).find(
      (r) => r.getAttribute('aria-label') === label,
    ) as HTMLInputElement;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
  }

  it('shows all three model options labeled Sonnet/Haiku/Opus via the shared model picker', async () => {
    const { el } = await createFixture();

    const labels = Array.from(el.querySelectorAll('input[type="radio"]')).map((r) =>
      r.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['Sonnet', 'Haiku', 'Opus']);
  });

  it('shows the temperature slider only when Haiku is selected, since only Haiku accepts it', async () => {
    const { fixture, el } = await createFixture();

    expect(el.querySelector('[aria-label="Temperature"]')).toBeFalsy();

    selectModel(el, 'Haiku');
    fixture.detectChanges();
    expect(el.querySelector('[aria-label="Temperature"]')).toBeTruthy();

    selectModel(el, 'Sonnet');
    fixture.detectChanges();
    expect(el.querySelector('[aria-label="Temperature"]')).toBeFalsy();
  });

  it('includes temperature in the request body only when Haiku is selected', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    selectModel(el, 'Haiku');
    fixture.detectChanges();
    typeMessage(el, 'Hello?');
    fixture.detectChanges();
    clickSend(el);
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/messages-console/turn');
    expect(req.request.body.temperature).toBe(0.7);
    req.flush({
      request: { model: 'claude-haiku-4-5' },
      response: { content: [{ type: 'text', text: 'Hi there.' }] },
      usage: { inputTokens: 1, outputTokens: 1 },
      stopReason: 'end_turn',
    });
    await vi.advanceTimersByTimeAsync(MIN_TURN_MS);
    fixture.detectChanges();
  });

  it('omits temperature from the request body when Sonnet (default) is selected', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeMessage(el, 'Hello?');
    fixture.detectChanges();
    clickSend(el);
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/messages-console/turn');
    expect(req.request.body).not.toHaveProperty('temperature');
    req.flush({
      request: { model: 'claude-sonnet-5' },
      response: { content: [{ type: 'text', text: 'Hi there.' }] },
      usage: { inputTokens: 1, outputTokens: 1 },
      stopReason: 'end_turn',
    });
    await vi.advanceTimersByTimeAsync(MIN_TURN_MS);
    fixture.detectChanges();
  });

  it('sends a message that renders right-aligned, and the assistant reply renders left-aligned once received', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeMessage(el, 'What is prompt caching?');
    fixture.detectChanges();
    clickSend(el);
    fixture.detectChanges();

    expect(el.textContent).toContain('What is prompt caching?');
    expect(el.querySelectorAll('[data-testid="transcript-list"] li').length).toBe(1);

    const req = httpMock.expectOne('/api/messages-console/turn');
    expect(req.request.body.stream).toBe(false);
    expect(req.request.body.messages).toEqual([{ role: 'user', text: 'What is prompt caching?' }]);
    req.flush({
      request: { model: 'claude-sonnet-5' },
      response: { content: [{ type: 'text', text: 'It reduces token cost.' }] },
      usage: { inputTokens: 10, outputTokens: 5 },
      stopReason: 'end_turn',
    });
    await vi.advanceTimersByTimeAsync(MIN_TURN_MS);
    fixture.detectChanges();

    const items = el.querySelectorAll('[data-testid="transcript-list"] li');
    expect(items.length).toBe(1);
    expect(el.textContent).toContain('It reduces token cost.');
    const bubbles = items[0].querySelectorAll(':scope > div');
    expect(bubbles[0].className).toContain('justify-end');
    expect(bubbles[1].className).toContain('justify-start');
  });

  it('shows the pending-turn skeleton between send and response landing (non-streaming)', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeMessage(el, 'Hello?');
    fixture.detectChanges();
    clickSend(el);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeTruthy();

    httpMock.expectOne('/api/messages-console/turn').flush({
      request: { model: 'claude-sonnet-5' },
      response: { content: [{ type: 'text', text: 'Hi there.' }] },
      usage: { inputTokens: 1, outputTokens: 1 },
      stopReason: 'end_turn',
    });
    await vi.advanceTimersByTimeAsync(MIN_TURN_MS);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeFalsy();
    expect(el.textContent).toContain('Hi there.');
  });

  it('holds the pending-turn skeleton for at least MIN_TURN_MS even when the response resolves sooner', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeMessage(el, 'Hello?');
    fixture.detectChanges();
    clickSend(el);
    fixture.detectChanges();

    httpMock.expectOne('/api/messages-console/turn').flush({
      request: { model: 'claude-sonnet-5' },
      response: { content: [{ type: 'text', text: 'Hi there.' }] },
      usage: { inputTokens: 1, outputTokens: 1 },
      stopReason: 'end_turn',
    });

    await vi.advanceTimersByTimeAsync(MIN_TURN_MS - 50);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeTruthy();

    await vi.advanceTimersByTimeAsync(50);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeFalsy();
  });

  it('streams the assistant reply incrementally from content_block_delta events, rendered as markdown once complete', async () => {
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
      '/api/messages-console/turn',
      expect.objectContaining({ method: 'POST' }),
    );

    push(
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: '**Old** ' },
      }),
    );
    await flushMicrotasks();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="answer-text"] strong')?.textContent).toBe('Old');

    push(
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'pond' },
      }),
    );
    await flushMicrotasks();
    fixture.detectChanges();
    expect(el.textContent).toContain('pond');

    push(
      sseFrame('turn_complete', {
        request: { model: 'claude-sonnet-5' },
        response: { content: [{ type: 'text', text: '**Old** pond' }] },
        usage: { inputTokens: 3, outputTokens: 2 },
        stopReason: 'end_turn',
      }),
    );
    finish();
    await waitMs(MIN_TURN_MS + 100);
    fixture.detectChanges();

    expect(el.querySelectorAll('[data-testid="transcript-list"] li').length).toBe(1);
    expect(el.querySelector('[data-testid="answer-text"] strong')?.textContent).toBe('Old');
  });

  it('shows the pending-turn skeleton between send and response landing (streaming)', async () => {
    const { fixture, el } = await createFixture();
    const { reader, push, finish } = createControllableReader();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      body: { getReader: () => reader },
    } as unknown as Response);

    const toggle = el.querySelector('[aria-label="Stream response"]') as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    typeMessage(el, 'Hello?');
    fixture.detectChanges();
    clickSend(el);
    await flushMicrotasks();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeTruthy();

    push(
      sseFrame('turn_complete', {
        request: { model: 'claude-sonnet-5' },
        response: { content: [{ type: 'text', text: 'Hi there.' }] },
        usage: { inputTokens: 1, outputTokens: 1 },
        stopReason: 'end_turn',
      }),
    );
    finish();
    await waitMs(MIN_TURN_MS + 100);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeFalsy();
    expect(el.textContent).toContain('Hi there.');
  });

  it('reflects the completed turn request/response/usage/stopReason in the inspector panel', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeMessage(el, 'hi there');
    fixture.detectChanges();
    clickSend(el);
    fixture.detectChanges();

    httpMock.expectOne('/api/messages-console/turn').flush({
      request: { marker: 'turn-call' },
      response: { content: [{ type: 'text', text: 'hello back' }] },
      usage: { inputTokens: 7, outputTokens: 3 },
      stopReason: 'end_turn',
    });
    await vi.advanceTimersByTimeAsync(MIN_TURN_MS);
    fixture.detectChanges();

    expect(el.textContent).toContain('turn-call');
    expect(el.textContent).toContain('stop_reason: end_turn');
  });

  it('shows a visible error state when the (non-streaming) request fails', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeMessage(el, 'hello');
    fixture.detectChanges();
    clickSend(el);
    fixture.detectChanges();

    httpMock.expectOne('/api/messages-console/turn').flush(
      { error: { message: 'Server error' } },
      { status: 500, statusText: 'Server Error' },
    );
    await vi.advanceTimersByTimeAsync(MIN_TURN_MS);
    fixture.detectChanges();

    const alert = el.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('failed');
    // The failed turn shouldn't remain stuck in the transcript with a permanent skeleton.
    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeFalsy();
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
    await waitMs(MIN_TURN_MS + 100);
    fixture.detectChanges();

    expect(el.textContent).toContain('Upstream overloaded');
  });
});
