import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Nav } from './nav';
import type { FeatureRoute } from '../../core/feature-route';

class MockComponent {}

const mockFeatures: FeatureRoute[] = [
  { slug: 'alpha', label: 'Alpha', loadComponent: () => Promise.resolve(MockComponent) },
  { slug: 'beta', label: 'Beta', loadComponent: () => Promise.resolve(MockComponent) },
  { slug: 'gamma', label: 'Gamma', loadComponent: () => Promise.resolve(MockComponent) },
];

describe('Nav', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Nav],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders feature links in the given registry order', () => {
    const fixture = TestBed.createComponent(Nav);
    fixture.componentRef.setInput('features', mockFeatures);
    fixture.detectChanges();

    const labels = Array.from(fixture.nativeElement.querySelectorAll('a')).map((a) =>
      (a as HTMLElement).textContent?.trim(),
    );
    expect(labels).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('is hidden by default (mobile overlay closed) and shown when open is true', () => {
    const fixture = TestBed.createComponent(Nav);
    fixture.componentRef.setInput('features', mockFeatures);
    fixture.detectChanges();

    const nav = fixture.nativeElement.querySelector('nav') as HTMLElement;
    expect(nav.classList.contains('hidden')).toBe(true);

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(nav.classList.contains('hidden')).toBe(false);
    expect(nav.classList.contains('flex')).toBe(true);
  });

  it('emits linkClick when a nav link is clicked', () => {
    const fixture = TestBed.createComponent(Nav);
    fixture.componentRef.setInput('features', mockFeatures);
    fixture.detectChanges();

    let emitted = false;
    fixture.componentInstance.linkClick.subscribe(() => (emitted = true));

    const link = fixture.nativeElement.querySelector('a') as HTMLElement;
    link.dispatchEvent(new Event('click', { bubbles: true }));

    expect(emitted).toBe(true);
  });
});
