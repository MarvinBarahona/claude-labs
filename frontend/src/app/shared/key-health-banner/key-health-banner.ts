import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AppModeService } from '../mode/app-mode.service';

@Component({
  selector: 'app-key-health-banner',
  templateUrl: './key-health-banner.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyHealthBanner {
  private readonly appMode = inject(AppModeService);

  protected readonly keyInvalid = computed(() => this.appMode.mode().keyStatus === 'invalid');
}
