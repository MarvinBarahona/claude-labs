import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FakeModeBanner } from './fake-mode-banner';

describe('FakeModeBanner', () => {
  async function createFixture() {
    await TestBed.configureTestingModule({
      imports: [FakeModeBanner],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(FakeModeBanner);
    const httpMock = TestBed.inject(HttpTestingController);
    return { fixture, httpMock };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('renders nothing when fake mode is off', async () => {
    const { fixture, httpMock } = await createFixture();
    fixture.detectChanges();

    httpMock.expectOne('/api/mode').flush({ fakeMode: false });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent?.trim()).toBe('');
  });

  it('renders the explanatory banner with a repo link when fake mode is on and repoUrl is set', async () => {
    const { fixture, httpMock } = await createFixture();
    fixture.detectChanges();

    httpMock
      .expectOne('/api/mode')
      .flush({ fakeMode: true, repoUrl: 'https://github.com/example/claude-labs' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('demo instance running on fabricated data');
    const link = el.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://github.com/example/claude-labs');
  });

  it('renders explanatory text with no link when fake mode is on and repoUrl is absent', async () => {
    const { fixture, httpMock } = await createFixture();
    fixture.detectChanges();

    httpMock.expectOne('/api/mode').flush({ fakeMode: true });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('demo instance running on fabricated data');
    expect(el.querySelector('a')).toBeNull();
  });

  it('renders nothing when the /api/mode request errors', async () => {
    const { fixture, httpMock } = await createFixture();
    fixture.detectChanges();

    httpMock.expectOne('/api/mode').flush('error', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent?.trim()).toBe('');
  });
});
