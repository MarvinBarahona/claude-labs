import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import type { FeatureRoute } from '../../core/feature-route';

@Component({
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './nav.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Nav {
  readonly features = input.required<readonly FeatureRoute[]>();
}
