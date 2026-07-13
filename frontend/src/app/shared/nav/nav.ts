import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
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
  /** Whether the nav is shown below the `lg` breakpoint, where it's an overlay hidden by default. */
  readonly open = input(false);
  readonly linkClick = output<void>();
}
