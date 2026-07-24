import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  AnthropicClient,
  AnthropicMessageParams,
} from '../shared/anthropic-client/anthropic-client';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import { ModelTier } from '../shared/model-config/model-config.types';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { CachingLayerService } from '../shared/caching-layer/caching-layer.service';
import { GithubClient } from '../shared/github-provider/github-client';
import { GithubIssue } from '../shared/github-provider/github-provider.types';
import { FakeAnthropicClient } from '../testing/anthropic/fake-anthropic-client';
import { FakeGithubClient } from '../testing/github/fake-github-client';
import { fakeTextMessage } from '../testing/anthropic/message-builders';
import {
  GradingCriterion,
  IssueCategory,
  WorkflowGalleryService,
} from './workflow-gallery.service';
import { RunDto } from './dto/run.dto';

const MODEL_MAP: Record<ModelTier, string> = {
  default: 'claude-sonnet-5',
  classification: 'claude-haiku-4-5',
  'hardest-call': 'claude-opus-4-8',
};

const CRITERIA: GradingCriterion[] = [
  'tone',
  'technical-accuracy',
  'policy-compliance',
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

function queueRouting(
  fake: FakeAnthropicClient,
  category: IssueCategory,
): void {
  fake.queueMessage(fakeTextMessage(JSON.stringify({ category })));
}

function queueDraftAndRefine(
  fake: FakeAnthropicClient,
  draftText = 'Here is my draft response.',
  refinedText = 'Here is the refined response.',
): void {
  fake.queueMessage(fakeTextMessage(draftText));
  fake.queueMessage(fakeTextMessage(refinedText));
}

function queueGrading(
  fake: FakeAnthropicClient,
  overrides: Partial<
    Record<GradingCriterion, { pass: boolean; feedback: string }>
  > = {},
): void {
  CRITERIA.forEach((criterion) => {
    const result = overrides[criterion] ?? {
      pass: true,
      feedback: `${criterion} looks good`,
    };
    fake.queueMessage(fakeTextMessage(JSON.stringify(result)));
  });
}

function lastSystemBlockHasCacheControl(
  params: AnthropicMessageParams,
): boolean {
  const system = params.system;
  if (!Array.isArray(system) || system.length === 0) {
    return false;
  }
  const last = system[system.length - 1] as { cache_control?: unknown };
  return Boolean(last.cache_control);
}

describe('WorkflowGalleryService', () => {
  let fakeAnthropic: FakeAnthropicClient;
  let fakeGithub: FakeGithubClient;
  let service: WorkflowGalleryService;

  beforeEach(async () => {
    fakeAnthropic = new FakeAnthropicClient();
    fakeGithub = new FakeGithubClient().setIssues([TEST_ISSUE]);
    const modelConfigStub: Partial<ModelConfigService> = {
      getModel: jest.fn((tier: ModelTier) => MODEL_MAP[tier]),
      getDefaultMaxTokens: jest.fn(() => 4096),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowGalleryService,
        EnvelopeBuilderService,
        CachingLayerService,
        { provide: AnthropicClient, useValue: fakeAnthropic },
        { provide: ModelConfigService, useValue: modelConfigStub },
        { provide: GithubClient, useValue: fakeGithub },
      ],
    }).compile();

    service = moduleRef.get(WorkflowGalleryService);
  });

  describe('run', () => {
    it.each([['bug'], ['feature-request'], ['question'], ['support']] as [
      IssueCategory,
    ][])(
      'routes to %s and embeds the category in the draft call',
      async (category) => {
        queueRouting(fakeAnthropic, category);
        queueDraftAndRefine(fakeAnthropic);
        queueGrading(fakeAnthropic);

        const envelope = await service.run(buildDto());

        expect(envelope.route).toBe(category);
        const draftParams = fakeAnthropic.recordedCalls[1];
        const draftContent = draftParams.messages[0].content;
        expect(typeof draftContent).toBe('string');
        expect(draftContent as string).toContain(category);
      },
    );

    it('issues draft then refine sequentially, with refine replaying the draft response as an assistant message', async () => {
      queueRouting(fakeAnthropic, 'bug');
      queueDraftAndRefine(
        fakeAnthropic,
        'Here is my draft response.',
        'Here is the refined response.',
      );
      queueGrading(fakeAnthropic);

      await service.run(buildDto());

      expect(fakeAnthropic.recordedCalls).toHaveLength(6);
      const draftParams = fakeAnthropic.recordedCalls[1];
      const refineParams = fakeAnthropic.recordedCalls[2];
      expect(refineParams.messages).toHaveLength(3);
      expect(refineParams.messages[0]).toEqual(draftParams.messages[0]);
      expect(refineParams.messages[1]).toEqual({
        role: 'assistant',
        content: 'Here is my draft response.',
      });
    });

    it('runs exactly 3 concurrent grading calls and returns all 3 criteria results', async () => {
      queueRouting(fakeAnthropic, 'bug');
      queueDraftAndRefine(fakeAnthropic);
      queueGrading(fakeAnthropic);

      const envelope = await service.run(buildDto());

      expect(fakeAnthropic.recordedCalls).toHaveLength(6);
      expect(envelope.grading).toHaveLength(3);
      expect(envelope.grading.map((result) => result.criterion)).toEqual(
        CRITERIA,
      );
    });

    it('appends failing-criterion feedback to the next draft call and re-runs draft/refine/grade', async () => {
      queueRouting(fakeAnthropic, 'bug');
      queueDraftAndRefine(fakeAnthropic, 'draft 1', 'refined 1');
      queueGrading(fakeAnthropic, {
        tone: { pass: false, feedback: 'Too curt, add warmth.' },
      });
      queueDraftAndRefine(fakeAnthropic, 'draft 2', 'refined 2');
      queueGrading(fakeAnthropic);

      const envelope = await service.run(buildDto());

      expect(envelope.iterations).toBe(2);
      expect(envelope.passed).toBe(true);
      expect(fakeAnthropic.recordedCalls).toHaveLength(11);
      const secondDraftParams = fakeAnthropic.recordedCalls[6];
      const secondDraftContent = secondDraftParams.messages[0]
        .content as string;
      expect(secondDraftContent).toContain('Too curt, add warmth.');
    });

    it('stops at the first attempt where all 3 criteria pass', async () => {
      queueRouting(fakeAnthropic, 'bug');
      queueDraftAndRefine(fakeAnthropic);
      queueGrading(fakeAnthropic);

      const envelope = await service.run(buildDto());

      expect(envelope.iterations).toBe(1);
      expect(envelope.passed).toBe(true);
    });

    it('enforces the 3-attempt cap: after 3 failing attempts, passed is false and no 4th attempt is made', async () => {
      queueRouting(fakeAnthropic, 'bug');
      for (let attempt = 0; attempt < 3; attempt++) {
        queueDraftAndRefine(
          fakeAnthropic,
          `draft ${attempt}`,
          `refined ${attempt}`,
        );
        queueGrading(fakeAnthropic, {
          tone: { pass: false, feedback: 'Still not right.' },
        });
      }

      const envelope = await service.run(buildDto());

      expect(envelope.passed).toBe(false);
      expect(envelope.iterations).toBe(3);
      expect(fakeAnthropic.recordedCalls).toHaveLength(1 + 3 * 5);
    });

    it('calls holds every call except the very last one, in chronological order', async () => {
      queueRouting(fakeAnthropic, 'bug');
      queueDraftAndRefine(fakeAnthropic);
      queueGrading(fakeAnthropic);

      const envelope = await service.run(buildDto());

      expect(envelope.calls).toHaveLength(5);
      expect(envelope.calls[0].request).toBe(fakeAnthropic.recordedCalls[0]);
      expect(envelope.calls[1].request).toBe(fakeAnthropic.recordedCalls[1]);
      expect(envelope.calls[4].request).toBe(fakeAnthropic.recordedCalls[4]);
      expect(envelope.request).toBe(fakeAnthropic.recordedCalls[5]);
    });

    it('places a cache boundary on every call after routing, and reports cache read/write off the final call usage', async () => {
      queueRouting(fakeAnthropic, 'bug');
      queueDraftAndRefine(fakeAnthropic);
      CRITERIA.forEach((criterion, index) => {
        const isLast = index === CRITERIA.length - 1;
        fakeAnthropic.queueMessage(
          fakeTextMessage(JSON.stringify({ pass: true, feedback: 'ok' }), {
            usage: {
              input_tokens: 10,
              output_tokens: 10,
              cache_creation: null,
              cache_creation_input_tokens: isLast ? 50 : null,
              cache_read_input_tokens: isLast ? 100 : null,
              inference_geo: null,
              output_tokens_details: null,
              server_tool_use: null,
              service_tier: 'standard',
            },
          }),
        );
      });

      const envelope = await service.run(buildDto());

      const routingParams = fakeAnthropic.recordedCalls[0];
      expect(lastSystemBlockHasCacheControl(routingParams)).toBe(false);

      for (let i = 1; i < fakeAnthropic.recordedCalls.length; i++) {
        expect(
          lastSystemBlockHasCacheControl(fakeAnthropic.recordedCalls[i]),
        ).toBe(true);
      }

      expect(envelope.cache).toEqual({ read: true, write: true });
    });

    it('throws NotFoundException when issueNumber is not among the currently open issues, before any Claude call', async () => {
      await expect(
        service.run(buildDto({ issueNumber: 9999 })),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fakeAnthropic.recordedCalls).toHaveLength(0);
    });
  });
});
