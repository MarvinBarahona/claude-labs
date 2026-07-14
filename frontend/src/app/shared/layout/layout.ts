import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Nav } from '../nav/nav';
import { FakeModeBanner } from '../fake-mode-banner/fake-mode-banner';
import type { FeatureRoute } from '../../core/feature-route';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, Nav, FakeModeBanner],
  templateUrl: './layout.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Layout {
  readonly features = input<readonly FeatureRoute[]>([]);

  protected readonly navOpen = signal(false);

  protected toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  protected closeNav(): void {
    this.navOpen.set(false);
  }
}
