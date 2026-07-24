import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AgentPlayground } from './agent-playground';

// The component holds isRunning (and its skeletons) for at least this long — see MIN_RUN_MS.
const MIN_RUN_MS = 500;

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

describe('AgentPlayground', () => {
  async function createFixture() {
    await TestBed.configureTestingModule({
      imports: [AgentPlayground],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(AgentPlayground);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // Drain the embedded DocsPanel's own markdown fetch so it doesn't count as an unexpected request.
    httpMock.expectOne('/lab-docs/agent-playground.md').flush('# Agent Playground');
    fixture.detectChanges();
    return { fixture, httpMock, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function runButton(el: HTMLElement): HTMLButtonElement {
    const buttons = Array.from(el.querySelectorAll('button'));
    return buttons.find((b) => b.textContent?.trim() === 'Run') as HTMLButtonElement;
  }

  function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      request: { model: 'claude-sonnet-5' },
      response: { content: [] },
      calls: [{ request: {}, response: {} }],
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 10 },
      toolActivity: [
        { tool: 'list_files', input: {}, result: [{ path: 'README.md' }], isError: false },
      ],
      hitIterationCap: false,
      finalAnswer: 'This repo is a reference app.',
      ...overrides,
    };
  }

  it('renders a Run button with no form fields', async () => {
    const { el } = await createFixture();

    expect(runButton(el)).toBeTruthy();
    expect(el.querySelector('input[type="text"]')).toBeNull();
    expect(el.querySelector('select')).toBeNull();
  });

  it('shows the tool-activity/final-answer skeletons while a run is in flight, then renders the result', async () => {
    const { el, httpMock, fixture } = await createFixture();

    runButton(el).click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="tool-activity-skeleton"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="final-answer-skeleton"]')).toBeTruthy();

    httpMock.expectOne('/api/agent-playground/run').flush(envelope());
    await new Promise((resolve) => setTimeout(resolve, MIN_RUN_MS + 100));
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="final-answer"]')?.textContent).toContain(
      'This repo is a reference app.',
    );
    const activityItems = el.querySelectorAll('[data-testid="tool-activity-list"] li');
    expect(activityItems.length).toBe(1);
    expect(activityItems[0].textContent).toContain('list_files');
  });

  it('keeps the result section mounted (skeleton, not a gap) across a second-onward run', async () => {
    const { el, httpMock, fixture } = await createFixture();

    runButton(el).click();
    fixture.detectChanges();
    httpMock.expectOne('/api/agent-playground/run').flush(envelope());
    await new Promise((resolve) => setTimeout(resolve, MIN_RUN_MS + 100));
    fixture.detectChanges();

    runButton(el).click();
    fixture.detectChanges();

    // The section itself stays mounted (not blanked to a gap) even though its content reverts to a skeleton for the new run.
    expect(el.querySelector('[data-testid="run-result"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="tool-activity-skeleton"]')).toBeTruthy();

    httpMock.expectOne('/api/agent-playground/run').flush(envelope());
    await new Promise((resolve) => setTimeout(resolve, MIN_RUN_MS + 100));
    fixture.detectChanges();
  });

  it('renders the hitIterationCap banner only when true', async () => {
    const { el, httpMock, fixture } = await createFixture();

    runButton(el).click();
    fixture.detectChanges();
    httpMock.expectOne('/api/agent-playground/run').flush(envelope({ hitIterationCap: true }));
    await new Promise((resolve) => setTimeout(resolve, MIN_RUN_MS + 100));
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="iteration-cap-banner"]')).toBeTruthy();
  });

  it('does not render the hitIterationCap banner on a normal completion', async () => {
    const { el, httpMock, fixture } = await createFixture();

    runButton(el).click();
    fixture.detectChanges();
    httpMock.expectOne('/api/agent-playground/run').flush(envelope({ hitIterationCap: false }));
    await new Promise((resolve) => setTimeout(resolve, MIN_RUN_MS + 100));
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="iteration-cap-banner"]')).toBeFalsy();
  });

  it('renders the comparison callout using the run’s own call/tool-use counts', async () => {
    const { el, httpMock, fixture } = await createFixture();

    runButton(el).click();
    fixture.detectChanges();
    httpMock.expectOne('/api/agent-playground/run').flush(
      envelope({
        calls: [{ request: {}, response: {} }, { request: {}, response: {} }],
        toolActivity: [
          { tool: 'list_files', input: {}, result: [], isError: false },
          { tool: 'read_file', input: { path: 'README.md' }, result: {}, isError: false },
        ],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, MIN_RUN_MS + 100));
    fixture.detectChanges();

    const callout = el.querySelector('[data-testid="comparison-callout"]')?.textContent ?? '';
    expect(callout).toContain('3 Claude API calls');
    expect(callout).toContain('2 tool uses');
  });

  it('shows a visible error state when the request fails', async () => {
    const { el, httpMock, fixture } = await createFixture();

    runButton(el).click();
    fixture.detectChanges();
    httpMock
      .expectOne('/api/agent-playground/run')
      .flush({ error: 'boom' }, { status: 502, statusText: 'Bad Gateway' });
    await new Promise((resolve) => setTimeout(resolve, MIN_RUN_MS + 100));
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('failed');
  });

  it('runs (streaming), rendering tool activity live and holding the skeleton until MIN_RUN_MS has elapsed after turn_complete', async () => {
    const { fixture, el } = await createFixture();
    const { reader, push, finish } = createControllableReader();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      body: { getReader: () => reader },
    } as unknown as Response);

    const toggle = el.querySelector('[aria-label="Stream response"]') as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    runButton(el).click();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(fetch).toHaveBeenCalledWith('/api/agent-playground/run', expect.objectContaining({ method: 'POST' }));
    expect(el.querySelector('[data-testid="tool-activity-skeleton"]')).toBeTruthy();

    push(sseFrame('tool_call_start', { name: 'list_files', input: {} }));
    await flushMicrotasks();
    fixture.detectChanges();

    const runningItems = el.querySelectorAll('[data-testid="tool-activity-list"] li');
    expect(runningItems.length).toBe(1);
    expect(runningItems[0].textContent).toContain('running');

    push(
      sseFrame('tool_call_result', {
        name: 'list_files',
        result: [{ path: 'README.md' }],
        isError: false,
      }),
    );
    await flushMicrotasks();
    fixture.detectChanges();

    const doneItems = el.querySelectorAll('[data-testid="tool-activity-list"] li');
    expect(doneItems[0].textContent).toContain('done');

    push(sseFrame('turn_complete', envelope()));
    finish();

    // Regression coverage: turn_complete must be held back until MIN_RUN_MS has elapsed, same as every other streaming lab.
    await flushMicrotasks();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="final-answer-skeleton"]')).toBeTruthy();

    await waitMs(MIN_RUN_MS + 100);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="final-answer-skeleton"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="final-answer"]')?.textContent).toContain(
      'This repo is a reference app.',
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

    runButton(el).click();
    await flushMicrotasks();

    push(sseFrame('error', { error: { message: 'Upstream overloaded', source: 'anthropic' } }));
    finish();
    await waitMs(MIN_RUN_MS + 100);
    fixture.detectChanges();

    const alert = el.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('Upstream overloaded');
  });
});
