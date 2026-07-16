import { Test } from '@nestjs/testing';
import { AnthropicClient } from '../shared/anthropic-client/anthropic-client';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import { ModelTier } from '../shared/model-config/model-config.types';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { ExternalApiError } from '../shared/api-error-handling';
import { FakeAnthropicClient } from '../testing/anthropic/fake-anthropic-client';
import {
  fakeTextMessage,
  fakeToolUseMessage,
} from '../testing/anthropic/message-builders';
import { StructuredOutputConsoleService } from './structured-output-console.service';
import { StructuredDemoDto } from './dto/structured-demo.dto';

const MODEL_MAP: Record<ModelTier, string> = {
  default: 'claude-sonnet-5',
  classification: 'claude-haiku-4-5',
  'hardest-call': 'claude-opus-4-8',
};

function buildDto(
  overrides: Partial<StructuredDemoDto> = {},
): StructuredDemoDto {
  return {
    modelChoice: 'default',
    input: 'Summarize this feedback.',
    ...overrides,
  };
}

const FIXED_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
    actionItems: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'sentiment', 'actionItems'],
  additionalProperties: false,
};

describe('StructuredOutputConsoleService', () => {
  let fakeClient: FakeAnthropicClient;
  let service: StructuredOutputConsoleService;

  beforeEach(async () => {
    fakeClient = new FakeAnthropicClient();
    const modelConfigStub: Partial<ModelConfigService> = {
      getModel: jest.fn((tier: ModelTier) => MODEL_MAP[tier]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        StructuredOutputConsoleService,
        EnvelopeBuilderService,
        { provide: AnthropicClient, useValue: fakeClient },
        { provide: ModelConfigService, useValue: modelConfigStub },
      ],
    }).compile();

    service = moduleRef.get(StructuredOutputConsoleService);
  });

  describe('run', () => {
    it('sends output_config with the fixed schema on every call', async () => {
      fakeClient.queueMessage(
        fakeTextMessage(
          JSON.stringify({
            summary: 'ok',
            sentiment: 'neutral',
            actionItems: [],
          }),
        ),
      );

      await service.run(buildDto());

      expect(fakeClient.recordedCalls[0].output_config).toEqual({
        format: { type: 'json_schema', schema: FIXED_SCHEMA },
      });
    });

    it.each([
      ['default', 'claude-sonnet-5'],
      ['classification', 'claude-haiku-4-5'],
      ['hardest-call', 'claude-opus-4-8'],
    ] as [ModelTier, string][])(
      'resolves modelChoice %s to %s',
      async (modelChoice, expectedModel) => {
        fakeClient.queueMessage(
          fakeTextMessage(
            JSON.stringify({
              summary: 'ok',
              sentiment: 'neutral',
              actionItems: [],
            }),
          ),
        );

        await service.run(buildDto({ modelChoice }));

        expect(fakeClient.recordedCalls[0].model).toBe(expectedModel);
      },
    );

    it('parses a normal text response into `parsed` via EnvelopeBuilderService', async () => {
      const fakeResponse = fakeTextMessage(
        JSON.stringify({
          summary: 'Customer is happy overall.',
          sentiment: 'positive',
          actionItems: ['Follow up next week'],
        }),
        {
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
        },
      );
      fakeClient.queueMessage(fakeResponse);

      const envelope = await service.run(buildDto());

      expect(envelope.parsed).toEqual({
        summary: 'Customer is happy overall.',
        sentiment: 'positive',
        actionItems: ['Follow up next week'],
      });
      expect(envelope.response).toBe(fakeResponse);
      expect(envelope.request).toBe(fakeClient.recordedCalls[0]);
      expect(envelope.stopReason).toBe('end_turn');
    });

    it('throws ExternalApiError when the response has no text block', async () => {
      fakeClient.queueMessage(
        fakeToolUseMessage([{ id: 'call_1', name: 'noop', input: {} }]),
      );

      await expect(service.run(buildDto())).rejects.toThrow(ExternalApiError);
    });
  });
});
