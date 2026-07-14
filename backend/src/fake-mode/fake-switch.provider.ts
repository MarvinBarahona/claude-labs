import { FactoryProvider, InjectionToken, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppConfigService } from '../config/config.service';

export interface FakeSwitchOptions<T> {
  /** The real implementation, bound when `AppConfigService.fakeMode` is `false`. */
  real: Type<T>;
  /** The fake implementation (from `backend/src/testing/`), bound when `fakeMode` is `true`. */
  fake: Type<T>;
}

/**
 * Builds a Nest provider that binds `provide` to `options.real` or
 * `options.fake` based on `AppConfigService.fakeMode` — the one shared
 * switch every external-client module uses instead of reinventing its own
 * if/else. Both classes must be `@Injectable()` so `ModuleRef.create()` can
 * resolve their own constructor dependencies via DI, exactly as if either
 * had been registered as the provider directly.
 */
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
