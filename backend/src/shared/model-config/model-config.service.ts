import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { ModelTier, ThinkingEffort } from './model-config.types';

/** Not env-configurable — there's no per-lab reason to vary it, unlike the model/effort knobs below. */
const DEFAULT_MAX_TOKENS = 4096;

@Injectable()
export class ModelConfigService {
  constructor(private readonly config: AppConfigService) {}

  getModel(tier: ModelTier): string {
    switch (tier) {
      case 'default':
        return this.config.modelDefault;
      case 'classification':
        return this.config.modelClassification;
      case 'hardest-call':
        return this.config.modelHardestCall;
    }
  }

  getThinkingEffort(): ThinkingEffort {
    return this.config.thinkingEffortDefault;
  }

  getDefaultMaxTokens(): number {
    return DEFAULT_MAX_TOKENS;
  }
}
