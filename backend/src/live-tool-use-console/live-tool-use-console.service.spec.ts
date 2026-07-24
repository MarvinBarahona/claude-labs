import { Test } from '@nestjs/testing';
import { AnthropicClient } from '../shared/anthropic-client/anthropic-client';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import { ModelTier } from '../shared/model-config/model-config.types';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { StreamResponseBuilderService } from '../shared/stream-response-builder/stream-response-builder.service';
import { GithubClient } from '../shared/github-provider/github-client';
import { ExternalApiError } from '../shared/api-error-handling';
import { FakeGithubClient } from '../testing/github/fake-github-client';
import { FakeAnthropicClient } from '../testing/anthropic/fake-anthropic-client';
import {
  fakeTextMessage,
  fakeTextStreamEvents,
  fakeToolUseMessage,
  fakeToolUseStreamEvents,
} from '../testing/anthropic/message-builders';
import { FakeOpenMeteoClient } from '../testing/open-meteo/fake-open-meteo-client';
import { OpenMeteoClient } from './open-meteo-client';
import {
  LiveToolUseConsoleService,
  LiveToolUseConsoleStreamFrame,
} from './live-tool-use-console.service';
import { TurnDto } from './dto/turn.dto';

const MODEL_MAP: Record<ModelTier, string> = {
  default: 'claude-sonnet-5',
  classification: 'claude-haiku-4-5',
  'hardest-call': 'claude-opus-4-8',
};

function buildDto(overrides: Partial<TurnDto> = {}): TurnDto {
  return {
    modelChoice: 'default',
    question: 'What is the weather in Tokyo?',
    stream: false,
    ...overrides,
  };
}

describe('LiveToolUseConsoleService', () => {
  let fakeAnthropic: FakeAnthropicClient;
  let fakeGithub: FakeGithubClient;
  let fakeOpenMeteo: FakeOpenMeteoClient;
  let service: LiveToolUseConsoleService;

  beforeEach(async () => {
    fakeAnthropic = new FakeAnthropicClient();
    fakeGithub = new FakeGithubClient();
    fakeOpenMeteo = new FakeOpenMeteoClient();
    const modelConfigStub: Partial<ModelConfigService> = {
      getModel: jest.fn((tier: ModelTier) => MODEL_MAP[tier]),
      getDefaultMaxTokens: jest.fn(() => 4096),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LiveToolUseConsoleService,
        EnvelopeBuilderService,
        StreamResponseBuilderService,
        { provide: AnthropicClient, useValue: fakeAnthropic },
        { provide: ModelConfigService, useValue: modelConfigStub },
        { provide: GithubClient, useValue: fakeGithub },
        { provide: OpenMeteoClient, useValue: fakeOpenMeteo },
      ],
    }).compile();

    service = moduleRef.get(LiveToolUseConsoleService);
  });

  describe('createTurn (non-streaming /turn)', () => {
    it('answers without any tool call: single-call envelope, no calls field', async () => {
      fakeAnthropic.queueMessage(fakeTextMessage('The sky is blue.'));

      const envelope = await service.createTurn(buildDto());

      expect(fakeAnthropic.recordedCalls).toHaveLength(1);
      expect(envelope).not.toHaveProperty('calls');
      expect(envelope.response.content).toEqual([
        { type: 'text', text: 'The sky is blue.', citations: null },
      ]);
    });

    it('sends a system prompt restricting Claude to the repo and weather tools', async () => {
      fakeAnthropic.queueMessage(fakeTextMessage('The sky is blue.'));

      await service.createTurn(buildDto());

      const [{ system }] = fakeAnthropic.recordedCalls;
      expect(system).toEqual(expect.stringContaining('weather'));
      expect(system).toEqual(expect.stringContaining('GitHub'));
    });

    it('resolves via one get_weather call: second call includes the tool_result, calls holds the first pair', async () => {
      fakeOpenMeteo.setWeather('Tokyo', {
        temperatureC: 18,
        description: 'Partly cloudy',
      });
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          { id: 'call_1', name: 'get_weather', input: { location: 'Tokyo' } },
        ]),
      );
      fakeAnthropic.queueMessage(
        fakeTextMessage('It is 18C and partly cloudy in Tokyo.'),
      );

      const envelope = await service.createTurn(buildDto());

      expect(fakeAnthropic.recordedCalls).toHaveLength(2);
      expect(envelope.calls).toHaveLength(1);
      expect(envelope.calls?.[0].request).toBe(fakeAnthropic.recordedCalls[0]);
      expect(envelope.calls?.[0].response.stop_reason).toBe('tool_use');

      const secondCallMessages = fakeAnthropic.recordedCalls[1].messages;
      const toolResultMessage =
        secondCallMessages[secondCallMessages.length - 1];
      expect(toolResultMessage).toEqual({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call_1',
            content: JSON.stringify({
              temperatureC: 18,
              description: 'Partly cloudy',
            }),
          },
        ],
      });
    });

    it('resolves via one get_repo_stats call using the fake GithubClient', async () => {
      fakeGithub
        .setIssues([
          {
            number: 1,
            title: 'issue',
            state: 'open',
            body: null,
            user: 'u',
            createdAt: '2026-01-01T00:00:00Z',
            url: 'https://github.com/x/y/issues/1',
          },
        ])
        .setCommits([
          {
            sha: 'abc',
            message: 'a commit',
            author: 'u',
            date: '2026-01-01T00:00:00Z',
            url: 'https://github.com/x/y/commit/abc',
          },
        ])
        .setReleases([
          {
            tagName: 'v1.0.0',
            name: 'r',
            body: null,
            publishedAt: '2026-01-01T00:00:00Z',
            url: 'https://github.com/x/y/releases/tag/v1.0.0',
          },
        ]);
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          { id: 'call_1', name: 'get_repo_stats', input: {} },
        ]),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('1 open issue.'));

      const envelope = await service.createTurn(
        buildDto({ question: 'How is the repo doing?' }),
      );

      expect(envelope.calls).toHaveLength(1);
      const secondCallMessages = fakeAnthropic.recordedCalls[1].messages;
      const toolResultMessage = secondCallMessages[
        secondCallMessages.length - 1
      ] as {
        role: string;
        content: Array<{ content: string }>;
      };
      const stats = JSON.parse(toolResultMessage.content[0].content) as {
        openIssueCount: number;
        latestCommit: { sha: string } | null;
        latestRelease: { tagName: string } | null;
      };
      expect(stats).toEqual({
        openIssueCount: 1,
        latestCommit: {
          sha: 'abc',
          message: 'a commit',
          date: '2026-01-01T00:00:00Z',
        },
        latestRelease: {
          tagName: 'v1.0.0',
          publishedAt: '2026-01-01T00:00:00Z',
        },
      });
    });

    it('resolves a question needing both tools in sequence: calls holds every earlier pair in order', async () => {
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          { id: 'call_1', name: 'get_weather', input: { location: 'Tokyo' } },
        ]),
      );
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          { id: 'call_2', name: 'get_repo_stats', input: {} },
        ]),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('Here is everything.'));

      const envelope = await service.createTurn(buildDto());

      expect(fakeAnthropic.recordedCalls).toHaveLength(3);
      expect(envelope.calls).toHaveLength(2);
      expect(envelope.calls?.[0].request).toBe(fakeAnthropic.recordedCalls[0]);
      expect(envelope.calls?.[1].request).toBe(fakeAnthropic.recordedCalls[1]);
      expect(envelope.response.content).toEqual([
        { type: 'text', text: 'Here is everything.', citations: null },
      ]);
    });

    it('a get_weather location the fake client resolves to null yields an is_error tool_result and the loop continues', async () => {
      fakeOpenMeteo.setWeather('Qwxzplace', null);
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          {
            id: 'call_1',
            name: 'get_weather',
            input: { location: 'Qwxzplace' },
          },
        ]),
      );
      fakeAnthropic.queueMessage(
        fakeTextMessage('I could not find that place.'),
      );

      const envelope = await service.createTurn(buildDto());

      expect(fakeAnthropic.recordedCalls).toHaveLength(2);
      const secondCallMessages = fakeAnthropic.recordedCalls[1].messages;
      const toolResultMessage =
        secondCallMessages[secondCallMessages.length - 1];
      expect(toolResultMessage).toEqual({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call_1',
            content: 'No location found matching "Qwxzplace"',
            is_error: true,
          },
        ],
      });
      expect(envelope.response.content).toEqual([
        { type: 'text', text: 'I could not find that place.', citations: null },
      ]);
    });

    it('propagates an ExternalApiError thrown by GithubClient uncaught out of createTurn()', async () => {
      jest
        .spyOn(fakeGithub, 'getIssues')
        .mockRejectedValue(new ExternalApiError('github', 'rate limited'));
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          { id: 'call_1', name: 'get_repo_stats', input: {} },
        ]),
      );

      await expect(service.createTurn(buildDto())).rejects.toBeInstanceOf(
        ExternalApiError,
      );
    });
  });

  describe('streamTurn (streaming /turn)', () => {
    it('forwards raw events across multiple underlying calls, in order, with tool-call frames between them, ending in one turn_complete', async () => {
      fakeOpenMeteo.setWeather('Tokyo', {
        temperatureC: 18,
        description: 'Partly cloudy',
      });
      const firstCallEvents = fakeToolUseStreamEvents([
        { id: 'call_1', name: 'get_weather', input: { location: 'Tokyo' } },
      ]);
      fakeAnthropic.queueStream(firstCallEvents);
      fakeAnthropic.queueStream(fakeTextStreamEvents('It is 18C in Tokyo.'));

      const frames: LiveToolUseConsoleStreamFrame[] = [];
      for await (const frame of service.streamTurn(
        buildDto({ stream: true }),
      )) {
        frames.push(frame);
      }

      const kinds = frames.map((frame) => frame.kind);
      expect(kinds.filter((kind) => kind === 'turn-complete')).toHaveLength(1);
      expect(kinds[kinds.length - 1]).toBe('turn-complete');

      const startIndex = kinds.indexOf('tool-call-start');
      const resultIndex = kinds.indexOf('tool-call-result');
      expect(startIndex).toBeGreaterThan(-1);
      expect(resultIndex).toBeGreaterThan(startIndex);

      const toolStartFrame = frames[startIndex];
      if (toolStartFrame.kind !== 'tool-call-start') {
        throw new Error('expected a tool-call-start frame');
      }
      expect(toolStartFrame.name).toBe('get_weather');

      const toolResultFrame = frames[resultIndex];
      if (toolResultFrame.kind !== 'tool-call-result') {
        throw new Error('expected a tool-call-result frame');
      }
      expect(toolResultFrame.result).toEqual({
        temperatureC: 18,
        description: 'Partly cloudy',
      });
      expect(toolResultFrame.isError).toBe(false);

      const last = frames[frames.length - 1];
      if (last.kind !== 'turn-complete') {
        throw new Error('expected a terminal turn-complete frame');
      }
      expect(last.envelope.calls).toHaveLength(1);
      expect(last.envelope.response.content).toEqual([
        { type: 'text', text: 'It is 18C in Tokyo.', citations: null },
      ]);
    });

    it('yields a terminal error frame (no turn_complete) when GithubClient throws mid-loop', async () => {
      jest
        .spyOn(fakeGithub, 'getReleases')
        .mockRejectedValue(new ExternalApiError('github', 'boom'));
      fakeAnthropic.queueStream(
        fakeToolUseStreamEvents([
          { id: 'call_1', name: 'get_repo_stats', input: {} },
        ]),
      );

      const frames: LiveToolUseConsoleStreamFrame[] = [];
      for await (const frame of service.streamTurn(
        buildDto({ stream: true }),
      )) {
        frames.push(frame);
      }

      expect(frames.some((frame) => frame.kind === 'turn-complete')).toBe(
        false,
      );
      const last = frames[frames.length - 1];
      expect(last.kind).toBe('error');
    });
  });
});
