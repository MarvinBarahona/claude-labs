import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AppModeService } from '../mode/app-mode.service';

@Component({
  selector: 'app-fake-mode-banner',
  templateUrl: './fake-mode-banner.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FakeModeBanner {
  private readonly appMode = inject(AppModeService);

  protected readonly fakeMode = computed(() => this.appMode.mode().fakeMode);
  protected readonly repoUrl = computed(() => this.appMode.mode().repoUrl);
}
