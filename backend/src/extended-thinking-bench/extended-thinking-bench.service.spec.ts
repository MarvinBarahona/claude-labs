import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  AnthropicClient,
  AnthropicMessage,
} from '../shared/anthropic-client/anthropic-client';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import { ModelTier } from '../shared/model-config/model-config.types';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { GithubClient } from '../shared/github-provider/github-client';
import { GithubIssue } from '../shared/github-provider/github-provider.types';
import { FakeAnthropicClient } from '../testing/anthropic/fake-anthropic-client';
import { FakeGithubClient } from '../testing/github/fake-github-client';
import { fakeTextMessage } from '../testing/anthropic/message-builders';
import {
  ExtendedThinkingBenchService,
  ThinkingRunLabel,
} from './extended-thinking-bench.service';
import { RunDto } from './dto/run.dto';

const MODEL_MAP: Record<ModelTier, string> = {
  default: 'claude-sonnet-5',
  classification: 'claude-haiku-4-5',
  'hardest-call': 'claude-opus-4-8',
};

const RUN_LABELS: ThinkingRunLabel[] = [
  'thinking-off',
  'thinking-medium',
  'thinking-high',
];

const TEST_ISSUE: GithubIssue = {
  number: 42,
  title: 'App crashes on startup',
  state: 'open',
  body: 'Steps to reproduce: open the app, it immediately crashes.',
  user: 'reporter',
  createdAt: '2026-01-01T00:00:00Z',
  url: 'https://github.com/x/y/issues/42',
};

function buildDto(overrides: Partial<RunDto> = {}): RunDto {
  return { issueNumber: TEST_ISSUE.number, ...overrides };
}

function fakeThinkingMessage(
  thinkingText: string,
  answerText: string,
): AnthropicMessage {
  return fakeTextMessage(answerText, {
    content: [
      { type: 'thinking', thinking: thinkingText, signature: 'sig_fake' },
      { type: 'text', text: answerText, citations: null },
    ],
  });
}

function queueThreeRuns(
  fake: FakeAnthropicClient,
  overrides: Partial<Record<ThinkingRunLabel, AnthropicMessage>> = {},
): void {
  RUN_LABELS.forEach((label) => {
    fake.queueMessage(overrides[label] ?? fakeTextMessage(`${label} answer`));
  });
}

describe('ExtendedThinkingBenchService', () => {
  let fakeAnthropic: FakeAnthropicClient;
  let fakeGithub: FakeGithubClient;
  let service: ExtendedThinkingBenchService;
  let getModel: jest.Mock;

  beforeEach(async () => {
    fakeAnthropic = new FakeAnthropicClient();
    fakeGithub = new FakeGithubClient().setIssues([TEST_ISSUE]);
    getModel = jest.fn((tier: ModelTier) => MODEL_MAP[tier]);
    const modelConfigStub: Partial<ModelConfigService> = { getModel };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ExtendedThinkingBenchService,
        EnvelopeBuilderService,
        { provide: AnthropicClient, useValue: fakeAnthropic },
        { provide: ModelConfigService, useValue: modelConfigStub },
        { provide: GithubClient, useValue: fakeGithub },
      ],
    }).compile();

    service = moduleRef.get(ExtendedThinkingBenchService);
  });

  describe('listIssues', () => {
    it('maps the open-issues list to number/title pairs', async () => {
      const result = await service.listIssues();
      expect(result).toEqual({
        issues: [{ number: 42, title: 'App crashes on startup' }],
      });
    });
  });

  describe('run', () => {
    it('throws NotFoundException when issueNumber is not among the currently open issues, before any Claude call', async () => {
      await expect(
        service.run(buildDto({ issueNumber: 9999 })),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fakeAnthropic.recordedCalls).toHaveLength(0);
    });

    it('issues exactly 3 concurrent calls, in thinking-off/medium/high order, all on getModel("default")', async () => {
      queueThreeRuns(fakeAnthropic);

      const result = await service.run(buildDto());

      expect(fakeAnthropic.recordedCalls).toHaveLength(3);
      expect(result.runs.map((run) => run.label)).toEqual(RUN_LABELS);
      expect(getModel).toHaveBeenCalledTimes(3);
      expect(getModel).toHaveBeenNthCalledWith(1, 'default');
      expect(getModel).toHaveBeenNthCalledWith(2, 'default');
      expect(getModel).toHaveBeenNthCalledWith(3, 'default');
    });

    it('sends no thinking field for thinking-off, and the matching adaptive/effort shape for thinking-medium and thinking-high', async () => {
      queueThreeRuns(fakeAnthropic);

      await service.run(buildDto());

      const [offParams, mediumParams, highParams] = fakeAnthropic.recordedCalls;

      expect(offParams.thinking).toBeUndefined();
      expect(offParams.output_config).toBeUndefined();

      expect(mediumParams.thinking).toEqual({
        type: 'adaptive',
        display: 'summarized',
      });
      expect(mediumParams.output_config).toEqual({ effort: 'medium' });

      expect(highParams.thinking).toEqual({
        type: 'adaptive',
        display: 'summarized',
      });
      expect(highParams.output_config).toEqual({ effort: 'high' });
    });

    it('extracts reasoningTrace from summarized thinking-block text for the two thinking-on runs, and null for thinking-off', async () => {
      queueThreeRuns(fakeAnthropic, {
        'thinking-off': fakeTextMessage('Plain answer, no thinking.'),
        'thinking-medium': fakeThinkingMessage(
          'Considering the medium-effort angle...',
          'Medium-effort answer.',
        ),
        'thinking-high': fakeThinkingMessage(
          'Considering the high-effort angle in depth...',
          'High-effort answer.',
        ),
      });

      const result = await service.run(buildDto());

      const [off, medium, high] = result.runs;
      expect(off.reasoningTrace).toBeNull();
      expect(off.answer).toBe('Plain answer, no thinking.');
      expect(medium.reasoningTrace).toBe(
        'Considering the medium-effort angle...',
      );
      expect(medium.answer).toBe('Medium-effort answer.');
      expect(high.reasoningTrace).toBe(
        'Considering the high-effort angle in depth...',
      );
      expect(high.answer).toBe('High-effort answer.');
    });

    it('measures latencyMs per run', async () => {
      queueThreeRuns(fakeAnthropic);
      const timestamps = [1000, 1000, 1000, 1050, 1080, 1120];
      let call = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => timestamps[call++]);

      const result = await service.run(buildDto());

      expect(result.runs[0].latencyMs).toBe(50);
      expect(result.runs[1].latencyMs).toBe(80);
      expect(result.runs[2].latencyMs).toBe(120);
    });

    it('each run carries its own complete envelope', async () => {
      queueThreeRuns(fakeAnthropic);

      const result = await service.run(buildDto());

      result.runs.forEach((run, index) => {
        expect(run.envelope.request).toBe(fakeAnthropic.recordedCalls[index]);
        expect(run.envelope.usage).toBeDefined();
        expect(run.envelope.stopReason).toBe('end_turn');
      });
    });
  });
});
