import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from './config.schema';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  get anthropicApiKey(): string {
    return this.configService.get('ANTHROPIC_API_KEY', { infer: true });
  }

  get githubTargetRepo(): string {
    return this.configService.get('GITHUB_TARGET_REPO', { infer: true });
  }

  get githubToken(): string | undefined {
    return this.configService.get('GITHUB_TOKEN', { infer: true });
  }

  get modelDefault(): string {
    return this.configService.get('MODEL_DEFAULT', { infer: true });
  }

  get modelClassification(): string {
    return this.configService.get('MODEL_CLASSIFICATION', { infer: true });
  }

  get modelHardestCall(): string {
    return this.configService.get('MODEL_HARDEST_CALL', { infer: true });
  }

  get thinkingEffortDefault(): EnvConfig['THINKING_EFFORT_DEFAULT'] {
    return this.configService.get('THINKING_EFFORT_DEFAULT', { infer: true });
  }
}
