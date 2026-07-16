import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FEATURE_ROUTES } from '../core/feature-registry';
import { LAB_CATALOG } from '../core/lab-catalog';

interface LabIndexEntry {
  readonly slug: string;
  readonly label: string;
  readonly goal: string;
  readonly concepts: readonly string[];
}

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  protected readonly labs: readonly LabIndexEntry[] = FEATURE_ROUTES.filter(
    (feature) => feature.slug !== 'home',
  ).map((feature) => ({
    slug: feature.slug,
    label: feature.label,
    ...LAB_CATALOG[feature.slug],
  }));
}
