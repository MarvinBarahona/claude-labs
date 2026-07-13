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
});
