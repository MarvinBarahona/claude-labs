import type { Type } from '@angular/core';

export interface FeatureRoute {
  readonly slug: string;
  readonly label: string;
  readonly loadComponent: () => Promise<Type<unknown>>;
}
