import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
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
import { ContentBlockBuilderService } from '../shared/content-block-builder/content-block-builder.service';
import { ContentBlockDeliveryMode } from '../shared/content-block-builder/content-block-builder.types';
import { CachingLayerService } from '../shared/caching-layer/caching-layer.service';
import { ArxivClient } from './arxiv-client';
import { CreateSessionDto } from './dto/create-session.dto';
import { AskDto } from './dto/ask.dto';

const DEFAULT_MAX_TOKENS = 4096;
const NOTES_PATH = '/notes.md';
/** Needed on the Messages call itself (not just the upload) whenever a request references an uploaded `file_id`. */
const FILES_API_BETA = 'files-api-2025-04-14';

type MessageContentBlock = AnthropicMessage['content'][number];
type ToolUseBlock = Extract<MessageContentBlock, { type: 'tool_use' }>;
type ToolResultBlockParam = Anthropic.Messages.ToolResultBlockParam;
type MessageParam = Anthropic.Messages.MessageParam;
type ContentBlockParam = Anthropic.Messages.ContentBlockParam;
type TextBlockParam = Anthropic.Messages.TextBlockParam;
type TextEditorTool = Anthropic.Messages.ToolTextEditor20250728;

/** One earlier request/response pair in a multi-call text-editor-tool loop. */
export interface TurnCall {
  request: AnthropicMessageParams;
  response: AnthropicMessage;
}

export interface FlattenedCitation {
  citedText: string;
  documentTitle: string;
  startPage: number;
  endPage: number;
}

export type DocumentResearchAssistantEnvelope = TurnEnvelope & {
  calls?: TurnCall[];
  answer: string;
  citations: FlattenedCitation[];
  notes: string | null;
  cache: { read: boolean; write: boolean };
};

export interface SessionPaper {
  arxivId: string;
  title: string;
  authors: string[];
  summary: string;
  pdfUrl: string;
}

export interface CreateSessionResult {
  sessionId: string;
  paper: SessionPaper;
}

interface DocumentSession {
  paper: SessionPaper;
  pdfBytes: Buffer;
  fileId?: string;
  notesFileContent: string | null;
  messages: MessageParam[];
}

export type DocumentResearchAssistantStreamFrame =
  | { kind: 'stream-event'; event: AnthropicStreamEvent }
  | { kind: 'tool-call-start'; name: string; input: unknown }
  | {
      kind: 'tool-call-result';
      name: string;
      result: unknown;
      isError: boolean;
    }
  | { kind: 'turn-complete'; envelope: DocumentResearchAssistantEnvelope }
  | { kind: 'error'; shaped: ShapedError };

/** Schema-less server-executed-shaped tool — the backend implements its real file I/O, so per architecture.md it still runs through the custom-tool loop rather than resolving server-side. */
const TEXT_EDITOR_TOOL: TextEditorTool = {
  type: 'text_editor_20250728',
  name: 'str_replace_based_edit_tool',
};

/** Unlike a self-describing custom tool, the text editor tool carries no `description` field — without this, Claude has no way to know `/notes.md` exists or what it's for. */
const SYSTEM_PROMPT =
  'You are a research assistant helping the user understand an attached academic paper. ' +
  'You have access to a text editor tool for maintaining a single running notes file at /notes.md. ' +
  'Whenever the user asks you to note, record, or remember something about the paper, use the tool ' +
  '(create it the first time, then str_replace/insert for later edits) to keep that file up to date.';

interface ExecutedTool {
  toolResultBlock: ToolResultBlockParam;
  displayResult: unknown;
  isError: boolean;
}

/** `message_start`'s own `content` is always `[]` in real streaming — reassembles it from the delta events instead, including streamed tool_use input JSON. Duplicated from live-tool-use-console.service.ts: per envelope-builder.md, this reconstruction is deliberately lab-local, not shared. */
function accumulateStreamedContent(
  events: readonly AnthropicStreamEvent[],
): MessageContentBlock[] {
  const blocksByIndex = new Map<number, MessageContentBlock>();
  const toolInputJsonByIndex = new Map<number, string>();

  for (const event of events) {
    if (event.type === 'content_block_start') {
      blocksByIndex.set(event.index, { ...event.content_block });
      if (event.content_block.type === 'tool_use') {
        toolInputJsonByIndex.set(event.index, '');
      }
      continue;
    }
    if (event.type === 'content_block_delta') {
      const block = blocksByIndex.get(event.index);
      if (block && block.type === 'text' && event.delta.type === 'text_delta') {
        block.text += event.delta.text;
      }
      if (
        block &&
        block.type === 'thinking' &&
        event.delta.type === 'thinking_delta'
      ) {
        block.thinking += event.delta.thinking;
      }
      if (
        block &&
        block.type === 'thinking' &&
        event.delta.type === 'signature_delta'
      ) {
        block.signature += event.delta.signature;
      }
      if (event.delta.type === 'input_json_delta') {
        const soFar = toolInputJsonByIndex.get(event.index) ?? '';
        toolInputJsonByIndex.set(event.index, soFar + event.delta.partial_json);
      }
      continue;
    }
    if (event.type === 'content_block_stop') {
      const block = blocksByIndex.get(event.index);
      const json = toolInputJsonByIndex.get(event.index);
      if (block && block.type === 'tool_use' && json !== undefined) {
        block.input = json.length > 0 ? JSON.parse(json) : {};
      }
    }
  }

  return [...blocksByIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, block]) => block);
}

function numberLines(content: string): string {
  return content
    .split('\n')
    .map((line, index) => `${index + 1}\t${line}`)
    .join('\n');
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count++;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function replaceFirst(
  haystack: string,
  needle: string,
  replacement: string,
): string {
  const index = haystack.indexOf(needle);
  return (
    haystack.slice(0, index) +
    replacement +
    haystack.slice(index + needle.length)
  );
}

function extractAnswerText(response: AnthropicMessage): string {
  return response.content
    .filter(
      (block): block is Extract<MessageContentBlock, { type: 'text' }> =>
        block.type === 'text',
    )
    .map((block) => block.text)
    .join('');
}

function flattenCitations(response: AnthropicMessage): FlattenedCitation[] {
  const citations: FlattenedCitation[] = [];
  for (const block of response.content) {
    if (block.type !== 'text' || !block.citations) {
      continue;
    }
    for (const citation of block.citations) {
      if (citation.type !== 'page_location') {
        continue;
      }
      citations.push({
        citedText: citation.cited_text,
        documentTitle: citation.document_title ?? '',
        startPage: citation.start_page_number,
        endPage: citation.end_page_number,
      });
    }
  }
  return citations;
}

/** A resent citation ties back to the exact document state it was generated against — invalid once that document's request-level identity has moved on (e.g. a delivery-mode switch), so history keeps the cited text but drops the citation metadata itself. */
function toHistoryContent(
  content: AnthropicMessage['content'],
): ContentBlockParam[] {
  return content.map((block) => {
    if (block.type !== 'text' || !block.citations) {
      return block;
    }
    const { citations, ...rest } = block;
    void citations;
    return rest;
  });
}

@Injectable()
export class DocumentResearchAssistantService {
  private readonly sessions = new Map<string, DocumentSession>();

  constructor(
    private readonly anthropicClient: AnthropicClient,
    private readonly modelConfig: ModelConfigService,
    private readonly envelopeBuilder: EnvelopeBuilderService,
    private readonly contentBlockBuilder: ContentBlockBuilderService,
    private readonly cachingLayer: CachingLayerService,
    private readonly arxivClient: ArxivClient,
  ) {}

  async createSession(dto: CreateSessionDto): Promise<CreateSessionResult> {
    const { pdfBytes, ...paper } = await this.arxivClient.getPaper(dto.arxivId);
    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      paper,
      pdfBytes,
      notesFileContent: null,
      messages: [],
    });
    return { sessionId, paper };
  }

  /** Throws `NotFoundException` for an unknown session — called up front by the controller before it commits to a streaming response, since a 404 can't land as a real HTTP status once SSE headers are already written. */
  assertSessionExists(sessionId: string): void {
    this.getSessionOrThrow(sessionId);
  }

  async ask(
    sessionId: string,
    dto: AskDto,
  ): Promise<DocumentResearchAssistantEnvelope> {
    const session = this.getSessionOrThrow(sessionId);
    let params = await this.buildInitialParams(session, dto);
    const betas =
      dto.deliveryMode === 'files-api' ? [FILES_API_BETA] : undefined;
    const calls: TurnCall[] = [];

    for (;;) {
      const response = await this.anthropicClient.createMessage(params, betas);
      if (response.stop_reason !== 'tool_use') {
        this.finalizeTurn(session, params, response);
        return this.buildEnvelope(session, params, response, calls);
      }

      calls.push({ request: params, response });
      const toolUseBlocks = this.toolUseBlocksOf(response);
      const executed = toolUseBlocks.map((block) =>
        this.executeTextEditorTool(block, session),
      );
      params = this.appendToolResults(
        params,
        response,
        executed.map((result) => result.toolResultBlock),
      );
    }
  }

  async *streamAsk(
    sessionId: string,
    dto: AskDto,
  ): AsyncGenerator<DocumentResearchAssistantStreamFrame> {
    try {
      const session = this.getSessionOrThrow(sessionId);
      let params = await this.buildInitialParams(session, dto);
      const betas =
        dto.deliveryMode === 'files-api' ? [FILES_API_BETA] : undefined;
      const calls: TurnCall[] = [];

      for (;;) {
        const events: AnthropicStreamEvent[] = [];
        for await (const event of this.anthropicClient.streamMessage(
          params,
          betas,
        )) {
          events.push(event);
          yield { kind: 'stream-event', event };
        }
        const response = this.buildMessageFromEvents(events);

        if (response.stop_reason !== 'tool_use') {
          this.finalizeTurn(session, params, response);
          const envelope = this.buildEnvelope(session, params, response, calls);
          yield { kind: 'turn-complete', envelope };
          return;
        }

        calls.push({ request: params, response });
        const toolResultBlocks: ToolResultBlockParam[] = [];
        for (const block of this.toolUseBlocksOf(response)) {
          yield {
            kind: 'tool-call-start',
            name: block.name,
            input: block.input,
          };
          const executed = this.executeTextEditorTool(block, session);
          toolResultBlocks.push(executed.toolResultBlock);
          yield {
            kind: 'tool-call-result',
            name: block.name,
            result: executed.displayResult,
            isError: executed.isError,
          };
        }
        params = this.appendToolResults(params, response, toolResultBlocks);
      }
    } catch (exception) {
      yield { kind: 'error', shaped: shapeError(exception) };
    }
  }

  private getSessionOrThrow(sessionId: string): DocumentSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(
        `Unknown document-research-assistant session "${sessionId}"`,
      );
    }
    return session;
  }

  /** Rebuilds `messages[0]`'s document block from the current delivery mode on every ask — toggling mode mid-session deliberately breaks the cache prefix, demonstrating a cache write instead of a read on the next call. */
  private async buildInitialParams(
    session: DocumentSession,
    dto: AskDto,
  ): Promise<AnthropicMessageParams> {
    const documentBlock = await this.resolveDocumentBlock(
      session,
      dto.deliveryMode,
    );
    const isFirstAsk = session.messages.length === 0;
    const firstQuestionBlock: TextBlockParam = isFirstAsk
      ? { type: 'text', text: dto.question }
      : this.firstQuestionTextBlockOf(session.messages[0]);

    const firstMessage: MessageParam = {
      role: 'user',
      content: [documentBlock, firstQuestionBlock],
    };
    const restMessages = isFirstAsk ? [] : session.messages.slice(1);
    const newQuestionMessages: MessageParam[] = isFirstAsk
      ? []
      : [{ role: 'user', content: dto.question }];

    const params: AnthropicMessageParams = {
      model: this.modelConfig.getModel('default'),
      max_tokens: DEFAULT_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [TEXT_EDITOR_TOOL],
      messages: [firstMessage, ...restMessages, ...newQuestionMessages],
    };

    return this.cachingLayer.markBreakpoints(params, [
      { region: 'messages', messageIndex: 0 },
    ]);
  }

  /** `file_id` is reused (never re-uploaded) once cached on the session; base64 has no upload step to reuse — it's cheap to rebuild every call. */
  private async resolveDocumentBlock(
    session: DocumentSession,
    mode: ContentBlockDeliveryMode,
  ): Promise<ContentBlockParam> {
    let block: { type: string; source: unknown };
    if (mode === 'files-api' && session.fileId) {
      block = {
        type: 'document',
        source: { type: 'file', file_id: session.fileId },
      };
    } else {
      block = await this.contentBlockBuilder.buildBlock(
        session.pdfBytes,
        'application/pdf',
        mode,
      );
      if (mode === 'files-api') {
        session.fileId = (block.source as { file_id: string }).file_id;
      }
    }

    // The Files-API `file_id` source shape (and, for base64, a non-literal `media_type`) isn't
    // part of the stable SDK's `DocumentBlockParam.source` union — see the development note in
    // this feature's plan file for why this cast is necessary rather than a modeling mistake.
    return {
      ...block,
      type: 'document',
      title: session.paper.title,
      citations: { enabled: true },
    } as unknown as ContentBlockParam;
  }

  private firstQuestionTextBlockOf(message: MessageParam): TextBlockParam {
    const content = message.content;
    const blocks = typeof content === 'string' ? [] : content;
    const textBlock = blocks.find(
      (block): block is TextBlockParam => block.type === 'text',
    );
    if (!textBlock) {
      throw new Error(
        "Session's first message is missing its question text block",
      );
    }
    return textBlock;
  }

  private finalizeTurn(
    session: DocumentSession,
    params: AnthropicMessageParams,
    response: AnthropicMessage,
  ): void {
    session.messages = [
      ...params.messages,
      { role: 'assistant', content: toHistoryContent(response.content) },
    ];
  }

  private buildEnvelope(
    session: DocumentSession,
    params: AnthropicMessageParams,
    response: AnthropicMessage,
    calls: TurnCall[],
  ): DocumentResearchAssistantEnvelope {
    const envelope = this.envelopeBuilder.build(params, response);
    return {
      ...envelope,
      ...(calls.length > 0 ? { calls } : {}),
      answer: extractAnswerText(response),
      citations: flattenCitations(response),
      notes: session.notesFileContent,
      cache: this.cachingLayer.readCacheStatus(envelope.usage),
    };
  }

  private toolUseBlocksOf(response: AnthropicMessage): ToolUseBlock[] {
    return response.content.filter(
      (block): block is ToolUseBlock => block.type === 'tool_use',
    );
  }

  /** Reassigns rather than mutates `params` — each earlier `calls` entry must keep the request snapshot it was actually sent with, per architecture.md. */
  private appendToolResults(
    params: AnthropicMessageParams,
    response: AnthropicMessage,
    toolResultBlocks: ToolResultBlockParam[],
  ): AnthropicMessageParams {
    return {
      ...params,
      messages: [
        ...params.messages,
        { role: 'assistant', content: toHistoryContent(response.content) },
        { role: 'user', content: toolResultBlocks },
      ],
    };
  }

  private executeTextEditorTool(
    block: ToolUseBlock,
    session: DocumentSession,
  ): ExecutedTool {
    const input = block.input as {
      command?: string;
      path?: string;
      file_text?: string;
      old_str?: string;
      new_str?: string;
      insert_line?: number;
      insert_text?: string;
    };

    if (input.path !== NOTES_PATH) {
      return this.toolError(
        block,
        `No such file: "${input.path}". This session only has ${NOTES_PATH}.`,
      );
    }

    switch (input.command) {
      case 'create':
        return this.executeCreate(block, session, input.file_text ?? '');
      case 'view':
        return this.executeView(block, session);
      case 'str_replace':
        return this.executeStrReplace(
          block,
          session,
          input.old_str ?? '',
          input.new_str ?? '',
        );
      case 'insert':
        return this.executeInsert(
          block,
          session,
          input.insert_line ?? 0,
          input.insert_text ?? '',
        );
      default:
        return this.toolError(
          block,
          `Unknown text editor command: "${String(input.command)}"`,
        );
    }
  }

  private executeCreate(
    block: ToolUseBlock,
    session: DocumentSession,
    fileText: string,
  ): ExecutedTool {
    session.notesFileContent = fileText;
    return this.toolSuccess(
      block,
      `File created successfully at ${NOTES_PATH}`,
    );
  }

  private executeView(
    block: ToolUseBlock,
    session: DocumentSession,
  ): ExecutedTool {
    if (session.notesFileContent === null) {
      return this.notesFileMissingError(block);
    }
    return this.toolSuccess(block, numberLines(session.notesFileContent));
  }

  private executeStrReplace(
    block: ToolUseBlock,
    session: DocumentSession,
    oldStr: string,
    newStr: string,
  ): ExecutedTool {
    if (session.notesFileContent === null) {
      return this.notesFileMissingError(block);
    }
    const occurrences = countOccurrences(session.notesFileContent, oldStr);
    if (occurrences === 0) {
      return this.toolError(
        block,
        `No match found for old_str in ${NOTES_PATH}. Check the exact text (including whitespace) and try again.`,
      );
    }
    if (occurrences > 1) {
      return this.toolError(
        block,
        `old_str matches ${occurrences} locations in ${NOTES_PATH}; it must match exactly one location. Add more surrounding context to make it unique.`,
      );
    }
    session.notesFileContent = replaceFirst(
      session.notesFileContent,
      oldStr,
      newStr,
    );
    return this.toolSuccess(block, `The file ${NOTES_PATH} has been edited.`);
  }

  private executeInsert(
    block: ToolUseBlock,
    session: DocumentSession,
    insertLine: number,
    insertText: string,
  ): ExecutedTool {
    if (session.notesFileContent === null) {
      return this.notesFileMissingError(block);
    }
    const lines = session.notesFileContent.split('\n');
    const index = Math.max(0, Math.min(insertLine, lines.length));
    lines.splice(index, 0, insertText);
    session.notesFileContent = lines.join('\n');
    return this.toolSuccess(block, `The file ${NOTES_PATH} has been edited.`);
  }

  private notesFileMissingError(block: ToolUseBlock): ExecutedTool {
    return this.toolError(
      block,
      `The file ${NOTES_PATH} does not exist yet. Use \`create\` to create it first.`,
    );
  }

  private toolSuccess(block: ToolUseBlock, message: string): ExecutedTool {
    return {
      toolResultBlock: {
        type: 'tool_result',
        tool_use_id: block.id,
        content: message,
      },
      displayResult: message,
      isError: false,
    };
  }

  private toolError(block: ToolUseBlock, message: string): ExecutedTool {
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

  private buildMessageFromEvents(
    events: AnthropicStreamEvent[],
  ): AnthropicMessage {
    const startEvent = events.find((event) => event.type === 'message_start');
    if (!startEvent || startEvent.type !== 'message_start') {
      throw new Error(
        'Streamed response completed without a message_start event',
      );
    }

    const deltaEvent = events.find((event) => event.type === 'message_delta');

    return {
      ...startEvent.message,
      content: accumulateStreamedContent(events),
      ...(deltaEvent && deltaEvent.type === 'message_delta'
        ? {
            stop_reason: deltaEvent.delta.stop_reason,
            stop_sequence: deltaEvent.delta.stop_sequence,
            usage: {
              ...startEvent.message.usage,
              input_tokens:
                deltaEvent.usage.input_tokens ??
                startEvent.message.usage.input_tokens,
              output_tokens:
                deltaEvent.usage.output_tokens ??
                startEvent.message.usage.output_tokens,
              cache_creation_input_tokens:
                deltaEvent.usage.cache_creation_input_tokens ??
                startEvent.message.usage.cache_creation_input_tokens,
              cache_read_input_tokens:
                deltaEvent.usage.cache_read_input_tokens ??
                startEvent.message.usage.cache_read_input_tokens,
            },
          }
        : {}),
    };
  }
}
