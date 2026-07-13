import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DocsPanel } from './docs-panel';

describe('DocsPanel', () => {
  async function createFixture(slug: string) {
    await TestBed.configureTestingModule({
      imports: [DocsPanel],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(DocsPanel);
    fixture.componentRef.setInput('slug', slug);
    fixture.detectChanges();
    const httpMock = TestBed.inject(HttpTestingController);
    return { fixture, httpMock };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('fetches and renders the in-app doc for the given slug inline', async () => {
    const { fixture, httpMock } = await createFixture('foundations-console');

    const request = httpMock.expectOne('/lab-docs/foundations-console.md');
    request.flush('# Foundations Console\n\nAn intro paragraph.');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toBe('Foundations Console');
    expect(el.querySelector('p')?.textContent).toBe('An intro paragraph.');
  });

  it('renders headings, lists, code blocks and links as formatted markup, not raw text', async () => {
    const { fixture, httpMock } = await createFixture('foundations-console');

    const markdown = [
      '## A heading',
      '',
      '- first item',
      '- second item',
      '',
      '```ts',
      'const x = 1;',
      '```',
      '',
      '[a link](https://example.com)',
    ].join('\n');
    httpMock.expectOne('/lab-docs/foundations-console.md').flush(markdown);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent).toBe('A heading');
    expect(el.querySelectorAll('ul li').length).toBe(2);
    expect(el.querySelector('pre code')?.textContent).toContain('const x = 1;');
    const link = el.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(link?.textContent).toBe('a link');
  });

  it('fails visibly rather than showing a silent blank panel when the doc file is missing', async () => {
    const { fixture, httpMock } = await createFixture('no-such-lab');

    httpMock
      .expectOne('/lab-docs/no-such-lab.md')
      .flush('Not Found', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain("Couldn't load the docs for this lab.");
  });
});
