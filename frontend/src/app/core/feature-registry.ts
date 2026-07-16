import type { FeatureRoute } from './feature-route';

/**
 * Every feature's route, keyed by slug.
 * Array order is the nav render order, by design.
 */
export const FEATURE_ROUTES: readonly FeatureRoute[] = [
  {
    slug: 'home',
    label: 'Home',
    loadComponent: () => import('../home/home').then((m) => m.Home),
  },
  {
    slug: 'messages-console',
    label: 'Messages Console',
    loadComponent: () =>
      import('../messages-console/messages-console').then((m) => m.MessagesConsole),
  },
  {
    slug: 'structured-output-console',
    label: 'Structured Output Console',
    loadComponent: () =>
      import('../structured-output-console/structured-output-console').then(
        (m) => m.StructuredOutputConsole,
      ),
  },
];
