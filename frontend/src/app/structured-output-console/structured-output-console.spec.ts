import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StructuredOutputConsole } from './structured-output-console';

const MIN_RUN_MS = 500;

describe('StructuredOutputConsole', () => {
  async function createFixture() {
    await TestBed.configureTestingModule({
      imports: [StructuredOutputConsole],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructuredOutputConsole);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // Drain the embedded DocsPanel's own markdown fetch so it doesn't count as an unexpected request.
    httpMock.expectOne('/lab-docs/structured-output-console.md').flush('# Structured Output Console');
    fixture.detectChanges();
    return { fixture, httpMock, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function typeInput(el: HTMLElement, text: string): void {
    const textarea = el.querySelector('[aria-label="Structured input"]') as HTMLTextAreaElement;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
  }

  function runButton(el: HTMLElement): HTMLButtonElement {
    const buttons = Array.from(el.querySelectorAll('button'));
    return buttons.find((b) => b.textContent?.trim() === 'Run') as HTMLButtonElement;
  }

  function fixtureEnvelope(overrides: Record<string, unknown> = {}) {
    return {
      request: {},
      response: {},
      usage: {},
      stopReason: 'end_turn',
      parsed: { summary: 's', sentiment: 'neutral', actionItems: [] },
      ...overrides,
    };
  }

  it('submits free text and renders the parsed summary/sentiment/actionItems fields, not raw JSON', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeInput(el, 'Team decided to ship on Friday.');
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/structured-output-console/run');
    expect(req.request.body.input).toBe('Team decided to ship on Friday.');
    req.flush(
      fixtureEnvelope({
        parsed: {
          summary: 'Team will ship on Friday.',
          sentiment: 'positive',
          actionItems: ['Ship on Friday'],
        },
      }),
    );
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    expect(el.textContent).toContain('Team will ship on Friday.');
    expect(el.textContent).toContain('positive');
    expect(el.textContent).toContain('Ship on Friday');
  });

  it('reflects the completed call request/response/usage/stopReason in the inspector panel', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeInput(el, 'some free text');
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/structured-output-console/run').flush(
      fixtureEnvelope({
        request: { marker: 'structured-call' },
        response: { marker: 'structured-response' },
        usage: { inputTokens: 7, outputTokens: 3 },
      }),
    );
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    expect(el.textContent).toContain('structured-call');
    expect(el.textContent).toContain('stop_reason: end_turn');
  });

  it('shows skeleton placeholders and disables Run while a run is in flight, held for at least MIN_RUN_MS', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeInput(el, 'hello');
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="structured-result-skeleton"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="structured-result"]')).toBeFalsy();
    expect(runButton(el).disabled).toBe(true);

    httpMock.expectOne('/api/structured-output-console/run').flush(fixtureEnvelope());

    await vi.advanceTimersByTimeAsync(MIN_RUN_MS - 50);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="structured-result-skeleton"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="structured-result"]')).toBeFalsy();
    expect(runButton(el).disabled).toBe(true);

    await vi.advanceTimersByTimeAsync(50);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="structured-result-skeleton"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="structured-result"]')).toBeTruthy();
    expect(runButton(el).disabled).toBe(false);
  });

  it('swaps the stale result out for the skeleton on a second-onward run', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeInput(el, 'first');
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();
    httpMock
      .expectOne('/api/structured-output-console/run')
      .flush(fixtureEnvelope({ parsed: { summary: 'first summary', sentiment: 'neutral', actionItems: [] } }));
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();
    expect(el.textContent).toContain('first summary');

    runButton(el).click();
    fixture.detectChanges();

    expect(el.textContent).not.toContain('first summary');
    expect(el.querySelector('[data-testid="structured-result-skeleton"]')).toBeTruthy();

    httpMock
      .expectOne('/api/structured-output-console/run')
      .flush(fixtureEnvelope({ parsed: { summary: 'second summary', sentiment: 'neutral', actionItems: [] } }));
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();
    expect(el.textContent).toContain('second summary');
  });

  it('shows a visible error state when the request fails, not a silent failure', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeInput(el, 'hello');
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/structured-output-console/run').flush(
      { error: { message: 'Server error' } },
      { status: 500, statusText: 'Server Error' },
    );
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    const alert = el.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('Server error');
    expect(el.querySelector('[data-testid="structured-result-skeleton"]')).toBeFalsy();
    expect(runButton(el).disabled).toBe(false);
  });
});
