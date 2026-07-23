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
function mcpBlocks(id = 'mcp_1'): unknown[] {
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
      content: [{ type: 'text', text: 'It is a demo app.' }],
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
          result: [
            { path: 'README.md', type: 'blob', sha: 's1' },
            { path: 'src/main.ts', type: 'blob', sha: 's2' },
          ],
          isError: false,
        },
      ]);
      expect(envelope.finalAnswer).toBe('Investigated the repo.');
    });

    it('filters list_files by the given path prefix', async () => {
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

      expect(envelope.toolActivity[0].result).toEqual([
        { path: 'src/main.ts', type: 'blob', sha: 's1' },
      ]);
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
        result: [{ path: 'src/Main.ts', type: 'blob', sha: 's1' }],
        isError: false,
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
        result: { content: '# Hello', encoding: 'utf-8' },
        isError: false,
      });
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
