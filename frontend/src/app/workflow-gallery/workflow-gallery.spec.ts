import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WorkflowGallery } from './workflow-gallery';

// The component holds isRunning (and its result skeletons) for at least this long — see MIN_RUN_MS.
const MIN_RUN_MS = 500;

describe('WorkflowGallery', () => {
  async function createFixture(
    issues: { number: number; title: string }[] = [
      { number: 12, title: 'Login button misaligned' },
      { number: 34, title: 'Add dark mode' },
    ],
  ) {
    await TestBed.configureTestingModule({
      imports: [WorkflowGallery],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(WorkflowGallery);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // Drain the embedded DocsPanel's own markdown fetch so it doesn't count as an unexpected request.
    httpMock.expectOne('/lab-docs/workflow-gallery.md').flush('# Workflow Gallery');
    // Drain the component's own issue-picker fetch.
    httpMock.expectOne('/api/workflow-gallery/issues').flush({ issues });
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

  it('renders the routed category, draft, grading criteria, and iteration count, and reflects the full envelope in the inspector panel', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    selectIssue(el, 12);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/workflow-gallery/run');
    expect(req.request.body).toEqual({ issueNumber: 12 });

    req.flush({
      request: { marker: 'workflow-request' },
      response: { marker: 'workflow-response' },
      calls: [{ request: { marker: 'call-1-request' }, response: { marker: 'call-1-response' } }],
      usage: { inputTokens: 40, outputTokens: 25 },
      stopReason: 'end_turn',
      route: 'bug',
      draft: 'Thanks for the report — we are looking into the misaligned login button.',
      grading: [
        { criterion: 'tone', pass: true, feedback: 'Friendly and on-brand.' },
        { criterion: 'technical-accuracy', pass: true, feedback: 'Correctly references the reported issue.' },
        { criterion: 'policy-compliance', pass: false, feedback: 'Missing the required escalation disclaimer.' },
      ],
      iterations: 2,
      passed: true,
      cache: { read: false, write: true },
    });
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="route"]')?.textContent).toContain('bug');
    expect(el.querySelector('[data-testid="draft-text"]')?.textContent).toContain('Thanks for the report');

    const gradingItems = el.querySelectorAll('[data-testid="grading-list"] li');
    expect(gradingItems.length).toBe(3);
    expect(gradingItems[0].textContent).toContain('tone');
    expect(gradingItems[0].textContent).toContain('Pass');
    expect(gradingItems[0].textContent).toContain('Friendly and on-brand.');
    expect(gradingItems[2].textContent).toContain('policy-compliance');
    expect(gradingItems[2].textContent).toContain('Fail');
    expect(gradingItems[2].textContent).toContain('Missing the required escalation disclaimer.');

    expect(el.querySelector('[data-testid="iteration-summary"]')?.textContent).toContain('Passed on attempt 2 of 3');

    // The full envelope (request/response/calls/stopReason/usage) round-trips into the inspector panel.
    expect(el.textContent).toContain('workflow-request');
    expect(el.textContent).toContain('workflow-response');
    expect(el.textContent).toContain('call-1-request');
    expect(el.textContent).toContain('call-1-response');
    expect(el.textContent).toContain('stop_reason: end_turn');
  });

  it('renders "Did not pass after 3 attempts" when the attempt cap is hit without passing', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    selectIssue(el, 34);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/workflow-gallery/run').flush({
      request: {},
      response: {},
      calls: [{ request: {}, response: {} }],
      stopReason: 'end_turn',
      route: 'feature-request',
      draft: 'draft text',
      grading: [
        { criterion: 'tone', pass: true, feedback: 'ok' },
        { criterion: 'technical-accuracy', pass: false, feedback: 'inaccurate' },
        { criterion: 'policy-compliance', pass: true, feedback: 'ok' },
      ],
      iterations: 3,
      passed: false,
      cache: { read: false, write: false },
    });
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="iteration-summary"]')?.textContent).toContain('Did not pass after 3 attempts');
  });

  it('shows skeleton placeholders instead of blanking the result section while a run is in flight, held for at least MIN_RUN_MS', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    selectIssue(el, 12);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="run-result-skeleton"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="route"]')).toBeFalsy();

    httpMock.expectOne('/api/workflow-gallery/run').flush({
      request: {},
      response: {},
      calls: [{ request: {}, response: {} }],
      stopReason: 'end_turn',
      route: 'question',
      draft: 'draft text',
      grading: [
        { criterion: 'tone', pass: true, feedback: 'ok' },
        { criterion: 'technical-accuracy', pass: true, feedback: 'ok' },
        { criterion: 'policy-compliance', pass: true, feedback: 'ok' },
      ],
      iterations: 1,
      passed: true,
      cache: { read: false, write: false },
    });

    // The HTTP response has already landed, but MIN_RUN_MS hasn't elapsed yet — skeleton still holds.
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS - 50);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="run-result-skeleton"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="route"]')).toBeFalsy();

    await vi.advanceTimersByTimeAsync(50);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="run-result-skeleton"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="route"]')?.textContent).toContain('question');
  });

  it('shows a visible error state when the request fails, not a silent failure', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    selectIssue(el, 12);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/workflow-gallery/run').flush(
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
