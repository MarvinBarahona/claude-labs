import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';

describe('App', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    httpMock.expectOne('/api/smoke-test').flush({ message: 'Hello from the claude-labs backend' });

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the smoke-test message', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    httpMock.expectOne('/api/smoke-test').flush({ message: 'Hello from the claude-labs backend' });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Hello from the claude-labs backend');
  });

  it('should re-request the smoke test when reload is clicked', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    httpMock.expectOne('/api/smoke-test').flush({ message: 'Hello from the claude-labs backend' });

    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector('button')?.dispatchEvent(new Event('click', { bubbles: true }));
    await fixture.whenStable();

    httpMock.expectOne('/api/smoke-test').flush({ message: 'Hello from the claude-labs backend' });
  });
});
