import { Injectable } from '@nestjs/common';
import { AnthropicClient } from '../anthropic-client/anthropic-client';
import {
  ContentBlock,
  ContentBlockDeliveryMode,
} from './content-block-builder.types';

function blockType(mediaType: string): 'document' | 'image' {
  return mediaType === 'application/pdf' ? 'document' : 'image';
}

@Injectable()
export class ContentBlockBuilderService {
  constructor(private readonly anthropicClient: AnthropicClient) {}

  async buildBlock(
    bytes: Buffer,
    mediaType: string,
    mode: ContentBlockDeliveryMode,
  ): Promise<ContentBlock> {
    const type = blockType(mediaType);
    if (mode === 'files-api') {
      const uploadResult = await this.anthropicClient.uploadFile(
        bytes,
        mediaType,
      );
      return { type, source: { type: 'file', file_id: uploadResult.id } };
    }
    return {
      type,
      source: {
        type: 'base64',
        media_type: mediaType,
        data: bytes.toString('base64'),
      },
    };
  }
}
