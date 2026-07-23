import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ExtendedThinkingBench } from './extended-thinking-bench';

// The component holds isRunning (and its result skeletons) for at least this long — see MIN_RUN_MS.
const MIN_RUN_MS = 500;

function threeRunsBody() {
  return {
    issue: { number: 12, title: 'Login button misaligned' },
    runs: [
      {
        label: 'thinking-off',
        envelope: {
          request: { marker: 'off-request' },
          response: { marker: 'off-response' },
          usage: { inputTokens: 10, outputTokens: 20 },
          stopReason: 'end_turn',
        },
        latencyMs: 120,
        answer: 'Plain answer, no thinking.',
        reasoningTrace: null,
      },
      {
        label: 'thinking-medium',
        envelope: {
          request: { marker: 'medium-request' },
          response: { marker: 'medium-response' },
          usage: { inputTokens: 15, outputTokens: 40 },
          stopReason: 'end_turn',
        },
        latencyMs: 480,
        answer: 'Medium-effort answer.',
        reasoningTrace: 'Considering the medium-effort angle...',
      },
      {
        label: 'thinking-high',
        envelope: {
          request: { marker: 'high-request' },
          response: { marker: 'high-response' },
          usage: { inputTokens: 15, outputTokens: 90 },
          stopReason: 'end_turn',
        },
        latencyMs: 910,
        answer: 'High-effort answer.',
        reasoningTrace: 'Considering the high-effort angle in depth...',
      },
    ],
  };
}

describe('ExtendedThinkingBench', () => {
  async function createFixture(
    issues: { number: number; title: string }[] = [
      { number: 12, title: 'Login button misaligned' },
      { number: 34, title: 'Add dark mode' },
    ],
  ) {
    await TestBed.configureTestingModule({
      imports: [ExtendedThinkingBench],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExtendedThinkingBench);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // Drain the embedded DocsPanel's own markdown fetch so it doesn't count as an unexpected request.
    httpMock.expectOne('/lab-docs/extended-thinking-bench.md').flush('# Extended Thinking Bench');
    // Drain the component's own issue-picker fetch.
    httpMock.expectOne('/api/extended-thinking-bench/issues').flush({ issues });
    fixture.detectChanges();
    return { fixture, httpMock, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function selectEl(el: HTMLElement): HTMLSelectElement {
    return el.querySelector('[aria-label="Select an issue"]') as HTMLSelectElement;
  }

  function selectIssue(el: HTMLElement, issueNumber: number): void {
    const select = selectEl(el);
    select.value = String(issueNumber);
    select.dispatchEvent(new Event('change'));
  }

  function runButton(el: HTMLElement): HTMLButtonElement {
    const buttons = Array.from(el.querySelectorAll('button'));
    return buttons.find((b) => b.textContent?.trim() === 'Run') as HTMLButtonElement;
  }

  it('populates the issue picker from GET /issues', async () => {
    const { el } = await createFixture();

    const options = Array.from(selectEl(el).options).filter((option) => option.value !== '');
    expect(options.length).toBe(2);
    expect(options[0].textContent).toContain('#12 — Login button misaligned');
    expect(options[1].textContent).toContain('#34 — Add dark mode');
  });

  it('auto-selects the first issue once the picker loads, enabling Run without an explicit selection', async () => {
    const { el } = await createFixture();

    expect(selectEl(el).value).toBe('12');
    expect(runButton(el).disabled).toBe(false);
  });

  it('still allows picking a different issue from the auto-selected default', async () => {
    const { fixture, el } = await createFixture();

    selectIssue(el, 34);
    fixture.detectChanges();
    expect(selectEl(el).value).toBe('34');
    expect(runButton(el).disabled).toBe(false);
  });

  it('renders answer/reasoning-trace/latency/usage per run, and feeds each envelope into its own inspector-panel instance', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    selectIssue(el, 12);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/extended-thinking-bench/run');
    expect(req.request.body).toEqual({ issueNumber: 12 });

    req.flush(threeRunsBody());
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    const offColumn = el.querySelector('[data-testid="comparison-column-thinking-off"]') as HTMLElement;
    expect(offColumn.querySelector('[data-testid="answer-text"]')?.textContent).toContain(
      'Plain answer, no thinking.',
    );
    expect(offColumn.querySelector('[data-testid="reasoning-trace"]')?.textContent).toContain(
      'No thinking used for this run.',
    );
    expect(offColumn.querySelector('[data-testid="latency"]')?.textContent).toContain('120ms');
    expect(offColumn.querySelector('[data-testid="usage"]')?.textContent).toContain('10 in / 20 out');

    const mediumColumn = el.querySelector('[data-testid="comparison-column-thinking-medium"]') as HTMLElement;
    expect(mediumColumn.querySelector('[data-testid="answer-text"]')?.textContent).toContain(
      'Medium-effort answer.',
    );
    expect(mediumColumn.querySelector('[data-testid="reasoning-trace"]')?.textContent).toContain(
      'Considering the medium-effort angle...',
    );

    const highColumn = el.querySelector('[data-testid="comparison-column-thinking-high"]') as HTMLElement;
    expect(highColumn.querySelector('[data-testid="answer-text"]')?.textContent).toContain(
      'High-effort answer.',
    );
    expect(highColumn.querySelector('[data-testid="reasoning-trace"]')?.textContent).toContain(
      'Considering the high-effort angle in depth...',
    );

    const inspectors = el.querySelectorAll('app-inspector-panel');
    expect(inspectors.length).toBe(3);
    const inspectorTitles = Array.from(inspectors).map((panel) => panel.querySelector('h2')?.textContent);
    expect(inspectorTitles).toEqual([
      'Inspector (Thinking Off)',
      'Inspector (Thinking — Medium Effort)',
      'Inspector (Thinking — High Effort)',
    ]);
    expect(el.textContent).toContain('off-request');
    expect(el.textContent).toContain('off-response');
    expect(el.textContent).toContain('medium-request');
    expect(el.textContent).toContain('medium-response');
    expect(el.textContent).toContain('high-request');
    expect(el.textContent).toContain('high-response');
  });

  it('shows skeleton placeholders instead of blanking the comparison section while a run is in flight, held for at least MIN_RUN_MS', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    selectIssue(el, 12);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    expect(el.querySelectorAll('[data-testid="comparison-column-skeleton"]').length).toBe(3);
    expect(el.querySelector('[data-testid="comparison-column-thinking-off"]')).toBeFalsy();

    httpMock.expectOne('/api/extended-thinking-bench/run').flush(threeRunsBody());

    // The HTTP response has already landed, but MIN_RUN_MS hasn't elapsed yet — skeleton still holds.
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS - 50);
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="comparison-column-skeleton"]').length).toBe(3);
    expect(el.querySelector('[data-testid="comparison-column-thinking-off"]')).toBeFalsy();

    await vi.advanceTimersByTimeAsync(50);
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="comparison-column-skeleton"]').length).toBe(0);
    expect(el.querySelector('[data-testid="comparison-column-thinking-off"]')).toBeTruthy();
  });

  it('shows a visible error state when the request fails, not a silent failure', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    selectIssue(el, 12);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/extended-thinking-bench/run').flush(
      { error: { message: 'Server error' } },
      { status: 500, statusText: 'Server Error' },
    );
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    const alert = el.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('Server error');
  });
});
