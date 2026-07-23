import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { VisionLab } from './vision-lab';

// Mirrors the component's own MIN_RUN_MS — not exported, so this is the spec's own local copy (see docs/technical/loading-states.md's testing guidance).
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

const SAMPLE_IMAGES = [
  { url: 'https://commons.example/red-panda-1.jpg', title: 'Red panda climbing', widthPx: 800, heightPx: 600 },
  { url: 'https://commons.example/red-panda-2.jpg', title: 'Red panda eating bamboo', widthPx: 640, heightPx: 480 },
];

function runEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    request: { model: 'claude-sonnet-5' },
    response: { content: [{ type: 'text', text: 'Both images show a red panda.' }] },
    usage: { inputTokens: 20, outputTokens: 10 },
    stopReason: 'end_turn',
    images: SAMPLE_IMAGES,
    answer: 'Both images show a red panda.',
    dimensionCapApplied: false,
    ...overrides,
  };
}

describe('VisionLab', () => {
  async function createFixture() {
    await TestBed.configureTestingModule({
      imports: [VisionLab],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(VisionLab);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // Drain the embedded DocsPanel's own markdown fetch so it doesn't count as an unexpected request.
    httpMock.expectOne('/lab-docs/vision-lab.md').flush('# Vision Lab');
    fixture.detectChanges();
    return { fixture, httpMock, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function queryInput(el: HTMLElement): HTMLInputElement {
    return el.querySelector('[aria-label="Search query"]') as HTMLInputElement;
  }

  function instructionInput(el: HTMLElement): HTMLTextAreaElement {
    return el.querySelector('[aria-label="Instruction"]') as HTMLTextAreaElement;
  }

  function runButton(el: HTMLElement): HTMLButtonElement {
    const buttons = Array.from(el.querySelectorAll('button'));
    return buttons.find((b) => b.textContent?.trim() === 'Run') as HTMLButtonElement;
  }

  function typeInto(input: HTMLInputElement | HTMLTextAreaElement, text: string): void {
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }

  function fillForm(el: HTMLElement, query = 'red panda', instruction = 'Describe these images.'): void {
    typeInto(queryInput(el), query);
    typeInto(instructionInput(el), instruction);
  }

  it('disables the Run button while the query or instruction is empty', async () => {
    const { fixture, el } = await createFixture();

    expect(runButton(el).disabled).toBe(true);

    typeInto(queryInput(el), 'red panda');
    fixture.detectChanges();
    expect(runButton(el).disabled).toBe(true);

    typeInto(instructionInput(el), 'Describe these images.');
    fixture.detectChanges();
    expect(runButton(el).disabled).toBe(false);
  });

  it('renders the query/imageCount/instruction form and the delivery-mode/streaming toggles, bound to their signals', async () => {
    const { fixture, el } = await createFixture();

    const imageCountRadios = Array.from(el.querySelectorAll('input[name="image-count"]')) as HTMLInputElement[];
    expect(imageCountRadios.map((r) => r.getAttribute('aria-label'))).toEqual([
      '1 images',
      '2 images',
      '3 images',
      '4 images',
    ]);
    expect(imageCountRadios.find((r) => r.value === '2')!.checked).toBe(true);

    const threeImages = imageCountRadios.find((r) => r.value === '3')!;
    threeImages.checked = true;
    threeImages.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(threeImages.checked).toBe(true);

    const deliveryRadios = Array.from(el.querySelectorAll('input[name="delivery-mode"]')) as HTMLInputElement[];
    expect(deliveryRadios.map((r) => r.getAttribute('aria-label'))).toEqual(['Files API', 'Base64']);
    expect(deliveryRadios.find((r) => r.value === 'files-api')!.checked).toBe(true);

    const streamToggle = el.querySelector('[aria-label="Stream response"]') as HTMLInputElement;
    expect(streamToggle.checked).toBe(false);
    streamToggle.checked = true;
    streamToggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.textContent).toContain('Stream Response (Yes)');
  });

  it('runs (non-streaming), posting the right body and rendering the thumbnail gallery + answer', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    fillForm(el);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/vision-lab/run');
    expect(req.request.body).toEqual({
      query: 'red panda',
      imageCount: 2,
      instruction: 'Describe these images.',
      deliveryMode: 'files-api',
      stream: false,
    });
    req.flush(runEnvelope());
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    const result = el.querySelector('[data-testid="vision-result"]') as HTMLElement;
    expect(result).toBeTruthy();
    const thumbnails = result.querySelectorAll('[data-testid="image-gallery"] img');
    expect(thumbnails.length).toBe(2);
    expect(thumbnails[0].getAttribute('alt')).toBe('Red panda climbing');
    expect(thumbnails[0].getAttribute('src')).toBe('https://commons.example/red-panda-1.jpg');
    expect(result.textContent).toContain('Both images show a red panda.');
  });

  it('shows the dimension-cap banner only when dimensionCapApplied is true', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    fillForm(el);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/vision-lab/run').flush(runEnvelope({ dimensionCapApplied: false }));
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="dimension-cap-banner"]')).toBeFalsy();

    runButton(el).click();
    fixture.detectChanges();
    httpMock.expectOne('/api/vision-lab/run').flush(runEnvelope({ dimensionCapApplied: true }));
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="dimension-cap-banner"]')).toBeTruthy();
  });

  it('shows the gallery/answer skeleton between run and response landing (non-streaming)', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    fillForm(el);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="gallery-skeleton"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeTruthy();

    httpMock.expectOne('/api/vision-lab/run').flush(runEnvelope());
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="gallery-skeleton"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeFalsy();
    expect(el.textContent).toContain('Both images show a red panda.');
  });

  it('holds the gallery/answer skeleton for at least MIN_RUN_MS even when the response resolves sooner', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    fillForm(el);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/vision-lab/run').flush(runEnvelope());

    await vi.advanceTimersByTimeAsync(MIN_RUN_MS - 50);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="gallery-skeleton"]')).toBeTruthy();

    await vi.advanceTimersByTimeAsync(50);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="gallery-skeleton"]')).toBeFalsy();
  });

  it('shows a visible error state when the (non-streaming) request fails, not a silent failure', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    fillForm(el);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/vision-lab/run').flush(
      { error: { message: 'No images found for that query.', source: 'wikimedia' } },
      { status: 502, statusText: 'Bad Gateway' },
    );
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    const alert = el.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('No images found for that query.');
    expect(el.querySelector('[data-testid="answer-skeleton"]')).toBeFalsy();
  });

  it('reflects the completed call request/response/usage/stopReason in the inspector panel', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    fillForm(el);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/vision-lab/run').flush(
      runEnvelope({ request: { marker: 'vision-call' }, stopReason: 'end_turn' }),
    );
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    expect(el.textContent).toContain('vision-call');
    expect(el.textContent).toContain('stop_reason: end_turn');
  });

  it('runs (streaming), rendering the accumulated answer once turn_complete lands', async () => {
    const { fixture, el } = await createFixture();
    const { reader, push, finish } = createControllableReader();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      body: { getReader: () => reader },
    } as unknown as Response);

    const streamToggle = el.querySelector('[aria-label="Stream response"]') as HTMLInputElement;
    streamToggle.checked = true;
    streamToggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    fillForm(el);
    fixture.detectChanges();
    runButton(el).click();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(fetch).toHaveBeenCalledWith('/api/vision-lab/run', expect.objectContaining({ method: 'POST' }));
    expect(el.querySelector('[data-testid="gallery-skeleton"]')).toBeTruthy();

    push(sseFrame('content_block_delta', { delta: { type: 'text_delta', text: 'Both images ' } }));
    await flushMicrotasks();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="answer-text"]')?.textContent).toContain('Both images');

    push(sseFrame('content_block_delta', { delta: { type: 'text_delta', text: 'show a red panda.' } }));
    await flushMicrotasks();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="answer-text"]')?.textContent).toContain('Both images show a red panda.');

    push(sseFrame('turn_complete', runEnvelope()));
    finish();
    await waitMs(MIN_RUN_MS + 100);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="gallery-skeleton"]')).toBeFalsy();
    const thumbnails = el.querySelectorAll('[data-testid="image-gallery"] img');
    expect(thumbnails.length).toBe(2);
    expect(el.querySelector('[data-testid="answer-text"]')?.textContent).toContain('Both images show a red panda.');
  });

  it('surfaces a visible error when the stream sends a terminal error event', async () => {
    const { fixture, el } = await createFixture();
    const { reader, push, finish } = createControllableReader();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      body: { getReader: () => reader },
    } as unknown as Response);

    const streamToggle = el.querySelector('[aria-label="Stream response"]') as HTMLInputElement;
    streamToggle.checked = true;
    streamToggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    fillForm(el, 'red panda', 'trigger an error');
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
