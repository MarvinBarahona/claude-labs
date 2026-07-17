import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LiveToolUseConsole } from './live-tool-use-console';

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// The component holds isAsking (and its skeletons) for at least this long — see MIN_ASKING_MS.
const MIN_ASKING_MS = 500;

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

describe('LiveToolUseConsole', () => {
  async function createFixture() {
    await TestBed.configureTestingModule({
      imports: [LiveToolUseConsole],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(LiveToolUseConsole);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // Drain the embedded DocsPanel's own markdown fetch so it doesn't count as an unexpected request.
    httpMock.expectOne('/lab-docs/live-tool-use-console.md').flush('# Live Tool-Use Console');
    // Drain the component's own config fetch (target repo name for the question placeholder).
    httpMock.expectOne('/api/live-tool-use-console/config').flush({ targetRepo: 'angular/angular' });
    fixture.detectChanges();
    return { fixture, httpMock, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function typeQuestion(el: HTMLElement, text: string): void {
    const input = el.querySelector('[aria-label="Question"]') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }

  function clickAsk(el: HTMLElement): void {
    const buttons = Array.from(el.querySelectorAll('button'));
    const ask = buttons.find((b) => b.textContent?.trim() === 'Ask') as HTMLButtonElement;
    ask.click();
  }

  function askButton(el: HTMLElement): HTMLButtonElement {
    const buttons = Array.from(el.querySelectorAll('button'));
    return buttons.find((b) => b.textContent?.trim() === 'Ask') as HTMLButtonElement;
  }

  it('names the configured target repo in the question placeholder once /config resolves', async () => {
    const { el } = await createFixture();

    const input = el.querySelector('[aria-label="Question"]') as HTMLInputElement;
    expect(input.placeholder).toBe('Ask about the weather or the angular/angular repo…');
  });

  it('falls back to a generic placeholder if the /config request fails', async () => {
    await TestBed.configureTestingModule({
      imports: [LiveToolUseConsole],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(LiveToolUseConsole);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/lab-docs/live-tool-use-console.md').flush('# Live Tool-Use Console');
    httpMock
      .expectOne('/api/live-tool-use-console/config')
      .flush({ error: 'unavailable' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('[aria-label="Question"]') as HTMLInputElement;
    expect(input.placeholder).toBe('Ask about the weather or a repo…');
  });

  it('disables the Ask button when the question input is empty or whitespace-only', async () => {
    const { fixture, el } = await createFixture();

    expect(askButton(el).disabled).toBe(true);

    typeQuestion(el, '   ');
    fixture.detectChanges();
    expect(askButton(el).disabled).toBe(true);

    typeQuestion(el, 'What is the weather in Berlin?');
    fixture.detectChanges();
    expect(askButton(el).disabled).toBe(false);
  });

  it('renders the final answer text and a populated calls array in the inspector panel (non-streaming)', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeQuestion(el, 'What is the weather in Berlin?');
    fixture.detectChanges();
    clickAsk(el);
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/live-tool-use-console/turn');
    expect(req.request.body).toEqual({
      modelChoice: 'default',
      question: 'What is the weather in Berlin?',
      stream: false,
    });

    req.flush({
      request: {
        model: 'claude-sonnet-5',
        messages: [
          { role: 'user', content: 'What is the weather in Berlin?' },
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { city: 'Berlin' } }],
          },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '18°C, cloudy' }],
          },
        ],
      },
      response: { content: [{ type: 'text', text: 'It is 18°C and cloudy in Berlin.' }] },
      calls: [
        {
          request: { model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'What is the weather in Berlin?' }] },
          response: {
            content: [
              { type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { city: 'Berlin' } },
            ],
          },
        },
      ],
      usage: { inputTokens: 20, outputTokens: 10 },
      stopReason: 'end_turn',
    });
    await vi.advanceTimersByTimeAsync(MIN_ASKING_MS);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="answer-text"]')?.textContent).toContain(
      'It is 18°C and cloudy in Berlin.',
    );

    // The calls array round-trips into the inspector panel's rendered JSON — assert on the count
    // (one prior call here) and its content showing up in the rendered output.
    expect(el.textContent).toContain('get_weather');
    expect(el.textContent).toContain('Berlin');

    // Non-streaming has no live per-tool feed — the resolved tool_use/tool_result pair from
    // `calls` renders as an already-`done` activity entry once the full envelope lands.
    const activityItems = el.querySelectorAll('[data-testid="tool-activity-list"] li');
    expect(activityItems.length).toBe(1);
    expect(activityItems[0].textContent).toContain('get_weather');
    expect(activityItems[0].textContent).toContain('done');
  });

  it('shows skeleton placeholders instead of blanking the Answer/Tool Activity sections while a second-onward ask is in flight', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeQuestion(el, 'What is the weather in Berlin?');
    fixture.detectChanges();
    clickAsk(el);
    fixture.detectChanges();

    httpMock.expectOne('/api/live-tool-use-console/turn').flush({
      request: { model: 'claude-sonnet-5', messages: [] },
      response: { content: [{ type: 'text', text: 'It is 18°C and cloudy in Berlin.' }] },
      calls: [
        {
          request: { model: 'claude-sonnet-5', messages: [] },
          response: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { city: 'Berlin' } }] },
        },
      ],
      usage: { inputTokens: 20, outputTokens: 10 },
      stopReason: 'end_turn',
    });
    await vi.advanceTimersByTimeAsync(MIN_ASKING_MS);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="answer-text"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="tool-activity-list"]')).toBeTruthy();

    typeQuestion(el, 'How is the repo doing?');
    fixture.detectChanges();
    clickAsk(el);
    fixture.detectChanges();

    // The sections stay visible (skeletons in place of the stale prior answer/activity) rather than disappearing.
    expect(el.querySelector('[data-testid="answer-text"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="tool-activity-list"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="tool-activity-skeleton"]')).toBeTruthy();

    httpMock.expectOne('/api/live-tool-use-console/turn').flush({
      request: { model: 'claude-sonnet-5', messages: [] },
      response: { content: [{ type: 'text', text: '1 open issue.' }] },
      calls: [
        {
          request: { model: 'claude-sonnet-5', messages: [] },
          response: { content: [{ type: 'tool_use', id: 'toolu_2', name: 'get_repo_stats', input: {} }] },
        },
      ],
      usage: { inputTokens: 20, outputTokens: 10 },
      stopReason: 'end_turn',
    });

    // Still mid-flight — even once the HTTP response has landed, the skeletons hold until MIN_ASKING_MS.
    await vi.advanceTimersByTimeAsync(MIN_ASKING_MS - 50);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="tool-activity-skeleton"]')).toBeTruthy();

    await vi.advanceTimersByTimeAsync(50);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="answer-text"]')?.textContent).toContain('1 open issue.');
    expect(el.querySelector('[data-testid="tool-activity-skeleton"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="tool-activity-list"]')).toBeTruthy();
  });

  it('shows a visible error state when the (non-streaming) request fails', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeQuestion(el, 'hello');
    fixture.detectChanges();
    clickAsk(el);
    fixture.detectChanges();

    httpMock.expectOne('/api/live-tool-use-console/turn').flush(
      { error: { message: 'Server error' } },
      { status: 500, statusText: 'Server Error' },
    );
    await vi.advanceTimersByTimeAsync(MIN_ASKING_MS);
    fixture.detectChanges();

    const alert = el.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('failed');
  });

  it('produces a tool-activity entry that starts running and ends done, and accumulates answer text from raw deltas (streaming)', async () => {
    const { fixture, el } = await createFixture();
    const { reader, push, finish } = createControllableReader();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      body: { getReader: () => reader },
    } as unknown as Response);

    const toggle = el.querySelector('[aria-label="Stream response"]') as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    typeQuestion(el, 'What is the weather in Berlin?');
    fixture.detectChanges();
    clickAsk(el);
    await flushMicrotasks();
    fixture.detectChanges();

    expect(fetch).toHaveBeenCalledWith(
      '/api/live-tool-use-console/turn',
      expect.objectContaining({ method: 'POST' }),
    );

    push(sseFrame('tool_call_start', { name: 'get_weather', input: { city: 'Berlin' } }));
    await flushMicrotasks();
    fixture.detectChanges();

    const runningItems = el.querySelectorAll('[data-testid="tool-activity-list"] li');
    expect(runningItems.length).toBe(1);
    expect(runningItems[0].textContent).toContain('get_weather');
    expect(runningItems[0].textContent).toContain('running');

    push(
      sseFrame('tool_call_result', {
        name: 'get_weather',
        result: '18°C, cloudy',
        isError: false,
      }),
    );
    await flushMicrotasks();
    fixture.detectChanges();

    const doneItems = el.querySelectorAll('[data-testid="tool-activity-list"] li');
    expect(doneItems.length).toBe(1);
    expect(doneItems[0].textContent).toContain('done');

    push(
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'It is ' },
      }),
    );
    await flushMicrotasks();
    fixture.detectChanges();
    expect(el.textContent).toContain('It is');

    push(
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: '18°C in Berlin.' },
      }),
    );
    await flushMicrotasks();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="answer-text"]')?.textContent).toContain(
      'It is 18°C in Berlin.',
    );

    push(
      sseFrame('turn_complete', {
        request: { model: 'claude-sonnet-5' },
        response: { content: [{ type: 'text', text: 'It is 18°C in Berlin.' }] },
        calls: [
          {
            request: { model: 'claude-sonnet-5' },
            response: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { city: 'Berlin' } }] },
          },
        ],
        usage: { inputTokens: 5, outputTokens: 8 },
        stopReason: 'end_turn',
      }),
    );
    finish();
    // turn_complete is held back until MIN_ASKING_MS has elapsed since the ask started — wait it out for real.
    await waitMs(MIN_ASKING_MS + 100);
    fixture.detectChanges();

    expect(el.textContent).toContain('stop_reason: end_turn');
    expect(el.querySelector('[data-testid="answer-text"]')?.textContent).toContain(
      'It is 18°C in Berlin.',
    );
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

    typeQuestion(el, 'trigger an error');
    fixture.detectChanges();
    clickAsk(el);
    await flushMicrotasks();

    push(sseFrame('error', { error: { message: 'Upstream overloaded', source: 'anthropic' } }));
    finish();
    // The error frame is held back until MIN_ASKING_MS has elapsed since the ask started — wait it out for real.
    await waitMs(MIN_ASKING_MS + 100);
    fixture.detectChanges();

    const alert = el.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('Upstream overloaded');
  });
});
