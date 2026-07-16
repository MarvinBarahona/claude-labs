import { AnthropicMessageParams } from '../anthropic-client/anthropic-client';
import { fakeTextMessage } from '../../testing/anthropic/message-builders';
import { EnvelopeBuilderService } from './envelope-builder.service';

function buildParams(): AnthropicMessageParams {
  return {
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: 'hi' }],
  };
}

describe('EnvelopeBuilderService', () => {
  const service = new EnvelopeBuilderService();

  it('maps usage with cacheCreationInputTokens/cacheReadInputTokens undefined when absent', () => {
    const params = buildParams();
    const response = fakeTextMessage('hello');

    const envelope = service.build(params, response);

    expect(envelope.usage.inputTokens).toBe(response.usage.input_tokens);
    expect(envelope.usage.outputTokens).toBe(response.usage.output_tokens);
    expect(envelope.usage.cacheCreationInputTokens).toBeUndefined();
    expect(envelope.usage.cacheReadInputTokens).toBeUndefined();
  });

  it('maps cache_creation_input_tokens/cache_read_input_tokens to their camelCase fields', () => {
    const params = buildParams();
    const response = fakeTextMessage('hello', {
      usage: {
        ...fakeTextMessage('hello').usage,
        cache_creation_input_tokens: 12,
        cache_read_input_tokens: 34,
      },
    });

    const envelope = service.build(params, response);

    expect(envelope.usage.cacheCreationInputTokens).toBe(12);
    expect(envelope.usage.cacheReadInputTokens).toBe(34);
  });

  it('reflects response.stop_reason unchanged, including null', () => {
    const params = buildParams();
    const response = fakeTextMessage('hello', { stop_reason: null });

    const envelope = service.build(params, response);

    expect(envelope.stopReason).toBeNull();
  });

  it('passes request/response through unchanged, never reshaped or mutated', () => {
    const params = buildParams();
    const response = fakeTextMessage('hello');

    const envelope = service.build(params, response);

    expect(envelope.request).toBe(params);
    expect(envelope.response).toBe(response);
  });
});
