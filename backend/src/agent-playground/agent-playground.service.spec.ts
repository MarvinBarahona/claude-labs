import { Test } from '@nestjs/testing';
import { AppConfigService } from '../shared/config/config.service';
import { AnthropicClient } from '../shared/anthropic-client/anthropic-client';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import { ModelTier } from '../shared/model-config/model-config.types';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { StreamResponseBuilderService } from '../shared/stream-response-builder/stream-response-builder.service';
import { GithubClient } from '../shared/github-provider/github-client';
import { DeepwikiConnectorService } from '../shared/deepwiki-connector/deepwiki-connector.service';
import { ExternalApiError } from '../shared/api-error-handling';
import { FakeGithubClient } from '../testing/github/fake-github-client';
import { FakeAnthropicClient } from '../testing/anthropic/fake-anthropic-client';
import {
  fakeTextMessage,
  fakeToolUseMessage,
  fakeToolUseStreamEvents,
  fakeTextStreamEvents,
} from '../testing/anthropic/message-builders';
import {
  AgentPlaygroundService,
  AgentPlaygroundStreamFrame,
} from './agent-playground.service';
import { RunDto } from './dto/run.dto';

const MODEL_MAP: Record<ModelTier, string> = {
  default: 'claude-sonnet-5',
  classification: 'claude-haiku-4-5',
  'hardest-call': 'claude-opus-4-8',
};

function buildDto(overrides: Partial<RunDto> = {}): RunDto {
  return { stream: false, ...overrides };
}

/** A fabricated `mcp_tool_use`/`mcp_tool_result` pair, mirroring what the real deepwiki MCP server's resolved response looks like. */
function mcpBlocks(id = 'mcp_1', text = 'It is a demo app.'): unknown[] {
  return [
    {
      type: 'mcp_tool_use',
      id,
      name: 'ask_question',
      server_name: 'deepwiki',
      input: { question: 'What does this repo do?' },
    },
    {
      type: 'mcp_tool_result',
      tool_use_id: id,
      is_error: false,
      content: [{ type: 'text', text }],
    },
  ];
}

describe('AgentPlaygroundService', () => {
  let fakeAnthropic: FakeAnthropicClient;
  let fakeGithub: FakeGithubClient;
  let service: AgentPlaygroundService;

  beforeEach(async () => {
    fakeAnthropic = new FakeAnthropicClient();
    fakeGithub = new FakeGithubClient();
    const modelConfigStub: Partial<ModelConfigService> = {
      getModel: jest.fn((tier: ModelTier) => MODEL_MAP[tier]),
      getDefaultMaxTokens: jest.fn(() => 4096),
    };
    const appConfigStub: Partial<AppConfigService> = {
      githubTargetRepo: 'angular/angular',
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentPlaygroundService,
        EnvelopeBuilderService,
        StreamResponseBuilderService,
        DeepwikiConnectorService,
        { provide: AnthropicClient, useValue: fakeAnthropic },
        { provide: ModelConfigService, useValue: modelConfigStub },
        { provide: GithubClient, useValue: fakeGithub },
        { provide: AppConfigService, useValue: appConfigStub },
      ],
    }).compile();

    service = moduleRef.get(AgentPlaygroundService);
  });

  describe('run (non-streaming)', () => {
    it('executes list_files against the fake GithubClient', async () => {
      fakeGithub.setFileTree([
        { path: 'README.md', type: 'blob', sha: 's1' },
        { path: 'src/main.ts', type: 'blob', sha: 's2' },
      ]);
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([{ id: 'call_1', name: 'list_files', input: {} }]),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('Investigated the repo.'));

      const envelope = await service.run(buildDto());

      expect(envelope.calls).toHaveLength(1);
      expect(envelope.toolActivity).toEqual([
        {
          tool: 'list_files',
          input: {},
          result: {
            entries: [
              { path: 'README.md', type: 'blob' },
              { path: 'src/main.ts', type: 'blob' },
            ],
            totalMatches: 2,
            truncated: false,
          },
          isError: false,
        },
      ]);
      expect(envelope.finalAnswer).toBe('Investigated the repo.');
    });

    it('caps list_files at MAX_TREE_ENTRIES and reports truncated: true', async () => {
      const bigTree = Array.from({ length: 600 }, (_, i) => ({
        path: `file-${i}.ts`,
        type: 'blob' as const,
        sha: `s${i}`,
      }));
      fakeGithub.setFileTree(bigTree);
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([{ id: 'call_1', name: 'list_files', input: {} }]),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('Done.'));

      const envelope = await service.run(buildDto());

      const result = envelope.toolActivity[0].result as {
        entries: unknown[];
        totalMatches: number;
        truncated: boolean;
      };
      expect(result.entries).toHaveLength(500);
      expect(result.totalMatches).toBe(600);
      expect(result.truncated).toBe(true);
    });

    it('filters list_files by the given path prefix, counting the filtered set', async () => {
      fakeGithub.setFileTree([
        { path: 'src/main.ts', type: 'blob', sha: 's1' },
        { path: 'docs/readme.md', type: 'blob', sha: 's2' },
      ]);
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          { id: 'call_1', name: 'list_files', input: { path: 'src' } },
        ]),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('Done.'));

      const envelope = await service.run(buildDto());

      expect(envelope.toolActivity[0].result).toEqual({
        entries: [{ path: 'src/main.ts', type: 'blob' }],
        totalMatches: 1,
        truncated: false,
      });
    });

    it('executes search as a case-insensitive substring match over paths', async () => {
      fakeGithub.setFileTree([
        { path: 'src/Main.ts', type: 'blob', sha: 's1' },
        { path: 'docs/readme.md', type: 'blob', sha: 's2' },
      ]);
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          { id: 'call_1', name: 'search', input: { query: 'main' } },
        ]),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('Done.'));

      const envelope = await service.run(buildDto());

      expect(envelope.toolActivity[0]).toEqual({
        tool: 'search',
        input: { query: 'main' },
        result: {
          entries: [{ path: 'src/Main.ts', type: 'blob' }],
          totalMatches: 1,
          truncated: false,
        },
        isError: false,
      });
    });

    it('caps search at MAX_TREE_ENTRIES and reports truncated: true', async () => {
      const bigTree = Array.from({ length: 600 }, (_, i) => ({
        path: `match-${i}.ts`,
        type: 'blob' as const,
        sha: `s${i}`,
      }));
      fakeGithub.setFileTree(bigTree);
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          { id: 'call_1', name: 'search', input: { query: 'match' } },
        ]),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('Done.'));

      const envelope = await service.run(buildDto());

      const result = envelope.toolActivity[0].result as {
        entries: unknown[];
        totalMatches: number;
        truncated: boolean;
      };
      expect(result.entries).toHaveLength(500);
      expect(result.totalMatches).toBe(600);
      expect(result.truncated).toBe(true);
    });

    it('search counts only the substring-matched set, not the whole tree', async () => {
      fakeGithub.setFileTree([
        { path: 'src/Main.ts', type: 'blob', sha: 's1' },
        { path: 'docs/readme.md', type: 'blob', sha: 's2' },
        { path: 'other/main.spec.ts', type: 'blob', sha: 's3' },
      ]);
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          { id: 'call_1', name: 'search', input: { query: 'main' } },
        ]),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('Done.'));

      const envelope = await service.run(buildDto());

      expect(envelope.toolActivity[0].result).toEqual({
        entries: [
          { path: 'src/Main.ts', type: 'blob' },
          { path: 'other/main.spec.ts', type: 'blob' },
        ],
        totalMatches: 2,
        truncated: false,
      });
    });

    it('executes read_file against the fake GithubClient', async () => {
      fakeGithub.setFileContent({ content: '# Hello', encoding: 'utf-8' });
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          { id: 'call_1', name: 'read_file', input: { path: 'README.md' } },
        ]),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('It has a README.'));

      const envelope = await service.run(buildDto());

      expect(envelope.toolActivity[0]).toEqual({
        tool: 'read_file',
        input: { path: 'README.md' },
        result: { content: '# Hello', encoding: 'utf-8', truncated: false },
        isError: false,
      });
    });

    it('caps read_file content at MAX_FILE_CONTENT_CHARS and reports truncated: true', async () => {
      const bigContent = 'x'.repeat(25_000);
      fakeGithub.setFileContent({ content: bigContent, encoding: 'utf-8' });
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          { id: 'call_1', name: 'read_file', input: { path: 'big.txt' } },
        ]),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('Done.'));

      const envelope = await service.run(buildDto());

      const result = envelope.toolActivity[0].result as {
        content: string;
        encoding: string;
        truncated: boolean;
      };
      expect(result.content).toHaveLength(20_000);
      expect(result.content).toBe(bigContent.slice(0, 20_000));
      expect(result.truncated).toBe(true);
    });

    it('read_file on a not-found path returns is_error: true, not a transport failure', async () => {
      jest
        .spyOn(fakeGithub, 'getFileContent')
        .mockRejectedValue(new ExternalApiError('github', 'Not Found'));
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          { id: 'call_1', name: 'read_file', input: { path: 'missing.ts' } },
        ]),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('Could not find that file.'));

      const envelope = await service.run(buildDto());

      expect(envelope.toolActivity[0].isError).toBe(true);
      expect(envelope.toolActivity[0].result).toBe('Not Found');

      const secondCallMessages = fakeAnthropic.recordedCalls[1].messages;
      const toolResultMessage = secondCallMessages[
        secondCallMessages.length - 1
      ] as { content: Array<{ is_error?: boolean }> };
      expect(toolResultMessage.content[0].is_error).toBe(true);
    });

    it('ask_deepwiki (mcp_toolset) is offered alongside the 3 custom tools on every call', async () => {
      fakeAnthropic.queueMessage(fakeTextMessage('Done.'));

      await service.run(buildDto());

      const [{ tools }] = fakeAnthropic.recordedCalls;
      const toolNames = (tools ?? []).map((tool) =>
        'name' in tool ? tool.name : undefined,
      );
      expect(toolNames).toEqual(
        expect.arrayContaining(['list_files', 'read_file', 'search']),
      );
      expect(tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'mcp_toolset' }),
        ]),
      );
    });

    it('restricts the deepwiki mcp_toolset to read_wiki_structure and ask_question, excluding read_wiki_contents', async () => {
      fakeAnthropic.queueMessage(fakeTextMessage('Done.'));

      await service.run(buildDto());

      const [{ tools }] = fakeAnthropic.recordedCalls;
      const mcpToolset = (tools ?? []).find(
        (tool) => 'type' in tool && tool.type === 'mcp_toolset',
      );
      expect(mcpToolset).toEqual({
        type: 'mcp_toolset',
        mcp_server_name: 'deepwiki',
        default_config: { enabled: false },
        configs: {
          read_wiki_structure: { enabled: true },
          ask_question: { enabled: true },
        },
      });
    });

    it('an mcp_tool_use/mcp_tool_result pair resolved inline never advances the loop by itself', async () => {
      fakeAnthropic.queueMessage(
        fakeTextMessage('It is a demo app.', {
          content: [
            ...mcpBlocks(),
            { type: 'text', text: 'It is a demo app.', citations: null },
          ] as unknown as ReturnType<typeof fakeTextMessage>['content'],
        }),
      );

      const envelope = await service.run(buildDto());

      expect(fakeAnthropic.recordedCalls).toHaveLength(1);
      expect(envelope.calls).toHaveLength(0);
      expect(envelope.toolActivity).toEqual([
        {
          tool: 'ask_deepwiki',
          input: { question: 'What does this repo do?' },
          result: [{ type: 'text', text: 'It is a demo app.' }],
          isError: false,
        },
      ]);
    });

    it('caps a large ask_deepwiki (mcp_tool_result) answer before it is resent as history on a later call', async () => {
      const bigAnswer = 'x'.repeat(25_000);
      fakeGithub.setFileTree([{ path: 'README.md', type: 'blob', sha: 's1' }]);
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([{ id: 'call_1', name: 'list_files', input: {} }], {
          content: [
            ...mcpBlocks('mcp_1', bigAnswer),
            {
              type: 'tool_use',
              id: 'call_1',
              name: 'list_files',
              input: {},
              caller: { type: 'direct' },
            },
          ] as unknown as ReturnType<typeof fakeToolUseMessage>['content'],
        }),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('Done.'));

      const envelope = await service.run(buildDto());

      const askDeepwikiEntry = envelope.toolActivity.find(
        (entry) => entry.tool === 'ask_deepwiki',
      );
      const immediateResult = askDeepwikiEntry?.result as Array<{
        text: string;
      }>;
      expect(immediateResult[0].text.length).toBeLessThan(bigAnswer.length);
      expect(immediateResult[0].text).toContain('truncated');
      expect(immediateResult[0].text.startsWith('x'.repeat(20_000))).toBe(true);

      const secondCallMessages = fakeAnthropic.recordedCalls[1].messages;
      const assistantMessage = secondCallMessages.find(
        (message) => message.role === 'assistant',
      ) as {
        content: Array<{ type: string; content?: Array<{ text: string }> }>;
      };
      const mcpResultBlock = assistantMessage.content.find(
        (block) => block.type === 'mcp_tool_result',
      );
      const resentText = mcpResultBlock?.content?.[0].text ?? '';
      expect(resentText.length).toBeLessThan(bigAnswer.length);
      expect(resentText).toContain('truncated');
    });

    it('flattens toolActivity across both custom and MCP tool calls, in order', async () => {
      fakeGithub.setFileTree([{ path: 'README.md', type: 'blob', sha: 's1' }]);
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([{ id: 'call_1', name: 'list_files', input: {} }]),
      );
      fakeAnthropic.queueMessage(
        fakeTextMessage('Combining both sources.', {
          content: [
            ...mcpBlocks('mcp_2'),
            { type: 'text', text: 'Combining both sources.', citations: null },
          ] as unknown as ReturnType<typeof fakeTextMessage>['content'],
        }),
      );

      const envelope = await service.run(buildDto());

      expect(envelope.toolActivity.map((entry) => entry.tool)).toEqual([
        'list_files',
        'ask_deepwiki',
      ]);
    });

    it('calls holds every earlier pair, in chronological order', async () => {
      fakeGithub.setFileTree([{ path: 'README.md', type: 'blob', sha: 's1' }]);
      fakeGithub.setFileContent({ content: 'hi', encoding: 'utf-8' });
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([{ id: 'call_1', name: 'list_files', input: {} }]),
      );
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          { id: 'call_2', name: 'read_file', input: { path: 'README.md' } },
        ]),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('Done investigating.'));

      const envelope = await service.run(buildDto());

      expect(fakeAnthropic.recordedCalls).toHaveLength(3);
      expect(envelope.calls).toHaveLength(2);
      expect(envelope.calls[0].request).toBe(fakeAnthropic.recordedCalls[0]);
      expect(envelope.calls[1].request).toBe(fakeAnthropic.recordedCalls[1]);
    });

    it('force-stops after 10 backend-executed tool calls and reports hitIterationCap', async () => {
      fakeGithub.setFileTree([{ path: 'README.md', type: 'blob', sha: 's1' }]);
      // 10 executed tool-requesting responses plus 1 more for the cap check to observe and stop on.
      for (let i = 0; i < 11; i++) {
        fakeAnthropic.queueMessage(
          fakeToolUseMessage([
            { id: `call_${i}`, name: 'list_files', input: {} },
          ]),
        );
      }

      const envelope = await service.run(buildDto());

      expect(envelope.hitIterationCap).toBe(true);
      expect(fakeAnthropic.recordedCalls).toHaveLength(11);
      expect(envelope.toolActivity).toHaveLength(10);
      expect(envelope.calls).toHaveLength(10);
    });

    it('counts mcp_tool_use calls toward ITERATION_CAP too, force-stopping sooner on a run mixing tool kinds', async () => {
      fakeGithub.setFileTree([{ path: 'README.md', type: 'blob', sha: 's1' }]);
      // 1 custom + 1 mcp per response = 2 toward the cap; hits ITERATION_CAP=10 in 5 round-trips, plus 1 more to observe and stop on.
      for (let i = 0; i < 6; i++) {
        fakeAnthropic.queueMessage(
          fakeToolUseMessage(
            [{ id: `call_${i}`, name: 'list_files', input: {} }],
            {
              content: [
                ...mcpBlocks(`mcp_${i}`),
                {
                  type: 'tool_use',
                  id: `call_${i}`,
                  name: 'list_files',
                  input: {},
                  caller: { type: 'direct' },
                },
              ] as unknown as ReturnType<typeof fakeToolUseMessage>['content'],
            },
          ),
        );
      }

      const envelope = await service.run(buildDto());

      expect(envelope.hitIterationCap).toBe(true);
      expect(fakeAnthropic.recordedCalls).toHaveLength(6);
      expect(envelope.calls).toHaveLength(5);
      expect(
        envelope.toolActivity.filter((entry) => entry.tool === 'list_files'),
      ).toHaveLength(5);
      expect(
        envelope.toolActivity.filter((entry) => entry.tool === 'ask_deepwiki'),
      ).toHaveLength(6);
    });
  });

  describe('streamRun (streaming)', () => {
    it('forwards raw events with tool-call frames and one terminal turn_complete', async () => {
      fakeGithub.setFileTree([{ path: 'README.md', type: 'blob', sha: 's1' }]);
      fakeAnthropic.queueStream(
        fakeToolUseStreamEvents([
          { id: 'call_1', name: 'list_files', input: {} },
        ]),
      );
      fakeAnthropic.queueStream(fakeTextStreamEvents('Done.'));

      const frames: AgentPlaygroundStreamFrame[] = [];
      for await (const frame of service.streamRun(buildDto({ stream: true }))) {
        frames.push(frame);
      }

      const kinds = frames.map((frame) => frame.kind);
      expect(kinds.filter((kind) => kind === 'turn-complete')).toHaveLength(1);
      expect(kinds[kinds.length - 1]).toBe('turn-complete');
      expect(kinds).toContain('tool-call-start');
      expect(kinds).toContain('tool-call-result');

      const last = frames[frames.length - 1];
      if (last.kind !== 'turn-complete') {
        throw new Error('expected a terminal turn-complete frame');
      }
      expect(last.envelope.finalAnswer).toBe('Done.');
      expect(last.envelope.toolActivity).toHaveLength(1);
    });

    it('yields a terminal error frame (no turn_complete) when GithubClient throws mid-loop', async () => {
      jest
        .spyOn(fakeGithub, 'getFileTree')
        .mockRejectedValue(new ExternalApiError('github', 'boom'));
      fakeAnthropic.queueStream(
        fakeToolUseStreamEvents([
          { id: 'call_1', name: 'list_files', input: {} },
        ]),
      );

      const frames: AgentPlaygroundStreamFrame[] = [];
      for await (const frame of service.streamRun(buildDto({ stream: true }))) {
        frames.push(frame);
      }

      expect(frames.some((frame) => frame.kind === 'turn-complete')).toBe(
        false,
      );
      expect(frames[frames.length - 1].kind).toBe('error');
    });
  });
});
