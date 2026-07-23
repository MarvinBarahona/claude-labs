import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DataCodeSandbox } from './data-code-sandbox';

// The component holds isRunning (and its result skeletons) for at least this long — see MIN_RUN_MS.
const MIN_RUN_MS = 500;

describe('DataCodeSandbox', () => {
  async function createFixture() {
    await TestBed.configureTestingModule({
      imports: [DataCodeSandbox],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(DataCodeSandbox);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // Drain the embedded DocsPanel's own markdown fetch so it doesn't count as an unexpected request.
    httpMock.expectOne('/lab-docs/data-code-sandbox.md').flush('# Data & Code Sandbox');
    fixture.detectChanges();
    return { fixture, httpMock, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function typePrompt(el: HTMLElement, text: string): void {
    const textarea = el.querySelector('[aria-label="Analysis prompt"]') as HTMLTextAreaElement;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
  }

  function checkUseSkill(el: HTMLElement, checked: boolean): void {
    const checkbox = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = checked;
    checkbox.dispatchEvent(new Event('change'));
  }

  function runButton(el: HTMLElement): HTMLButtonElement {
    const buttons = Array.from(el.querySelectorAll('button'));
    return buttons.find((b) => b.textContent?.trim() === 'Run') as HTMLButtonElement;
  }

  it('disables the Run button until a prompt is entered', async () => {
    const { fixture, el } = await createFixture();

    expect(runButton(el).disabled).toBe(true);

    typePrompt(el, 'Chart commit frequency by month.');
    fixture.detectChanges();
    expect(runButton(el).disabled).toBe(false);
  });

  it('sends the prompt and useSkill flag in the request body', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typePrompt(el, 'Chart commit frequency by month.');
    checkUseSkill(el, true);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/data-code-sandbox/run');
    expect(req.request.body).toEqual({
      prompt: 'Chart commit frequency by month.',
      useSkill: true,
    });

    req.flush({
      request: {},
      response: {},
      stopReason: 'end_turn',
      executedCode: [],
      outputFiles: [],
      skillUsed: false,
    });
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();
  });

  it('renders executed code, stdout, and stderr from the response, and reflects the full envelope in the inspector panel', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typePrompt(el, 'Chart commit frequency by month.');
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/data-code-sandbox/run').flush({
      request: { marker: 'sandbox-request' },
      response: { marker: 'sandbox-response' },
      usage: { inputTokens: 30, outputTokens: 20 },
      stopReason: 'end_turn',
      executedCode: [
        { command: 'python analyze.py', stdout: 'analysis complete', stderr: '', returnCode: 0 },
        { command: 'python broken.py', stdout: '', stderr: 'Traceback...', returnCode: 1 },
      ],
      outputFiles: [],
      skillUsed: false,
    });
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="executed-code-list"] li:nth-child(1)')?.textContent).toContain(
      'python analyze.py',
    );
    expect(el.querySelector('[data-testid="executed-code-list"] li:nth-child(1)')?.textContent).toContain(
      'analysis complete',
    );
    expect(el.querySelector('[data-testid="executed-code-list"] li:nth-child(2)')?.textContent).toContain(
      'Traceback...',
    );

    expect(el.textContent).toContain('sandbox-request');
    expect(el.textContent).toContain('sandbox-response');
    expect(el.textContent).toContain('stop_reason: end_turn');
  });

  it('renders an image output file inline and a non-image output file as a download link', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typePrompt(el, 'Chart commit frequency by month.');
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/data-code-sandbox/run').flush({
      request: {},
      response: {},
      stopReason: 'end_turn',
      executedCode: [],
      outputFiles: [
        { fileId: 'file_1', filename: 'chart.png', mediaType: 'image/png', dataBase64: 'aW1n' },
        {
          fileId: 'file_2',
          filename: 'report.xlsx',
          mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dataBase64: 'eGxz',
        },
      ],
      skillUsed: false,
    });
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    const items = el.querySelectorAll('[data-testid="output-file-list"] li');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,aW1n');
    const link = items[1].querySelector('a') as HTMLAnchorElement;
    expect(link.textContent).toContain('report.xlsx');
    expect(link.getAttribute('download')).toBe('report.xlsx');
    expect(link.getAttribute('href')).toBe(
      'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,eGxz',
    );
  });

  it('reflects the skillUsed value from the response in the badge', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typePrompt(el, 'Export the data as a spreadsheet.');
    checkUseSkill(el, true);
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/data-code-sandbox/run').flush({
      request: {},
      response: {},
      stopReason: 'end_turn',
      executedCode: [],
      outputFiles: [],
      skillUsed: true,
    });
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="skill-used-badge"]')?.textContent).toContain('Yes');
  });

  it('shows skeleton placeholders instead of blanking the result section while a run is in flight, held for at least MIN_RUN_MS', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typePrompt(el, 'Chart commit frequency by month.');
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="run-result-skeleton"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="skill-used-badge"]')).toBeFalsy();

    httpMock.expectOne('/api/data-code-sandbox/run').flush({
      request: {},
      response: {},
      stopReason: 'end_turn',
      executedCode: [],
      outputFiles: [],
      skillUsed: false,
    });

    // The HTTP response has already landed, but MIN_RUN_MS hasn't elapsed yet — skeleton still holds.
    await vi.advanceTimersByTimeAsync(MIN_RUN_MS - 50);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="run-result-skeleton"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="skill-used-badge"]')).toBeFalsy();

    await vi.advanceTimersByTimeAsync(50);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="run-result-skeleton"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="skill-used-badge"]')).toBeTruthy();
  });

  it('shows a visible error state when the request fails, not a silent failure', async () => {
    vi.useFakeTimers();
    const { fixture, httpMock, el } = await createFixture();

    typePrompt(el, 'Chart commit frequency by month.');
    fixture.detectChanges();
    runButton(el).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/data-code-sandbox/run').flush(
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
