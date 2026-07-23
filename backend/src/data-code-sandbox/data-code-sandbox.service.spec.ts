import { Test } from '@nestjs/testing';
import {
  AnthropicClient,
  AnthropicMessage,
} from '../shared/anthropic-client/anthropic-client';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import { ModelTier } from '../shared/model-config/model-config.types';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { GithubClient } from '../shared/github-provider/github-client';
import { FakeGithubClient } from '../testing/github/fake-github-client';
import { FakeAnthropicClient } from '../testing/anthropic/fake-anthropic-client';
import { fakeTextMessage } from '../testing/anthropic/message-builders';
import { ExternalApiError } from '../shared/api-error-handling';
import { DataCodeSandboxService } from './data-code-sandbox.service';
import { RunDto } from './dto/run.dto';

const MODEL_MAP: Record<ModelTier, string> = {
  default: 'claude-sonnet-5',
  classification: 'claude-haiku-4-5',
  'hardest-call': 'claude-opus-4-8',
};

function buildRunDto(overrides: Partial<RunDto> = {}): RunDto {
  return {
    prompt: 'Chart commit frequency by month.',
    useSkill: false,
    ...overrides,
  };
}

function codeExecutionMessage(
  entries: Array<{
    id: string;
    command: string;
    stdout: string;
    stderr: string;
    returnCode: number;
    outputFileIds?: string[];
  }>,
): AnthropicMessage {
  const content = entries.flatMap((entry) => [
    {
      type: 'server_tool_use',
      id: entry.id,
      name: 'bash_code_execution',
      input: { command: entry.command },
    },
    {
      type: 'bash_code_execution_tool_result',
      tool_use_id: entry.id,
      content: {
        stdout: entry.stdout,
        stderr: entry.stderr,
        return_code: entry.returnCode,
        content: (entry.outputFileIds ?? []).map((fileId) => ({
          type: 'bash_code_execution_output',
          file_id: fileId,
        })),
      },
    },
  ]);
  return fakeTextMessage('Done.', {
    content: content as unknown as AnthropicMessage['content'],
  });
}

describe('DataCodeSandboxService', () => {
  let fakeAnthropic: FakeAnthropicClient;
  let fakeGithub: FakeGithubClient;
  let service: DataCodeSandboxService;

  beforeEach(async () => {
    fakeAnthropic = new FakeAnthropicClient();
    fakeGithub = new FakeGithubClient();
    const modelConfigStub: Partial<ModelConfigService> = {
      getModel: jest.fn((tier: ModelTier) => MODEL_MAP[tier]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DataCodeSandboxService,
        EnvelopeBuilderService,
        { provide: AnthropicClient, useValue: fakeAnthropic },
        { provide: ModelConfigService, useValue: modelConfigStub },
        { provide: GithubClient, useValue: fakeGithub },
      ],
    }).compile();

    service = moduleRef.get(DataCodeSandboxService);
  });

  it('assembles issues+commits into JSON, uploads it, and includes a container_upload block with files-api-2025-04-14 always present', async () => {
    fakeAnthropic
      .queueFileUpload({ id: 'file_dataset_1' })
      .queueMessage(fakeTextMessage('Here is the analysis.'));

    await service.run(buildRunDto());

    const [params] = fakeAnthropic.recordedCalls;
    const content = params.messages[0].content as Array<
      Record<string, unknown>
    >;
    expect(content[0]).toEqual({
      type: 'container_upload',
      file_id: 'file_dataset_1',
    });
    expect(content[1]).toMatchObject({
      type: 'text',
      text: 'Chart commit frequency by month.',
    });
  });

  it('adds container.skills and the skills beta only when useSkill is true', async () => {
    fakeAnthropic
      .queueFileUpload({ id: 'file_dataset_1' })
      .queueMessage(fakeTextMessage('No skill used.'));

    await service.run(buildRunDto({ useSkill: false }));

    fakeAnthropic
      .queueSkillRegistration({ id: 'skill_abc' })
      .queueFileUpload({ id: 'file_dataset_2' })
      .queueMessage(fakeTextMessage('Used the skill.'));

    await service.run(buildRunDto({ useSkill: true }));

    const [withoutSkillParams, withSkillParams] = fakeAnthropic.recordedCalls;
    expect(
      (withoutSkillParams as unknown as { container?: unknown }).container,
    ).toBeUndefined();
    expect(
      (withSkillParams as unknown as { container?: unknown }).container,
    ).toEqual({
      skills: [{ type: 'custom', skill_id: 'skill_abc', version: 'latest' }],
    });
  });

  it('registers the skill on the first useSkill:true request and reuses the cached skill_id on the second', async () => {
    fakeAnthropic
      .queueSkillRegistration({ id: 'skill_abc' })
      .queueFileUpload({ id: 'file_dataset_1' })
      .queueMessage(fakeTextMessage('First run.'))
      .queueFileUpload({ id: 'file_dataset_2' })
      .queueMessage(fakeTextMessage('Second run.'));

    await service.run(buildRunDto({ useSkill: true }));
    await service.run(buildRunDto({ useSkill: true }));

    const [, secondParams] = fakeAnthropic.recordedCalls;
    expect(
      (secondParams as unknown as { container?: { skills: unknown[] } })
        .container?.skills,
    ).toEqual([{ type: 'custom', skill_id: 'skill_abc', version: 'latest' }]);
  });

  it('extracts executedCode in order from paired server_tool_use/bash_code_execution_tool_result blocks, empty when there are none', async () => {
    fakeAnthropic.queueFileUpload({ id: 'file_dataset_1' }).queueMessage(
      codeExecutionMessage([
        {
          id: 'srvtoolu_1',
          command: 'python analyze.py',
          stdout: 'ok',
          stderr: '',
          returnCode: 0,
        },
        {
          id: 'srvtoolu_2',
          command: 'python plot.py',
          stdout: 'saved chart.png',
          stderr: '',
          returnCode: 0,
        },
      ]),
    );

    const envelope = await service.run(buildRunDto());

    expect(envelope.executedCode).toEqual([
      { command: 'python analyze.py', stdout: 'ok', stderr: '', returnCode: 0 },
      {
        command: 'python plot.py',
        stdout: 'saved chart.png',
        stderr: '',
        returnCode: 0,
      },
    ]);

    fakeAnthropic
      .queueFileUpload({ id: 'file_dataset_2' })
      .queueMessage(fakeTextMessage('No code executed.'));
    const noCodeEnvelope = await service.run(buildRunDto());
    expect(noCodeEnvelope.executedCode).toEqual([]);
  });

  it('downloads an output file referenced in bash_code_execution_tool_result.content.content and includes it in outputFiles', async () => {
    fakeAnthropic
      .queueFileUpload({ id: 'file_dataset_1' })
      .queueMessage(
        codeExecutionMessage([
          {
            id: 'srvtoolu_1',
            command: 'python plot.py',
            stdout: '',
            stderr: '',
            returnCode: 0,
            outputFileIds: ['file_output_1'],
          },
        ]),
      )
      .queueFileDownload({
        bytes: Buffer.from('png bytes'),
        mediaType: 'image/png',
        filename: 'chart.png',
      });

    const envelope = await service.run(buildRunDto());

    expect(envelope.outputFiles).toEqual([
      {
        fileId: 'file_output_1',
        filename: 'chart.png',
        mediaType: 'image/png',
        dataBase64: Buffer.from('png bytes').toString('base64'),
      },
    ]);
  });

  it('sets skillUsed true only when a bash command actually invokes the skill, false when useSkill was requested but Claude never used it', async () => {
    fakeAnthropic
      .queueSkillRegistration({ id: 'skill_abc' })
      .queueFileUpload({ id: 'file_dataset_1' })
      .queueMessage(
        codeExecutionMessage([
          {
            id: 'srvtoolu_1',
            command: 'python analyze.py',
            stdout: 'ok',
            stderr: '',
            returnCode: 0,
          },
        ]),
      );
    const notUsed = await service.run(buildRunDto({ useSkill: true }));
    expect(notUsed.skillUsed).toBe(false);

    fakeAnthropic.queueFileUpload({ id: 'file_dataset_2' }).queueMessage(
      codeExecutionMessage([
        {
          id: 'srvtoolu_2',
          command:
            'python /skills/spreadsheet-export/export_xlsx.py out.xlsx data.json',
          stdout: '',
          stderr: '',
          returnCode: 0,
        },
      ]),
    );
    const used = await service.run(buildRunDto({ useSkill: true }));
    expect(used.skillUsed).toBe(true);

    fakeAnthropic
      .queueFileUpload({ id: 'file_dataset_3' })
      .queueMessage(fakeTextMessage('No skill requested.'));
    const notRequested = await service.run(buildRunDto({ useSkill: false }));
    expect(notRequested.skillUsed).toBe(false);
  });

  it('surfaces a GitHub fetch failure as ExternalApiError("github", ...)', async () => {
    const failingGithub: Partial<GithubClient> = {
      getIssues: jest
        .fn()
        .mockRejectedValue(new ExternalApiError('github', 'rate limited')),
      getCommits: jest.fn().mockResolvedValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DataCodeSandboxService,
        EnvelopeBuilderService,
        { provide: AnthropicClient, useValue: fakeAnthropic },
        {
          provide: ModelConfigService,
          useValue: { getModel: jest.fn(() => 'claude-sonnet-5') },
        },
        { provide: GithubClient, useValue: failingGithub },
      ],
    }).compile();
    const brokenService = moduleRef.get(DataCodeSandboxService);

    const error = await brokenService
      .run(buildRunDto())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ source: 'github' });
  });

  it('propagates an upload failure raised as ExternalApiError("anthropic", ...) unchanged', async () => {
    const failingAnthropic: Partial<AnthropicClient> = {
      uploadFile: jest
        .fn()
        .mockRejectedValue(new ExternalApiError('anthropic', 'upload failed')),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DataCodeSandboxService,
        EnvelopeBuilderService,
        { provide: AnthropicClient, useValue: failingAnthropic },
        {
          provide: ModelConfigService,
          useValue: { getModel: jest.fn(() => 'claude-sonnet-5') },
        },
        { provide: GithubClient, useValue: fakeGithub },
      ],
    }).compile();
    const brokenService = moduleRef.get(DataCodeSandboxService);

    const error = await brokenService
      .run(buildRunDto())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ source: 'anthropic' });
  });
});
