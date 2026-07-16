import { FEATURE_ROUTES } from './feature-registry';

describe('FEATURE_ROUTES', () => {
  it('has home as the first entry, so the root route redirects to it', () => {
    expect(FEATURE_ROUTES[0]?.slug).toBe('home');
  });
});
