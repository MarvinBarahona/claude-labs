import { FactoryProvider, InjectionToken, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppConfigService } from '../config/config.service';

export interface FakeSwitchOptions<T> {
  real: Type<T>;
  fake: Type<T>;
}

/** Binds `provide` to `options.real` or `options.fake` based on `AppConfigService.fakeMode`. See fake-mode.md. */
export function fakeSwitchProvider<T>(
  provide: InjectionToken,
  options: FakeSwitchOptions<T>,
): FactoryProvider<T> {
  return {
    provide,
    useFactory: (config: AppConfigService, moduleRef: ModuleRef) =>
      moduleRef.create(config.fakeMode ? options.fake : options.real),
    inject: [AppConfigService, ModuleRef],
  };
}
