import { Test } from '@nestjs/testing';
import { AppConfigService } from '../shared/config/config.service';
import { AnthropicClient } from '../shared/anthropic-client/anthropic-client';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { DeepwikiConnectorService } from '../shared/deepwiki-connector/deepwiki-connector.service';
import { ExternalApiError } from '../shared/api-error-handling';
import { FakeAnthropicClient } from '../testing/anthropic/fake-anthropic-client';
import {
  fakeTextMessage,
  fakeToolUseMessage,
} from '../testing/anthropic/message-builders';
import { WebRepoResearchReporterService } from './web-repo-research-reporter.service';
import { ResearchQuestionDto } from './dto/research-question.dto';

function buildDto(
  overrides: Partial<ResearchQuestionDto> = {},
): ResearchQuestionDto {
  return {
    question: 'What testing approach does this repo use?',
    ...overrides,
  };
}

const FIXED_BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { claim: { type: 'string' }, source: { type: 'string' } },
        required: ['claim', 'source'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'findings'],
  additionalProperties: false,
};

describe('WebRepoResearchReporterService', () => {
  let fakeClient: FakeAnthropicClient;
  let service: WebRepoResearchReporterService;

  beforeEach(async () => {
    fakeClient = new FakeAnthropicClient();
    const modelConfigStub: Partial<ModelConfigService> = {
      getModel: jest.fn(() => 'claude-sonnet-5'),
      getDefaultMaxTokens: jest.fn(() => 4096),
    };
    const appConfigStub: Partial<AppConfigService> = {
      githubTargetRepo: 'angular/angular',
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WebRepoResearchReporterService,
        EnvelopeBuilderService,
        DeepwikiConnectorService,
        { provide: AnthropicClient, useValue: fakeClient },
        { provide: ModelConfigService, useValue: modelConfigStub },
        { provide: AppConfigService, useValue: appConfigStub },
      ],
    }).compile();

    service = moduleRef.get(WebRepoResearchReporterService);
  });

  function briefResponse(): ReturnType<typeof fakeTextMessage> {
    return fakeTextMessage(
      JSON.stringify({
        summary: 'ok',
        findings: [{ claim: 'a claim', source: 'https://example.com' }],
      }),
    );
  }

  describe('run', () => {
    it('includes the web search tool with max_uses from maxSearches, and the DeepWiki fragment', async () => {
      fakeClient.queueMessage(briefResponse());

      await service.run(buildDto({ maxSearches: 3 }));

      const request = fakeClient.recordedCalls[0] as unknown as {
        tools: { type: string; name?: string; max_uses?: number }[];
        mcp_servers: unknown;
      };
      expect(request.tools).toEqual(
        expect.arrayContaining([
          { type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
          expect.objectContaining({ type: 'mcp_toolset' }),
        ]),
      );
      expect(request.mcp_servers).toEqual([
        { type: 'url', url: 'https://mcp.deepwiki.com/mcp', name: 'deepwiki' },
      ]);
    });

    it('defaults max_uses to 5 when maxSearches is omitted', async () => {
      fakeClient.queueMessage(briefResponse());

      await service.run(buildDto());

      const request = fakeClient.recordedCalls[0] as unknown as {
        tools: { type: string; max_uses?: number }[];
      };
      const webSearchTool = request.tools.find(
        (tool) => tool.type === 'web_search_20260209',
      );
      expect(webSearchTool?.max_uses).toBe(5);
    });

    it('names the target repo in the system prompt and instructs Claude to decline unrelated questions', async () => {
      fakeClient.queueMessage(briefResponse());

      await service.run(buildDto());

      const request = fakeClient.recordedCalls[0] as unknown as {
        system: string;
      };
      expect(request.system).toContain('angular/angular');
      expect(request.system).toContain('politely decline');
    });

    it('sends output_config with the fixed brief schema and the mcp-client beta', async () => {
      fakeClient.queueMessage(briefResponse());

      await service.run(buildDto());

      const request = fakeClient.recordedCalls[0] as unknown as {
        output_config: unknown;
      };
      expect(request.output_config).toEqual({
        format: { type: 'json_schema', schema: FIXED_BRIEF_SCHEMA },
      });
    });

    it('counts searchesPerformed/mcpCallsPerformed from server_tool_use/mcp_tool_use blocks', async () => {
      const response = fakeTextMessage(
        JSON.stringify({ summary: 'ok', findings: [] }),
        {
          content: [
            {
              type: 'server_tool_use',
              id: 's1',
              name: 'web_search',
              input: {},
            },
            { type: 'web_search_tool_result', tool_use_id: 's1', content: [] },
            {
              type: 'server_tool_use',
              id: 's2',
              name: 'web_search',
              input: {},
            },
            { type: 'web_search_tool_result', tool_use_id: 's2', content: [] },
            { type: 'mcp_tool_use', id: 'm1', name: 'ask_question', input: {} },
            { type: 'mcp_tool_result', tool_use_id: 'm1', content: [] },
            {
              type: 'text',
              text: JSON.stringify({ summary: 'ok', findings: [] }),
              citations: null,
            },
          ] as unknown as ReturnType<typeof fakeTextMessage>['content'],
        },
      );
      fakeClient.queueMessage(response);

      const envelope = await service.run(buildDto());

      expect(envelope.searchesPerformed).toBe(2);
      expect(envelope.mcpCallsPerformed).toBe(1);
    });

    it('parses `brief` from the final text block', async () => {
      fakeClient.queueMessage(briefResponse());

      const envelope = await service.run(buildDto());

      expect(envelope.brief).toEqual({
        summary: 'ok',
        findings: [{ claim: 'a claim', source: 'https://example.com' }],
      });
    });

    it('throws ExternalApiError when the response has no text block', async () => {
      fakeClient.queueMessage(
        fakeToolUseMessage([{ id: 'call_1', name: 'noop', input: {} }]),
      );

      await expect(service.run(buildDto())).rejects.toThrow(ExternalApiError);
    });
  });
});
