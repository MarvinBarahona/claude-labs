import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WebRepoResearchReporter } from './web-repo-research-reporter';

// The component holds isRunning (and its result skeletons) for at least this long — see MIN_RUN_MS.
const MIN_RUN_MS = 500;

describe('WebRepoResearchReporter', () => {
  async function createFixture() {
    await TestBed.configureTestingModule({
      imports: [WebRepoResearchReporter],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(WebRepoResearchReporter);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // Drain the embedded DocsPanel's own markdown fetch so it doesn't count as an unexpected request.
    httpMock
      .expectOne('/lab-docs/web-repo-research-reporter.md')
      .flush('# Web & Repo Research Reporter');
    // Drain the component's own config fetch (target repo name for the question placeholder).
    httpMock
      .expectOne('/api/web-repo-research-reporter/config')
      .flush({ targetRepo: 'angular/angular' });
    fixture.detectChanges();
    return { fixture, httpMock, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function typeQuestion(el: HTMLElement, text: string): void {
    const textarea = el.querySelector('[aria-label="Research question"]') as HTMLTextAreaElement;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
  }

  function setMaxSearches(el: HTMLElement, value: number): void {
    const input = el.querySelector(
      '[aria-label="Max searches for the web search tool"]',
    ) as HTMLInputElement;
    input.value = String(value);
    input.dispatchEvent(new Event('change'));
  }

  function runButton(el: HTMLElement): HTMLButtonElement {
    const buttons = Array.from(el.querySelectorAll('button'));
    return buttons.find((b) => b.textContent?.trim() === 'Run') as HTMLButtonElement;
  }

  function fixtureEnvelope(overrides: Record<string, unknown> = {}) {
    return {
      request: {},
      response: {},
      stopReason: 'end_turn',
      brief: {
        summary: 'ok',
        findings: [{ claim: 'a claim', source: 'https://example.com' }],
      },
      searchesPerformed: 2,
      mcpCallsPerformed: 1,
      ...overrides,
    };
  }

  it('names the configured target repo in the question placeholder once /config resolves', async () => {
    const { el } = await createFixture();

    const textarea = el.querySelector('[aria-label="Research question"]') as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe(
      'Ask a research question about the angular/angular repo or its ecosystem…',
    );
  });

  it('falls back to a generic placeholder if the /config request fails', async () => {
    await TestBed.configureTestingModule({
      imports: [WebRepoResearchReporter],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(WebRepoResearchReporter);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock
      .expectOne('/lab-docs/web-repo-research-reporter.md')
      .flush('# Web & Repo Research Reporter');
    httpMock
      .expectOne('/api/web-repo-research-reporter/config')
      .flush({ error: 'unavailable' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const textarea = fixture.nativeElement.querySelector(
      '[aria-label="Research question"]',
    ) as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe('Ask a research question about the repo or its ecosystem…');
  });

  it('disables the Run button until a question is entered', async () => {
    const { fixture, el } = await createFixture();

    expect(runButton(el).disabled).toBe(true);

    typeQuestion(el, 'What testing approach does this repo use?');
    fixture.detectChanges();
    expect(runButton(el).disabled).toBe(false);
  });

  it('sends the question and maxSearches (defaulting to 5) in the request body', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeQuestion(el, 'What testing approach does this repo use?');
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/web-repo-research-reporter/run');
    expect(req.request.body).toEqual({
      question: 'What testing approach does this repo use?',
      maxSearches: 5,
    });

    req.flush(fixtureEnvelope());
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();
  });

  it('sends a changed maxSearches value in the request body', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeQuestion(el, 'What testing approach does this repo use?');
    setMaxSearches(el, 2);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/web-repo-research-reporter/run');
    expect(req.request.body).toEqual({
      question: 'What testing approach does this repo use?',
      maxSearches: 2,
    });

    req.flush(fixtureEnvelope());
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();
  });

  it('renders the summary, findings (claim + source link), and counters from the response', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeQuestion(el, 'What testing approach does this repo use?');
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/web-repo-research-reporter/run').flush(
      fixtureEnvelope({
        brief: {
          summary: 'The repo uses a layered testing strategy.',
          findings: [
            { claim: 'Unit tests mock external clients.', source: 'https://example.com/testing' },
          ],
        },
        searchesPerformed: 3,
        mcpCallsPerformed: 2,
      }),
    );
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="brief-summary"]')?.textContent).toContain(
      'The repo uses a layered testing strategy.',
    );
    const findingItem = el.querySelector('[data-testid="findings-list"] li');
    expect(findingItem?.textContent).toContain('Unit tests mock external clients.');
    const link = findingItem?.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://example.com/testing');
    expect(el.querySelector('[data-testid="searches-performed"]')?.textContent).toContain('3');
    expect(el.querySelector('[data-testid="mcp-calls-performed"]')?.textContent).toContain('2');
  });

  it('reflects the completed call request/response/usage/stopReason in the inspector panel', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeQuestion(el, 'What testing approach does this repo use?');
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/web-repo-research-reporter/run').flush(
      fixtureEnvelope({
        request: { marker: 'research-request' },
        response: { marker: 'research-response' },
        usage: { inputTokens: 40, outputTokens: 25 },
      }),
    );
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    expect(el.textContent).toContain('research-request');
    expect(el.textContent).toContain('research-response');
    expect(el.textContent).toContain('stop_reason: end_turn');
  });

  it('shows skeleton placeholders instead of blanking the result section while a run is in flight, held for at least MIN_RUN_MS', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeQuestion(el, 'What testing approach does this repo use?');
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="brief-result-skeleton"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="brief-summary"]')).toBeFalsy();

    httpMock.expectOne('/api/web-repo-research-reporter/run').flush(fixtureEnvelope());

    // The HTTP response has already landed, but MIN_RUN_MS hasn't elapsed yet — skeleton still holds.
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS - 50);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="brief-result-skeleton"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="brief-summary"]')).toBeFalsy();

    await vi.advanceTimersByTimeAsync(50);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="brief-result-skeleton"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="brief-summary"]')).toBeTruthy();
  });

  it('shows a visible error state when the request fails, not a silent failure', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typeQuestion(el, 'What testing approach does this repo use?');
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/web-repo-research-reporter/run').flush(
      { error: { message: 'Server error' } },
      { status: 500, statusText: 'Server Error' },
    );
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    const alert = el.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('failed');
  });
});
