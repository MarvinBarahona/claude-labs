import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AppConfigService } from '../shared/config/config.service';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import {
  AnthropicClient,
  AnthropicMessage,
  AnthropicMessageParams,
  AnthropicStreamEvent,
} from '../shared/anthropic-client/anthropic-client';
import { shapeError, ShapedError } from '../shared/api-error-handling';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { TurnEnvelope } from '../shared/envelope-builder/envelope-builder.types';
import { StreamResponseBuilderService } from '../shared/stream-response-builder/stream-response-builder.service';
import { GithubClient } from '../shared/github-provider/github-client';
import { GithubFileTreeEntry } from '../shared/github-provider/github-provider.types';
import { DeepwikiConnectorService } from '../shared/deepwiki-connector/deepwiki-connector.service';
import { RunDto } from './dto/run.dto';

/** Counts both custom tool calls and `mcp_tool_use` calls — including one still unresolved/deferred to the next turn — even though an `mcp_tool_use` alone never advances the loop by itself. */
const ITERATION_CAP = 10;

/** Caps `list_files`/`search` results so a tool result's size is bounded regardless of `GITHUB_TARGET_REPO`'s actual tree size — see docs/technical/unbounded-data-sources.md. */
const MAX_TREE_ENTRIES = 500;

/** Caps `read_file` results so a single large file (a lockfile, a minified bundle) can't blow up a tool result. */
const MAX_FILE_CONTENT_CHARS = 20_000;

/** Caps an `ask_deepwiki` (`mcp_tool_result`) result's text — defense-in-depth for `read_wiki_structure`/`ask_question` (see `DEEPWIKI_ALLOWED_TOOLS` below for why `read_wiki_contents` itself is excluded rather than capped). */
const MAX_MCP_RESULT_CHARS = 20_000;

/** `read_wiki_contents` excluded, not just capped: an MCP result is billed as input tokens the moment it resolves server-side, before this backend ever sees the response — so a client-side cap can't bound it, and this one tool alone can cost ~$1 on a large repo. */
const DEEPWIKI_ALLOWED_TOOLS = ['read_wiki_structure', 'ask_question'];

/** Uniform result shape for `list_files`/`search`, whether or not truncation actually happened. */
interface TreeResult {
  entries: Array<{ path: string; type: 'blob' | 'tree' }>;
  totalMatches: number;
  truncated: boolean;
}

function toTreeResult(matches: GithubFileTreeEntry[]): TreeResult {
  return {
    entries: matches
      .slice(0, MAX_TREE_ENTRIES)
      .map(({ path, type }) => ({ path, type })),
    totalMatches: matches.length,
    truncated: matches.length > MAX_TREE_ENTRIES,
  };
}

type MessageContentBlock = AnthropicMessage['content'][number];
type ToolUseBlock = Extract<MessageContentBlock, { type: 'tool_use' }>;
type AnthropicTool = Anthropic.Messages.Tool;
type ToolResultBlockParam = Anthropic.Messages.ToolResultBlockParam;

type CustomToolName = 'list_files' | 'read_file' | 'search';
export type AgentPlaygroundToolName = CustomToolName | 'ask_deepwiki';

const CUSTOM_TOOLS: AnthropicTool[] = [
  {
    name: 'list_files',
    description:
      "List files in the repository's file tree, optionally filtered to paths starting with a given prefix. Results over " +
      `${MAX_TREE_ENTRIES} entries are truncated (check the "truncated" field); narrow with a path prefix to see everything under it.`,
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Optional path prefix to filter the file tree to, e.g. "src/app". Omit to list the whole tree (may be truncated for a large repo).',
        },
      },
    },
  },
  {
    name: 'read_file',
    description:
      'Read the full text content of a single file in the repository, by its exact path.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The exact file path to read, e.g. "README.md"',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'search',
    description:
      "Case-insensitive substring search over the repository's file paths (not file contents). Results over " +
      `${MAX_TREE_ENTRIES} matches are truncated (check the "truncated" field); use a more specific query to narrow down.`,
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Substring to search for within file paths',
        },
      },
      required: ['query'],
    },
  },
];

/** One earlier request/response pair in the loop. */
export interface TurnCall {
  request: AnthropicMessageParams;
  response: AnthropicMessage;
}

/** One tool call anywhere in the run, custom or MCP alike, in the order it happened. */
export interface ToolActivityEntry {
  tool: AgentPlaygroundToolName;
  input: unknown;
  result: unknown;
  isError: boolean;
}

export interface AgentPlaygroundEnvelope extends TurnEnvelope {
  calls: TurnCall[];
  toolActivity: ToolActivityEntry[];
  hitIterationCap: boolean;
  finalAnswer: string;
}

interface ExecutedTool {
  toolResultBlock: ToolResultBlockParam;
  displayResult: unknown;
  isError: boolean;
}

/** Loosely-typed view of a raw content block — `mcp_tool_use`/`mcp_tool_result` aren't part of the SDK's stable `ContentBlock` union yet. */
interface RawBlock {
  type: string;
  id?: string;
  tool_use_id?: string;
  input?: unknown;
  content?: unknown;
  is_error?: boolean;
}

/** Applied once right after a response is received, so the same capped copy is used for display and for what gets resent as history — same "cap once, uniformly" approach as the 3 custom tools. */
function capMcpToolResult(response: AnthropicMessage): AnthropicMessage {
  const blocks = response.content as unknown as RawBlock[];
  const cappedBlocks = blocks.map((block) => {
    if (block.type !== 'mcp_tool_result' || !Array.isArray(block.content)) {
      return block;
    }
    return {
      ...block,
      content: (block.content as RawBlock[]).map((item) => {
        const text = (item as { text?: unknown }).text;
        if (typeof text !== 'string' || text.length <= MAX_MCP_RESULT_CHARS) {
          return item;
        }
        return {
          ...item,
          text: `${text.slice(0, MAX_MCP_RESULT_CHARS)}\n\n[truncated — response exceeded ${MAX_MCP_RESULT_CHARS} characters]`,
        };
      }),
    };
  });
  return {
    ...response,
    content: cappedBlocks as unknown as AnthropicMessage['content'],
  };
}

export type AgentPlaygroundStreamFrame =
  | { kind: 'stream-event'; event: AnthropicStreamEvent }
  | { kind: 'tool-call-start'; name: string; input: unknown }
  | {
      kind: 'tool-call-result';
      name: string;
      result: unknown;
      isError: boolean;
    }
  | { kind: 'turn-complete'; envelope: AgentPlaygroundEnvelope }
  | { kind: 'error'; shaped: ShapedError };

function buildSystemPrompt(repo: string): string {
  return (
    `You are investigating the GitHub repository ${repo}. Your goal is to figure out ` +
    'what this repository does and how it is structured. Decide your own steps using the ' +
    "tools available to you: list_files and search explore the repository's file tree, " +
    "read_file reads one file's full contents, and ask_deepwiki lets you ask questions " +
    "about the repository's own generated documentation. There is no fixed procedure to " +
    'follow — choose whichever tools, and however many calls, actually help you understand ' +
    'the repository. Before concluding, inspect your own findings: re-read a file or ' +
    're-check a prior tool result if doing so would confirm or correct what you have ' +
    'learned, rather than guessing. When you are confident in your understanding, reply ' +
    'with a concise summary of what the repository does and how it is structured.'
  );
}

@Injectable()
export class AgentPlaygroundService {
  constructor(
    private readonly anthropicClient: AnthropicClient,
    private readonly modelConfig: ModelConfigService,
    private readonly envelopeBuilder: EnvelopeBuilderService,
    private readonly streamResponseBuilder: StreamResponseBuilderService,
    private readonly githubClient: GithubClient,
    private readonly deepwikiConnector: DeepwikiConnectorService,
    private readonly appConfig: AppConfigService,
  ) {}

  async run(dto: RunDto): Promise<AgentPlaygroundEnvelope> {
    void dto;
    let params = this.buildMessageParams();
    const calls: TurnCall[] = [];
    const toolActivity: ToolActivityEntry[] = [];
    let executedToolCalls = 0;

    for (;;) {
      const response = capMcpToolResult(
        await this.anthropicClient.createMessage(params, this.betas()),
      );
      this.recordMcpActivity(response, toolActivity);

      const toolUseBlocks = this.toolUseBlocksOf(response);
      const hitCap = executedToolCalls >= ITERATION_CAP;

      if (
        response.stop_reason !== 'tool_use' ||
        toolUseBlocks.length === 0 ||
        hitCap
      ) {
        return this.buildEnvelope(
          params,
          response,
          calls,
          toolActivity,
          hitCap &&
            response.stop_reason === 'tool_use' &&
            toolUseBlocks.length > 0,
        );
      }

      calls.push({ request: params, response });
      const executed = await Promise.all(
        toolUseBlocks.map((block) => this.executeTool(block)),
      );
      executedToolCalls +=
        toolUseBlocks.length + this.mcpToolUseCount(response);
      this.recordCustomActivity(toolUseBlocks, executed, toolActivity);
      params = this.appendToolResults(
        params,
        response,
        executed.map((result) => result.toolResultBlock),
      );
    }
  }

  async *streamRun(dto: RunDto): AsyncGenerator<AgentPlaygroundStreamFrame> {
    void dto;
    let params = this.buildMessageParams();
    const calls: TurnCall[] = [];
    const toolActivity: ToolActivityEntry[] = [];
    let executedToolCalls = 0;

    try {
      for (;;) {
        const events: AnthropicStreamEvent[] = [];
        for await (const event of this.anthropicClient.streamMessage(
          params,
          this.betas(),
        )) {
          events.push(event);
          yield { kind: 'stream-event', event };
        }
        const response = capMcpToolResult(
          this.streamResponseBuilder.reconstructMessage(events),
        );
        this.recordMcpActivity(response, toolActivity);

        const toolUseBlocks = this.toolUseBlocksOf(response);
        const hitCap = executedToolCalls >= ITERATION_CAP;

        if (
          response.stop_reason !== 'tool_use' ||
          toolUseBlocks.length === 0 ||
          hitCap
        ) {
          const envelope = this.buildEnvelope(
            params,
            response,
            calls,
            toolActivity,
            hitCap &&
              response.stop_reason === 'tool_use' &&
              toolUseBlocks.length > 0,
          );
          yield { kind: 'turn-complete', envelope };
          return;
        }

        calls.push({ request: params, response });
        const toolResultBlocks: ToolResultBlockParam[] = [];
        for (const block of toolUseBlocks) {
          yield {
            kind: 'tool-call-start',
            name: block.name,
            input: block.input,
          };
          const executed = await this.executeTool(block);
          toolResultBlocks.push(executed.toolResultBlock);
          toolActivity.push({
            tool: block.name as AgentPlaygroundToolName,
            input: block.input,
            result: executed.displayResult,
            isError: executed.isError,
          });
          yield {
            kind: 'tool-call-result',
            name: block.name,
            result: executed.displayResult,
            isError: executed.isError,
          };
        }
        executedToolCalls +=
          toolUseBlocks.length + this.mcpToolUseCount(response);
        params = this.appendToolResults(params, response, toolResultBlocks);
      }
    } catch (exception) {
      yield { kind: 'error', shaped: shapeError(exception) };
    }
  }

  private buildEnvelope(
    params: AnthropicMessageParams,
    response: AnthropicMessage,
    calls: TurnCall[],
    toolActivity: ToolActivityEntry[],
    hitIterationCap: boolean,
  ): AgentPlaygroundEnvelope {
    return {
      ...this.envelopeBuilder.build(params, response),
      calls,
      toolActivity,
      hitIterationCap,
      finalAnswer: this.extractFinalAnswer(response),
    };
  }

  private recordMcpActivity(
    response: AnthropicMessage,
    toolActivity: ToolActivityEntry[],
  ): void {
    const blocks = response.content as unknown as RawBlock[];
    for (const block of blocks) {
      if (block.type !== 'mcp_tool_use') {
        continue;
      }
      const resultBlock = blocks.find(
        (candidate) =>
          candidate.type === 'mcp_tool_result' &&
          candidate.tool_use_id === block.id,
      );
      toolActivity.push({
        tool: 'ask_deepwiki',
        input: block.input,
        result: resultBlock?.content ?? null,
        isError: Boolean(resultBlock?.is_error),
      });
    }
  }

  private recordCustomActivity(
    toolUseBlocks: ToolUseBlock[],
    executed: ExecutedTool[],
    toolActivity: ToolActivityEntry[],
  ): void {
    toolUseBlocks.forEach((block, index) => {
      toolActivity.push({
        tool: block.name as AgentPlaygroundToolName,
        input: block.input,
        result: executed[index].displayResult,
        isError: executed[index].isError,
      });
    });
  }

  private toolUseBlocksOf(response: AnthropicMessage): ToolUseBlock[] {
    return response.content.filter(
      (block): block is ToolUseBlock => block.type === 'tool_use',
    );
  }

  /** Includes an `mcp_tool_use` even when it's still pending, deferred to resolve at the start of the next response. */
  private mcpToolUseCount(response: AnthropicMessage): number {
    const blocks = response.content as unknown as RawBlock[];
    return blocks.filter((block) => block.type === 'mcp_tool_use').length;
  }

  /** Reassigns rather than mutates `params` — each earlier `calls` entry must keep the request snapshot it was actually sent with. */
  private appendToolResults(
    params: AnthropicMessageParams,
    response: AnthropicMessage,
    toolResultBlocks: ToolResultBlockParam[],
  ): AnthropicMessageParams {
    return {
      ...params,
      messages: [
        ...params.messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResultBlocks },
      ],
    };
  }

  private async executeTool(block: ToolUseBlock): Promise<ExecutedTool> {
    switch (block.name) {
      case 'list_files':
        return this.executeListFiles(block);
      case 'read_file':
        return this.executeReadFile(block);
      case 'search':
        return this.executeSearch(block);
      default:
        throw new Error(`Unknown tool: ${block.name}`);
    }
  }

  private async executeListFiles(block: ToolUseBlock): Promise<ExecutedTool> {
    const prefix = (block.input as { path?: string }).path;
    const tree = await this.githubClient.getFileTree();
    const filtered = prefix
      ? tree.filter((entry) => entry.path.startsWith(prefix))
      : tree;
    const result = toTreeResult(filtered);
    return {
      toolResultBlock: {
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      },
      displayResult: result,
      isError: false,
    };
  }

  private async executeSearch(block: ToolUseBlock): Promise<ExecutedTool> {
    const query = (block.input as { query: string }).query.toLowerCase();
    const tree = await this.githubClient.getFileTree();
    const matches = tree.filter((entry) =>
      entry.path.toLowerCase().includes(query),
    );
    const result = toTreeResult(matches);
    return {
      toolResultBlock: {
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      },
      displayResult: result,
      isError: false,
    };
  }

  /** A not-found (or otherwise unreadable) path is a resolvable-but-failed lookup, not a transport failure — same pattern as Live Tool-Use Console's not-found-location case. */
  private async executeReadFile(block: ToolUseBlock): Promise<ExecutedTool> {
    const path = (block.input as { path: string }).path;
    try {
      const file = await this.githubClient.getFileContent(path);
      const truncated = file.content.length > MAX_FILE_CONTENT_CHARS;
      const result = {
        content: truncated
          ? file.content.slice(0, MAX_FILE_CONTENT_CHARS)
          : file.content,
        encoding: file.encoding,
        truncated,
      };
      return {
        toolResultBlock: {
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        },
        displayResult: result,
        isError: false,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Could not read "${path}"`;
      return {
        toolResultBlock: {
          type: 'tool_result',
          tool_use_id: block.id,
          content: message,
          is_error: true,
        },
        displayResult: message,
        isError: true,
      };
    }
  }

  private extractFinalAnswer(response: AnthropicMessage): string {
    return response.content
      .filter(
        (block): block is Extract<MessageContentBlock, { type: 'text' }> =>
          block.type === 'text',
      )
      .map((block) => block.text)
      .join('');
  }

  private betas(): string[] {
    return this.deepwikiConnector.buildRequestFragment({
      allowedTools: DEEPWIKI_ALLOWED_TOOLS,
    }).betas;
  }

  private buildMessageParams(): AnthropicMessageParams {
    const deepwiki = this.deepwikiConnector.buildRequestFragment({
      allowedTools: DEEPWIKI_ALLOWED_TOOLS,
    });
    return {
      model: this.modelConfig.getModel('default'),
      max_tokens: this.modelConfig.getDefaultMaxTokens(),
      system: buildSystemPrompt(this.appConfig.githubTargetRepo),
      messages: [{ role: 'user', content: 'Begin your investigation.' }],
      tools: [...CUSTOM_TOOLS, ...deepwiki.tools],
      mcp_servers: deepwiki.mcpServers,
    } as unknown as AnthropicMessageParams;
  }
}
