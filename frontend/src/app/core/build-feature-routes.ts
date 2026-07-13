import type { Routes } from '@angular/router';
import { Layout } from '../shared/layout/layout';
import type { FeatureRoute } from './feature-route';

/**
 * Builds the app's routes: a persistent `Layout` wrapping one lazy-loaded child route per feature, keyed by slug.
 * `features` order is the nav render order — the caller (the registry) owns ordering, not this function.
 */
export function buildFeatureRoutes(features: readonly FeatureRoute[]): Routes {
  const children: Routes = features.map((feature) => ({
    path: feature.slug,
    loadComponent: feature.loadComponent,
  }));

  if (features.length > 0) {
    children.push({ path: '', pathMatch: 'full', redirectTo: features[0].slug });
  }

  return [{ path: '', component: Layout, data: { features }, children }];
}
