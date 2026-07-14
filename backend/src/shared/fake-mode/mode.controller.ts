import { Controller, Get } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { KeyHealthService, KeyStatus } from '../key-health/key-health.service';

export interface ModeResponse {
  fakeMode: boolean;
  repoUrl?: string;
  keyStatus?: KeyStatus;
}

@Controller('mode')
export class ModeController {
  constructor(
    private readonly config: AppConfigService,
    private readonly keyHealth: KeyHealthService,
  ) {}

  @Get()
  async getMode(): Promise<ModeResponse> {
    const { fakeMode, repoUrl } = this.config;
    const base: ModeResponse =
      repoUrl === undefined ? { fakeMode } : { fakeMode, repoUrl };
    if (fakeMode) {
      return base;
    }
    return { ...base, keyStatus: await this.keyHealth.getKeyStatus() };
  }
}
