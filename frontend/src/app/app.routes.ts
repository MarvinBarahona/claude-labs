import type { Routes } from '@angular/router';
import { buildFeatureRoutes } from './core/build-feature-routes';
import { FEATURE_ROUTES } from './core/feature-registry';

export const routes: Routes = buildFeatureRoutes(FEATURE_ROUTES);
