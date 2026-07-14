import { Injectable } from '@nestjs/common';
import Anthropic, { AuthenticationError } from '@anthropic-ai/sdk';
import { AppConfigService } from '../config/config.service';

export type KeyStatus = 'valid' | 'invalid';

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class KeyHealthService {
  private status: KeyStatus = 'valid';
  private checkedAt = 0;

  constructor(private readonly config: AppConfigService) {}

  async getKeyStatus(): Promise<KeyStatus> {
    if (Date.now() - this.checkedAt < CACHE_TTL_MS) {
      return this.status;
    }

    const client = new Anthropic({
      apiKey: this.config.anthropicApiKey,
      maxRetries: 0,
    });

    try {
      await client.models.list();
      this.status = 'valid';
    } catch (error) {
      if (error instanceof AuthenticationError) {
        this.status = 'invalid';
      }
      // Any other error (rate limit, network failure, 5xx) is inconclusive
      // about the key itself, so the previous cached status is kept as-is.
    }
    this.checkedAt = Date.now();
    return this.status;
  }
}
