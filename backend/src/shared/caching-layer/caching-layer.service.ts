import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicMessageParams } from '../anthropic-client/anthropic-client';
import { TurnUsage } from '../envelope-builder/envelope-builder.types';
import { CacheBoundary } from './caching-layer.types';

type CacheControlEphemeral = Anthropic.Messages.CacheControlEphemeral;
type TextBlockParam = Anthropic.Messages.TextBlockParam;
type ContentBlockParam = Anthropic.Messages.ContentBlockParam;
type ToolUnion = Anthropic.Messages.ToolUnion;
type MessageParam = Anthropic.Messages.MessageParam;

const MAX_BOUNDARIES = 4;
const EPHEMERAL: CacheControlEphemeral = { type: 'ephemeral' };

function withCacheControl<
  T extends { cache_control?: CacheControlEphemeral | null },
>(block: T): T {
  return { ...block, cache_control: EPHEMERAL };
}

function toTextBlock(text: string): TextBlockParam {
  return { type: 'text', text };
}

/** A plain string content isn't itself a block that can carry `cache_control`, so it's normalized to a one-element array first. */
function asContentBlocks(
  content: string | ContentBlockParam[],
): ContentBlockParam[] {
  return typeof content === 'string' ? [toTextBlock(content)] : [...content];
}

@Injectable()
export class CachingLayerService {
  markBreakpoints(
    params: AnthropicMessageParams,
    boundaries: CacheBoundary[],
  ): AnthropicMessageParams {
    if (boundaries.length > MAX_BOUNDARIES) {
      throw new Error(
        `markBreakpoints: at most ${MAX_BOUNDARIES} cache boundaries allowed, got ${boundaries.length}`,
      );
    }

    return boundaries.reduce(
      (next, boundary) => this.applyBoundary(next, boundary),
      params,
    );
  }

  readCacheStatus(usage: TurnUsage): { read: boolean; write: boolean } {
    return {
      read: (usage.cacheReadInputTokens ?? 0) > 0,
      write: (usage.cacheCreationInputTokens ?? 0) > 0,
    };
  }

  private applyBoundary(
    params: AnthropicMessageParams,
    boundary: CacheBoundary,
  ): AnthropicMessageParams {
    switch (boundary.region) {
      case 'tools':
        return { ...params, tools: this.markLastTool(params.tools ?? []) };
      case 'system':
        return { ...params, system: this.markLastSystemBlock(params.system) };
      case 'messages':
        return {
          ...params,
          messages: this.markLastMessageBlock(
            params.messages,
            boundary.messageIndex,
          ),
        };
    }
  }

  private markLastTool(tools: ToolUnion[]): ToolUnion[] {
    const marked = [...tools];
    marked[marked.length - 1] = withCacheControl(marked[marked.length - 1]);
    return marked;
  }

  private markLastSystemBlock(
    system: AnthropicMessageParams['system'],
  ): TextBlockParam[] {
    const blocks =
      typeof system === 'string' ? [toTextBlock(system)] : [...(system ?? [])];
    blocks[blocks.length - 1] = withCacheControl(blocks[blocks.length - 1]);
    return blocks;
  }

  private markLastMessageBlock(
    messages: MessageParam[],
    messageIndex: number,
  ): MessageParam[] {
    const marked = [...messages];
    const target = marked[messageIndex];
    const content = asContentBlocks(target.content);
    content[content.length - 1] = withCacheControl(content[content.length - 1]);
    marked[messageIndex] = { ...target, content };
    return marked;
  }
}
