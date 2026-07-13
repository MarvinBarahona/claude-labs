import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Nav } from '../nav/nav';
import type { FeatureRoute } from '../../core/feature-route';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, Nav],
  templateUrl: './layout.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Layout {
  readonly features = input<readonly FeatureRoute[]>([]);
}
