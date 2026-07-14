import { Controller, Get } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';

export interface ModeResponse {
  fakeMode: boolean;
  repoUrl?: string;
}

@Controller('mode')
export class ModeController {
  constructor(private readonly config: AppConfigService) {}

  @Get()
  getMode(): ModeResponse {
    const { fakeMode, repoUrl } = this.config;
    return repoUrl === undefined ? { fakeMode } : { fakeMode, repoUrl };
  }
}
