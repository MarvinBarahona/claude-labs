import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AppConfigService } from '../config/config.service';
import { ExternalApiError } from '../api-error-handling';
import {
  AnthropicClient,
  AnthropicMessage,
  AnthropicMessageParams,
  AnthropicStreamEvent,
} from './anthropic-client';

@Injectable()
export class RealAnthropicClient extends AnthropicClient {
  private readonly client: Anthropic;

  constructor(config: AppConfigService) {
    super();
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
  }

  async createMessage(
    params: AnthropicMessageParams,
  ): Promise<AnthropicMessage> {
    try {
      return await this.client.messages.create({
        ...params,
        stream: false,
      });
    } catch (error) {
      throw toExternalApiError(error);
    }
  }

  async *streamMessage(
    params: AnthropicMessageParams,
  ): AsyncIterable<AnthropicStreamEvent> {
    try {
      const stream = await this.client.messages.create({
        ...params,
        stream: true,
      });
      for await (const event of stream) {
        yield event;
      }
    } catch (error) {
      throw toExternalApiError(error);
    }
  }

  async uploadFile(bytes: Buffer, mediaType: string): Promise<{ id: string }> {
    try {
      const file = await Anthropic.toFile(bytes, undefined, {
        type: mediaType,
      });
      const uploadResult = await this.client.beta.files.upload({
        file,
        betas: ['files-api-2025-04-14'],
      });
      return { id: uploadResult.id };
    } catch (error) {
      throw toExternalApiError(error);
    }
  }
}

function toExternalApiError(error: unknown): ExternalApiError {
  const message = error instanceof Error ? error.message : String(error);
  return new ExternalApiError('anthropic', message);
}
