import { buildFeatureRoutes } from './build-feature-routes';
import type { FeatureRoute } from './feature-route';

class MockComponent {}

const mockFeatures: FeatureRoute[] = [
  { slug: 'alpha', label: 'Alpha', loadComponent: () => Promise.resolve(MockComponent) },
  { slug: 'beta', label: 'Beta', loadComponent: () => Promise.resolve(MockComponent) },
  { slug: 'gamma', label: 'Gamma', loadComponent: () => Promise.resolve(MockComponent) },
];

describe('buildFeatureRoutes', () => {
  it('keys each feature route by slug behind a lazy loadComponent, not an eager component', () => {
    const routes = buildFeatureRoutes(mockFeatures);
    const children = routes[0].children ?? [];
    const featureChildren = children.filter((route) => route.path !== '');

    expect(featureChildren).toHaveLength(mockFeatures.length);
    for (const feature of mockFeatures) {
      const route = featureChildren.find((r) => r.path === feature.slug);
      expect(route).toBeTruthy();
      expect(typeof route?.loadComponent).toBe('function');
      expect(route?.component).toBeUndefined();
    }
  });

  it('redirects the root route to the first feature in registry order', () => {
    const routes = buildFeatureRoutes(mockFeatures);
    const children = routes[0].children ?? [];
    const redirect = children.find((route) => route.path === '');

    expect(redirect?.redirectTo).toBe('alpha');
  });

  it('omits the default redirect when there are no features to redirect to', () => {
    const routes = buildFeatureRoutes([]);
    const children = routes[0].children ?? [];

    expect(children).toHaveLength(0);
  });
});
