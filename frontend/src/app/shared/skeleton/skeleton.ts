import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  templateUrl: './skeleton.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Skeleton {
  readonly widthClass = input('w-full');
  readonly heightPx = input(16);
  readonly borderRadiusPx = input(4);
}
