import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { KeyHealthBanner } from './key-health-banner';

describe('KeyHealthBanner', () => {
  async function createFixture() {
    await TestBed.configureTestingModule({
      imports: [KeyHealthBanner],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(KeyHealthBanner);
    const httpMock = TestBed.inject(HttpTestingController);
    return { fixture, httpMock };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('renders nothing when keyStatus is valid', async () => {
    const { fixture, httpMock } = await createFixture();
    fixture.detectChanges();

    httpMock.expectOne('/api/mode').flush({ fakeMode: false, keyStatus: 'valid' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent?.trim()).toBe('');
  });

  it('renders nothing when keyStatus is absent (fake mode on)', async () => {
    const { fixture, httpMock } = await createFixture();
    fixture.detectChanges();

    httpMock.expectOne('/api/mode').flush({ fakeMode: true });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent?.trim()).toBe('');
  });

  it('renders the urgent banner when keyStatus is invalid', async () => {
    const { fixture, httpMock } = await createFixture();
    fixture.detectChanges();

    httpMock.expectOne('/api/mode').flush({ fakeMode: false, keyStatus: 'invalid' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('API key is invalid or expired');
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
