import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { buildFeatureRoutes } from '../../core/build-feature-routes';
import type { FeatureRoute } from '../../core/feature-route';

@Component({ selector: 'app-mock-first', template: 'First feature content' })
class MockFirst {}

@Component({ selector: 'app-mock-second', template: 'Second feature content' })
class MockSecond {}

const mockFeatures: FeatureRoute[] = [
  { slug: 'first-feature', label: 'First', loadComponent: () => Promise.resolve(MockFirst) },
  { slug: 'second-feature', label: 'Second', loadComponent: () => Promise.resolve(MockSecond) },
];

describe('Layout routing', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(buildFeatureRoutes(mockFeatures), withComponentInputBinding())],
    });
  });

  it('renders a feature route inside the persistent header/chrome, swapping content per route', async () => {
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/first-feature');
    let text = (harness.routeNativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Claude Labs');
    expect(text).toContain('First feature content');

    await harness.navigateByUrl('/second-feature');
    text = (harness.routeNativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Second feature content');
    expect(text).not.toContain('First feature content');
  });

  it('redirects the root route to the first mock feature in registry order', async () => {
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/');
    const text = (harness.routeNativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('First feature content');
  });

  it('marks the currently active route link distinctly in the nav sidebar', async () => {
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/first-feature');
    const root = harness.routeNativeElement as HTMLElement;
    const links = Array.from(root.querySelectorAll('a'));
    const activeLink = links.find((a) => a.getAttribute('href') === '/first-feature');
    const inactiveLink = links.find((a) => a.getAttribute('href') === '/second-feature');

    expect(activeLink?.classList.contains('nav-link-active')).toBe(true);
    expect(inactiveLink?.classList.contains('nav-link-active')).toBe(false);
  });

  it('lazy-loads each feature route rather than bundling it eagerly', () => {
    const routes = buildFeatureRoutes(mockFeatures);
    const children = routes[0].children ?? [];
    const featureRoute = children.find((route) => route.path === 'first-feature');

    expect(typeof featureRoute?.loadComponent).toBe('function');
    expect(featureRoute?.component).toBeUndefined();
  });

  it('toggles the nav open via the header button, and closes it again after selecting a link', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/first-feature');
    const root = harness.routeNativeElement as HTMLElement;
    const nav = root.querySelector('nav') as HTMLElement;

    expect(nav.classList.contains('hidden')).toBe(true);

    const toggle = root.querySelector('button[aria-label="Toggle navigation"]') as HTMLElement;
    toggle.click();
    harness.fixture.detectChanges();
    expect(nav.classList.contains('hidden')).toBe(false);

    const link = root.querySelector('a[href="/second-feature"]') as HTMLElement;
    link.click();
    harness.fixture.detectChanges();
    expect(nav.classList.contains('hidden')).toBe(true);
  });
});
