import { OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';

/** Disables Angular 21's `usePopover` CDK overlay behavior, which otherwise renders overlay-based components above `position: fixed` elements like `<hlm-toaster>`. */
export function provideSpartanHlm(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: OVERLAY_DEFAULT_CONFIG,
      useValue: { usePopover: false },
    },
  ]);
}
