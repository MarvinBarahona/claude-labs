import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StructuredOutputConsole } from './structured-output-console';

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
  });

  function typeInput(el: HTMLElement, text: string): void {
    const textarea = el.querySelector('[aria-label="Structured input"]') as HTMLTextAreaElement;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
  }

  function clickRun(el: HTMLElement): void {
    const buttons = Array.from(el.querySelectorAll('button'));
    const run = buttons.find((b) => b.textContent?.trim() === 'Run') as HTMLButtonElement;
    run.click();
  }

  it('submits free text and renders the parsed summary/sentiment/actionItems fields, not raw JSON', async () => {
    const { fixture, httpMock, el } = await createFixture();

    typeInput(el, 'Team decided to ship on Friday.');
    fixture.detectChanges();
    clickRun(el);
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/structured-output-console/run');
    expect(req.request.body.input).toBe('Team decided to ship on Friday.');
    req.flush({
      request: {},
      response: {},
      usage: {},
      stopReason: 'end_turn',
      parsed: {
        summary: 'Team will ship on Friday.',
        sentiment: 'positive',
        actionItems: ['Ship on Friday'],
      },
    });
    fixture.detectChanges();

    expect(el.textContent).toContain('Team will ship on Friday.');
    expect(el.textContent).toContain('positive');
    expect(el.textContent).toContain('Ship on Friday');
  });

  it('reflects the completed call request/response/usage/stopReason in the inspector panel', async () => {
    const { fixture, httpMock, el } = await createFixture();

    typeInput(el, 'some free text');
    fixture.detectChanges();
    clickRun(el);
    fixture.detectChanges();

    httpMock.expectOne('/api/structured-output-console/run').flush({
      request: { marker: 'structured-call' },
      response: { marker: 'structured-response' },
      usage: { inputTokens: 7, outputTokens: 3 },
      stopReason: 'end_turn',
      parsed: { summary: 's', sentiment: 'neutral', actionItems: [] },
    });
    fixture.detectChanges();

    expect(el.textContent).toContain('structured-call');
    expect(el.textContent).toContain('stop_reason: end_turn');
  });

  it('shows a visible error state when the request fails, not a silent failure', async () => {
    const { fixture, httpMock, el } = await createFixture();

    typeInput(el, 'hello');
    fixture.detectChanges();
    clickRun(el);
    fixture.detectChanges();

    httpMock.expectOne('/api/structured-output-console/run').flush(
      { error: { message: 'Server error' } },
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();

    const alert = el.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('failed');
  });
});
