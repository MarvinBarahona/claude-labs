import type { FeatureRoute } from './feature-route';

/**
 * Every feature's route, keyed by slug — appended here as each feature graduates.
 * Array order is the nav render order: place a new entry per its own plan file's
 * `**Nav position:**` value (`first` / `last` / `before <slug>` / `after <slug>`) at the time it's added.
 */
export const FEATURE_ROUTES: readonly FeatureRoute[] = [
  {
    slug: 'foundations-console',
    label: 'Foundations Console',
    loadComponent: () =>
      import('../foundations-console/foundations-console').then((m) => m.FoundationsConsole),
  },
];
