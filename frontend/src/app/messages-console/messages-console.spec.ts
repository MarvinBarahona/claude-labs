import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MessagesConsole } from './messages-console';

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

  it('shows all three model options labeled Sonnet/Haiku/Opus via the shared model picker', async () => {
    const { el } = await createFixture();

    const labels = Array.from(el.querySelectorAll('input[type="radio"]')).map((r) =>
      r.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['Sonnet', 'Haiku', 'Opus']);
  });

  it('sends a message that renders right-aligned, and the assistant reply renders left-aligned once received', async () => {
    const { fixture, httpMock, el } = await createFixture();

    typeMessage(el, 'What is prompt caching?');
    fixture.detectChanges();
    clickSend(el);
    fixture.detectChanges();

    expect(el.textContent).toContain('What is prompt caching?');
    const items = el.querySelectorAll('[data-testid="transcript-list"] li');
    expect(items.length).toBe(1);
    expect(items[0].querySelector('div')?.className).toContain('items-end');

    const req = httpMock.expectOne('/api/messages-console/turn');
    expect(req.request.body.stream).toBe(false);
    expect(req.request.body.messages).toEqual([{ role: 'user', text: 'What is prompt caching?' }]);
    req.flush({
      request: { model: 'claude-sonnet-5' },
      response: { content: [{ type: 'text', text: 'It reduces token cost.' }] },
      usage: { inputTokens: 10, outputTokens: 5 },
      stopReason: 'end_turn',
    });
    fixture.detectChanges();

    const items2 = el.querySelectorAll('[data-testid="transcript-list"] li');
    expect(items2.length).toBe(2);
    expect(el.textContent).toContain('It reduces token cost.');
    expect(items2[1].querySelector('div')?.className).not.toContain('items-end');
  });

  it('streams the assistant reply incrementally from content_block_delta events before the terminal event', async () => {
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
  });

  it('reflects the completed turn request/response/usage/stopReason in the inspector panel', async () => {
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
    fixture.detectChanges();

    expect(el.textContent).toContain('turn-call');
    expect(el.textContent).toContain('stop_reason: end_turn');
  });

  it('shows a visible error state when the (non-streaming) request fails', async () => {
    const { fixture, httpMock, el } = await createFixture();

    typeMessage(el, 'hello');
    fixture.detectChanges();
    clickSend(el);
    fixture.detectChanges();

    httpMock.expectOne('/api/messages-console/turn').flush(
      { error: { message: 'Server error' } },
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();

    const alert = el.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('failed');
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
});
