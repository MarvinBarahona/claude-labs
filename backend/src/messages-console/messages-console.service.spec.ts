import { Test } from '@nestjs/testing';
import { AnthropicClient } from '../shared/anthropic-client/anthropic-client';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { FakeAnthropicClient } from '../testing/anthropic/fake-anthropic-client';
import {
  fakeTextMessage,
  fakeTextStreamEvents,
} from '../testing/anthropic/message-builders';
import {
  MessagesConsoleService,
  MessagesConsoleStreamFrame,
} from './messages-console.service';
import { ModelChoice, SendMessageDto } from './dto/send-message.dto';

type ModelTier = 'default' | 'classification' | 'hardest-call';

const MODEL_MAP: Record<ModelTier, string> = {
  default: 'claude-sonnet-5',
  classification: 'claude-haiku-4-5',
  'hardest-call': 'claude-opus-4-8',
};

function buildDto(overrides: Partial<SendMessageDto> = {}): SendMessageDto {
  return {
    modelChoice: 'default',
    messages: [{ role: 'user', text: 'hi' }],
    stream: false,
    ...overrides,
  };
}

describe('MessagesConsoleService', () => {
  let fakeClient: FakeAnthropicClient;
  let service: MessagesConsoleService;

  beforeEach(async () => {
    fakeClient = new FakeAnthropicClient();
    const modelConfigStub: Partial<ModelConfigService> = {
      getModel: jest.fn((tier: ModelTier) => MODEL_MAP[tier]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MessagesConsoleService,
        EnvelopeBuilderService,
        { provide: AnthropicClient, useValue: fakeClient },
        { provide: ModelConfigService, useValue: modelConfigStub },
      ],
    }).compile();

    service = moduleRef.get(MessagesConsoleService);
  });

  describe('createTurn (non-streaming /turn)', () => {
    it('omits `system` on the request when systemPrompt is unset', async () => {
      fakeClient.queueMessage(fakeTextMessage('hello'));

      await service.createTurn(buildDto());

      expect(fakeClient.recordedCalls[0]).not.toHaveProperty('system');
    });

    it('includes `system` on the request when systemPrompt is set', async () => {
      fakeClient.queueMessage(fakeTextMessage('hello'));

      await service.createTurn(buildDto({ systemPrompt: 'Be terse.' }));

      expect(fakeClient.recordedCalls[0].system).toBe('Be terse.');
    });

    it.each([
      ['default', 'claude-sonnet-5'],
      ['classification', 'claude-haiku-4-5'],
      ['hardest-call', 'claude-opus-4-8'],
    ] as [ModelChoice, string][])(
      'resolves modelChoice %s to %s',
      async (modelChoice, expectedModel) => {
        fakeClient.queueMessage(fakeTextMessage('hello'));

        await service.createTurn(buildDto({ modelChoice }));

        expect(fakeClient.recordedCalls[0].model).toBe(expectedModel);
      },
    );

    it('shapes the fake response into the envelope via EnvelopeBuilderService, with no `calls` array', async () => {
      const fakeResponse = fakeTextMessage('hello there', {
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 12,
          output_tokens: 34,
          cache_creation: null,
          cache_creation_input_tokens: 5,
          cache_read_input_tokens: 7,
          inference_geo: null,
          output_tokens_details: null,
          server_tool_use: null,
          service_tier: 'standard',
        },
      });
      fakeClient.queueMessage(fakeResponse);

      const envelope = await service.createTurn(buildDto());

      expect(envelope).not.toHaveProperty('calls');
      expect(envelope.response).toBe(fakeResponse);
      expect(envelope.request).toBe(fakeClient.recordedCalls[0]);
      expect(envelope.usage).toEqual({
        inputTokens: 12,
        outputTokens: 34,
        cacheCreationInputTokens: 5,
        cacheReadInputTokens: 7,
      });
      expect(envelope.stopReason).toBe('end_turn');
    });
  });

  describe('streamTurn (streaming /turn)', () => {
    it('forwards the fake client stream events verbatim, followed by exactly one terminal turn_complete frame', async () => {
      const streamEvents = fakeTextStreamEvents('streamed reply');
      fakeClient.queueStream(streamEvents);

      const frames: MessagesConsoleStreamFrame[] = [];
      for await (const frame of service.streamTurn(
        buildDto({ stream: true }),
      )) {
        frames.push(frame);
      }

      expect(frames).toHaveLength(streamEvents.length + 1);
      streamEvents.forEach((event, index) => {
        expect(frames[index]).toEqual({ kind: 'stream-event', event });
      });

      const last = frames[frames.length - 1];
      expect(last.kind).toBe('turn-complete');
      expect(
        frames.filter((frame) => frame.kind === 'turn-complete'),
      ).toHaveLength(1);

      // Content must be reassembled from content_block_delta events, not message_start.
      if (last.kind !== 'turn-complete') {
        throw new Error('expected a turn-complete frame');
      }
      expect(last.envelope.response.content).toEqual([
        { type: 'text', text: 'streamed reply', citations: null },
      ]);
    });

    it('yields a terminal error frame instead of turn_complete when the client throws mid-stream', async () => {
      // Nothing queued — FakeAnthropicClient.streamMessage() throws its own
      // "no queued stream left" error.
      const frames: MessagesConsoleStreamFrame[] = [];
      for await (const frame of service.streamTurn(
        buildDto({ stream: true }),
      )) {
        frames.push(frame);
      }

      expect(frames).toHaveLength(1);
      expect(frames[0].kind).toBe('error');
      expect(frames.some((frame) => frame.kind === 'turn-complete')).toBe(
        false,
      );
    });
  });
});
