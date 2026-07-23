import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import {
  AnthropicClient,
  AnthropicMessage,
  AnthropicMessageParams,
} from '../shared/anthropic-client/anthropic-client';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { TurnEnvelope } from '../shared/envelope-builder/envelope-builder.types';
import { GithubClient } from '../shared/github-provider/github-client';
import { RunDto } from './dto/run.dto';

const FILES_API_BETA = 'files-api-2025-04-14';
const SKILLS_BETA = 'skills-2025-10-02';
const DEFAULT_MAX_TOKENS = 4096;
/** The skill's own name — the signal `wasSkillInvoked()` looks for in an executed bash command, since no dedicated content block marks a skill invocation. */
const SKILL_NAME = 'spreadsheet-export';
const SKILL_DIR = join(__dirname, 'skills', 'spreadsheet-export');

export interface ExecutedCodeEntry {
  command: string;
  stdout: string;
  stderr: string;
  returnCode: number;
}

export interface DataCodeSandboxOutputFile {
  fileId: string;
  filename: string;
  mediaType: string;
  dataBase64: string;
}

export type DataCodeSandboxEnvelope = TurnEnvelope & {
  executedCode: ExecutedCodeEntry[];
  outputFiles: DataCodeSandboxOutputFile[];
  skillUsed: boolean;
};

interface ServerToolUseBlock {
  type: 'server_tool_use';
  id: string;
  name: string;
  input: { command?: string };
}

interface BashCodeExecutionOutputFile {
  type: 'bash_code_execution_output';
  file_id: string;
}

interface BashCodeExecutionResult {
  stdout: string;
  stderr: string;
  return_code: number;
  content?: BashCodeExecutionOutputFile[];
}

interface BashCodeExecutionToolResultBlock {
  type: 'bash_code_execution_tool_result';
  tool_use_id: string;
  content: BashCodeExecutionResult;
}

type RawContentBlock =
  ServerToolUseBlock | BashCodeExecutionToolResultBlock | { type: string };

@Injectable()
export class DataCodeSandboxService {
  private cachedSkillId: string | null = null;
  private skillRegistrationPromise: Promise<string> | null = null;

  constructor(
    private readonly anthropicClient: AnthropicClient,
    private readonly modelConfig: ModelConfigService,
    private readonly envelopeBuilder: EnvelopeBuilderService,
    private readonly githubClient: GithubClient,
  ) {}

  async run(dto: RunDto): Promise<DataCodeSandboxEnvelope> {
    const [issues, commits] = await Promise.all([
      this.githubClient.getIssues(),
      this.githubClient.getCommits(),
    ]);
    const dataset = Buffer.from(JSON.stringify({ issues, commits }), 'utf-8');
    const upload = await this.anthropicClient.uploadFile(
      dataset,
      'application/json',
    );

    const betas = [FILES_API_BETA];
    let container:
      | { skills: { type: string; skill_id: string; version: string }[] }
      | undefined;
    if (dto.useSkill) {
      const skillId = await this.resolveSkillId();
      betas.push(SKILLS_BETA);
      container = {
        skills: [{ type: 'custom', skill_id: skillId, version: 'latest' }],
      };
    }

    const params = {
      model: this.modelConfig.getModel('default'),
      max_tokens: DEFAULT_MAX_TOKENS,
      tools: [{ type: 'code_execution_20250825', name: 'code_execution' }],
      ...(container ? { container } : {}),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'container_upload', file_id: upload.id },
            { type: 'text', text: dto.prompt },
          ],
        },
      ],
    } as unknown as AnthropicMessageParams;

    const response = await this.anthropicClient.createMessage(params, betas);

    const executedCode = this.extractExecutedCode(response);
    const outputFiles = await this.extractOutputFiles(response);
    const skillUsed = dto.useSkill && this.wasSkillInvoked(executedCode);

    return {
      ...this.envelopeBuilder.build(params, response),
      executedCode,
      outputFiles,
      skillUsed,
    };
  }

  private async resolveSkillId(): Promise<string> {
    if (this.cachedSkillId) {
      return this.cachedSkillId;
    }
    if (!this.skillRegistrationPromise) {
      this.skillRegistrationPromise = this.registerSkill();
    }
    const skillId = await this.skillRegistrationPromise;
    this.cachedSkillId = skillId;
    return skillId;
  }

  private async registerSkill(): Promise<string> {
    const files = [
      {
        filename: 'SKILL.md',
        content: readFileSync(join(SKILL_DIR, 'SKILL.md')),
      },
      {
        filename: 'export_xlsx.py',
        content: readFileSync(join(SKILL_DIR, 'export_xlsx.py')),
      },
    ];
    const result = await this.anthropicClient.registerSkill(files);
    return result.id;
  }

  private extractExecutedCode(response: AnthropicMessage): ExecutedCodeEntry[] {
    const blocks = response.content as unknown as RawContentBlock[];
    const toolUseById = new Map<string, ServerToolUseBlock>();
    for (const block of blocks) {
      if (block.type === 'server_tool_use') {
        const toolUse = block as ServerToolUseBlock;
        if (toolUse.name === 'bash_code_execution') {
          toolUseById.set(toolUse.id, toolUse);
        }
      }
    }

    const entries: ExecutedCodeEntry[] = [];
    for (const block of blocks) {
      if (block.type !== 'bash_code_execution_tool_result') {
        continue;
      }
      const resultBlock = block as BashCodeExecutionToolResultBlock;
      const toolUse = toolUseById.get(resultBlock.tool_use_id);
      if (!toolUse) {
        continue;
      }
      entries.push({
        command: toolUse.input.command ?? '',
        stdout: resultBlock.content.stdout,
        stderr: resultBlock.content.stderr,
        returnCode: resultBlock.content.return_code,
      });
    }
    return entries;
  }

  private async extractOutputFiles(
    response: AnthropicMessage,
  ): Promise<DataCodeSandboxOutputFile[]> {
    const blocks = response.content as unknown as RawContentBlock[];
    const fileIds: string[] = [];
    for (const block of blocks) {
      if (block.type !== 'bash_code_execution_tool_result') {
        continue;
      }
      const resultBlock = block as BashCodeExecutionToolResultBlock;
      for (const file of resultBlock.content.content ?? []) {
        fileIds.push(file.file_id);
      }
    }

    const downloaded = await Promise.all(
      fileIds.map((fileId) => this.anthropicClient.downloadFile(fileId)),
    );
    return downloaded.map((file, index) => ({
      fileId: fileIds[index],
      filename: file.filename,
      mediaType: file.mediaType,
      dataBase64: file.bytes.toString('base64'),
    }));
  }

  /** No dedicated content block marks a skill invocation — a bash command referencing the skill's own name is the only observable signal. */
  private wasSkillInvoked(executedCode: ExecutedCodeEntry[]): boolean {
    return executedCode.some((entry) => entry.command.includes(SKILL_NAME));
  }
}
