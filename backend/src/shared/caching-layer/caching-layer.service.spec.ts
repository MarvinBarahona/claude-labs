import Anthropic from '@anthropic-ai/sdk';
import { AnthropicMessageParams } from '../anthropic-client/anthropic-client';
import { CachingLayerService } from './caching-layer.service';
import { CacheBoundary } from './caching-layer.types';

type AnthropicTool = Anthropic.Messages.Tool;

const EPHEMERAL = { type: 'ephemeral' as const };

function buildParams(
  overrides: Partial<AnthropicMessageParams> = {},
): AnthropicMessageParams {
  return {
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: 'hi' }],
    ...overrides,
  };
}

function buildTool(name: string): AnthropicTool {
  return { name, input_schema: { type: 'object' } };
}

describe('CachingLayerService', () => {
  const service = new CachingLayerService();

  describe('markBreakpoints', () => {
    it('attaches cache_control to the last element of tools for a tools boundary', () => {
      const params = buildParams({
        tools: [buildTool('a'), buildTool('b')],
      });

      const marked = service.markBreakpoints(params, [{ region: 'tools' }]);
      const tools = marked.tools as AnthropicTool[];

      expect(tools[0].cache_control).toBeUndefined();
      expect(tools[1].cache_control).toEqual(EPHEMERAL);
    });

    it('attaches cache_control to the system block, normalizing a bare string system into a one-element content-block array', () => {
      const params = buildParams({ system: 'be helpful' });

      const marked = service.markBreakpoints(params, [{ region: 'system' }]);

      expect(marked.system).toEqual([
        { type: 'text', text: 'be helpful', cache_control: EPHEMERAL },
      ]);
    });

    it('attaches cache_control to the last content block of messages[messageIndex], normalizing a bare string message content into a one-element content-block array', () => {
      const params = buildParams({
        messages: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'second' },
        ],
      });

      const marked = service.markBreakpoints(params, [
        { region: 'messages', messageIndex: 0 },
      ]);

      expect(marked.messages[0].content).toEqual([
        { type: 'text', text: 'first', cache_control: EPHEMERAL },
      ]);
      expect(marked.messages[1].content).toBe('second');
    });

    it('applies 2-4 mixed tools/system/messages boundaries independently in one call, leaving the input params unmutated', () => {
      const params = buildParams({
        system: 'be helpful',
        tools: [buildTool('a')],
        messages: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'second' },
        ],
      });
      const snapshot = JSON.parse(JSON.stringify(params)) as unknown;

      const marked = service.markBreakpoints(params, [
        { region: 'tools' },
        { region: 'system' },
        { region: 'messages', messageIndex: 1 },
      ]);

      const tools = marked.tools as AnthropicTool[];
      expect(tools[0].cache_control).toEqual(EPHEMERAL);
      expect(marked.system).toEqual([
        { type: 'text', text: 'be helpful', cache_control: EPHEMERAL },
      ]);
      expect(marked.messages[1].content).toEqual([
        { type: 'text', text: 'second', cache_control: EPHEMERAL },
      ]);
      expect(JSON.parse(JSON.stringify(params)) as unknown).toEqual(snapshot);
    });

    it('throws a clear error naming the count given when passed more than 4 boundaries', () => {
      const params = buildParams();
      const boundaries: CacheBoundary[] = [
        { region: 'tools' },
        { region: 'system' },
        { region: 'messages', messageIndex: 0 },
        { region: 'messages', messageIndex: 0 },
        { region: 'messages', messageIndex: 0 },
      ];

      expect(() => service.markBreakpoints(params, boundaries)).toThrow(
        'markBreakpoints: at most 4 cache boundaries allowed, got 5',
      );
    });
  });

  describe('readCacheStatus', () => {
    it('returns write: true, read: false when only cacheCreationInputTokens is present', () => {
      const status = service.readCacheStatus({
        inputTokens: 10,
        outputTokens: 5,
        cacheCreationInputTokens: 100,
      });

      expect(status).toEqual({ read: false, write: true });
    });

    it('returns read: true, write: false when only cacheReadInputTokens is present', () => {
      const status = service.readCacheStatus({
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 100,
      });

      expect(status).toEqual({ read: true, write: false });
    });

    it('returns read: false, write: false when neither is present', () => {
      const status = service.readCacheStatus({
        inputTokens: 10,
        outputTokens: 5,
      });

      expect(status).toEqual({ read: false, write: false });
    });
  });
});
