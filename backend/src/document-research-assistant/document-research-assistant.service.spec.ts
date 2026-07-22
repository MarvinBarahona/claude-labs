import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  AnthropicClient,
  AnthropicStreamEvent,
} from '../shared/anthropic-client/anthropic-client';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import { ModelTier } from '../shared/model-config/model-config.types';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { StreamResponseBuilderService } from '../shared/stream-response-builder/stream-response-builder.service';
import { ContentBlockBuilderService } from '../shared/content-block-builder/content-block-builder.service';
import { CachingLayerService } from '../shared/caching-layer/caching-layer.service';
import { FakeAnthropicClient } from '../testing/anthropic/fake-anthropic-client';
import {
  fakeTextMessage,
  fakeToolUseMessage,
} from '../testing/anthropic/message-builders';
import { ArxivClient, ArxivPaper } from './arxiv-client';
import { FakeArxivClient } from '../testing/arxiv/fake-arxiv-client';
import {
  DocumentResearchAssistantService,
  DocumentResearchAssistantStreamFrame,
} from './document-research-assistant.service';
import { AskDto } from './dto/ask.dto';

const MODEL_MAP: Record<ModelTier, string> = {
  default: 'claude-sonnet-5',
  classification: 'claude-haiku-4-5',
  'hardest-call': 'claude-opus-4-8',
};

const TEST_PAPER: ArxivPaper = {
  arxivId: '2301.00234',
  title: 'A Test Paper About Nothing in Particular',
  authors: ['Ada Lovelace'],
  summary: 'This paper is about nothing in particular.',
  pdfUrl: 'https://arxiv.org/pdf/2301.00234',
  pdfBytes: Buffer.from('%PDF-1.4 test bytes'),
};

function buildAskDto(overrides: Partial<AskDto> = {}): AskDto {
  return {
    question: 'What is this paper about?',
    deliveryMode: 'base64',
    stream: false,
    ...overrides,
  };
}

describe('DocumentResearchAssistantService', () => {
  let fakeAnthropic: FakeAnthropicClient;
  let fakeArxiv: FakeArxivClient;
  let service: DocumentResearchAssistantService;

  beforeEach(async () => {
    fakeAnthropic = new FakeAnthropicClient();
    fakeArxiv = new FakeArxivClient().setPaper(TEST_PAPER);
    const modelConfigStub: Partial<ModelConfigService> = {
      getModel: jest.fn((tier: ModelTier) => MODEL_MAP[tier]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DocumentResearchAssistantService,
        EnvelopeBuilderService,
        StreamResponseBuilderService,
        ContentBlockBuilderService,
        CachingLayerService,
        { provide: AnthropicClient, useValue: fakeAnthropic },
        { provide: ModelConfigService, useValue: modelConfigStub },
        { provide: ArxivClient, useValue: fakeArxiv },
      ],
    }).compile();

    service = moduleRef.get(DocumentResearchAssistantService);
  });

  describe('createSession', () => {
    it('fetches metadata+PDF bytes via the fake ArxivClient and creates a session with empty notes/history', async () => {
      const result = await service.createSession({ arxivId: '2301.00234' });

      expect(result.paper).toEqual({
        arxivId: TEST_PAPER.arxivId,
        title: TEST_PAPER.title,
        authors: TEST_PAPER.authors,
        summary: TEST_PAPER.summary,
        pdfUrl: TEST_PAPER.pdfUrl,
      });
      expect(result.sessionId).toEqual(expect.any(String));

      // Nothing attached yet — the first `ask` is what actually attaches the document.
      expect(fakeAnthropic.recordedCalls).toHaveLength(0);
    });
  });

  describe('ask', () => {
    it('throws NotFoundException for an unknown sessionId', async () => {
      await expect(
        service.ask('unknown-session', buildAskDto()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('the first ask attaches the document (title + citations enabled) ahead of the question, and marks the messages[0] cache boundary', async () => {
      const { sessionId } = await service.createSession({
        arxivId: '2301.00234',
      });
      fakeAnthropic.queueMessage(
        fakeTextMessage('This paper is about nothing.'),
      );

      const envelope = await service.ask(sessionId, buildAskDto());

      expect(fakeAnthropic.recordedCalls).toHaveLength(1);
      const [{ messages }] = fakeAnthropic.recordedCalls;
      expect(messages).toHaveLength(1);
      const content = messages[0].content as Array<Record<string, unknown>>;
      expect(content[0]).toMatchObject({
        type: 'document',
        title: TEST_PAPER.title,
        citations: { enabled: true },
      });
      // markBreakpoints caches through messages[0]'s last block — the question text — which caches the document ahead of it too, per caching-layer.md.
      expect(content[1]).toEqual({
        type: 'text',
        text: 'What is this paper about?',
        cache_control: { type: 'ephemeral' },
      });
      expect(envelope.answer).toBe('This paper is about nothing.');
      expect(envelope).not.toHaveProperty('calls');
    });

    it('sends a system prompt telling Claude the notes tool and /notes.md exist, since the tool itself has no description field', async () => {
      const { sessionId } = await service.createSession({
        arxivId: '2301.00234',
      });
      fakeAnthropic.queueMessage(fakeTextMessage('unused'));

      await service.ask(sessionId, buildAskDto());

      const [{ system }] = fakeAnthropic.recordedCalls;
      expect(system).toEqual(expect.stringContaining('/notes.md'));
    });

    it('a second ask requesting files-api mode again reuses the cached fileId rather than uploading a second time', async () => {
      const { sessionId } = await service.createSession({
        arxivId: '2301.00234',
      });
      fakeAnthropic.queueFileUpload({ id: 'file_abc123' });
      fakeAnthropic.queueMessage(fakeTextMessage('First answer.'));
      fakeAnthropic.queueMessage(fakeTextMessage('Second answer.'));

      // Only one file upload was queued — a re-upload would make uploadFile() reject and this second ask throw.
      await service.ask(
        sessionId,
        buildAskDto({ question: 'First question?', deliveryMode: 'files-api' }),
      );
      await service.ask(
        sessionId,
        buildAskDto({
          question: 'Second question?',
          deliveryMode: 'files-api',
        }),
      );

      const secondCallMessages = fakeAnthropic.recordedCalls[1].messages;
      const secondCallDocumentBlock = (
        secondCallMessages[0].content as Array<Record<string, unknown>>
      )[0];
      expect(secondCallDocumentBlock['source']).toEqual({
        type: 'file',
        file_id: 'file_abc123',
      });
    });

    it('a later ask appends only the new question, leaving the original first question and document in messages[0]', async () => {
      const { sessionId } = await service.createSession({
        arxivId: '2301.00234',
      });
      fakeAnthropic.queueFileUpload({ id: 'file_abc123' });
      fakeAnthropic.queueMessage(fakeTextMessage('First answer.'));
      fakeAnthropic.queueMessage(fakeTextMessage('Second answer.'));

      await service.ask(
        sessionId,
        buildAskDto({ question: 'First question?', deliveryMode: 'files-api' }),
      );
      await service.ask(
        sessionId,
        buildAskDto({
          question: 'Second question?',
          deliveryMode: 'files-api',
        }),
      );

      const secondCallMessages = fakeAnthropic.recordedCalls[1].messages;
      // [rebuilt messages[0] (doc+first question), first turn's reply, new question] — the document only ever lives inside messages[0].
      expect(secondCallMessages).toHaveLength(3);
      expect(
        (secondCallMessages[0].content as Array<Record<string, unknown>>)[1],
      ).toMatchObject({
        type: 'text',
        text: 'First question?',
      });
      expect(secondCallMessages[2]).toEqual({
        role: 'user',
        content: 'Second question?',
      });
    });

    it('strips citation metadata (keeping the cited text) from a prior turn once it is replayed as history', async () => {
      const { sessionId } = await service.createSession({
        arxivId: '2301.00234',
      });
      fakeAnthropic.queueMessage(
        fakeTextMessage('unused', {
          content: [
            {
              type: 'text',
              text: 'It found something.',
              citations: [
                {
                  type: 'page_location',
                  cited_text: 'something was found',
                  document_index: 0,
                  document_title: TEST_PAPER.title,
                  start_page_number: 1,
                  end_page_number: 1,
                  // A resent citation ties to the document state it was generated against — the real API 400s once that's stale, e.g. after a delivery-mode switch.
                  file_id: 'file_abc123',
                },
              ],
            },
          ],
        }),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('Second answer.'));

      await service.ask(
        sessionId,
        buildAskDto({ question: 'First question?' }),
      );
      await service.ask(
        sessionId,
        buildAskDto({ question: 'Second question?' }),
      );

      const secondCallMessages = fakeAnthropic.recordedCalls[1].messages;
      const historyAssistantMessage = secondCallMessages[1] as {
        role: string;
        content: Array<{ text: string; citations?: unknown }>;
      };
      expect(historyAssistantMessage.role).toBe('assistant');
      expect(historyAssistantMessage.content[0].text).toBe(
        'It found something.',
      );
      expect(historyAssistantMessage.content[0]).not.toHaveProperty(
        'citations',
      );
    });

    it('resolves a tool loop with more than one call: calls holds every earlier pair, in order', async () => {
      const { sessionId } = await service.createSession({
        arxivId: '2301.00234',
      });
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          {
            id: 'call_1',
            name: 'str_replace_based_edit_tool',
            input: {
              command: 'create',
              path: '/notes.md',
              file_text: 'Key point: nothing.',
            },
          },
        ]),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('Noted.'));

      const envelope = await service.ask(sessionId, buildAskDto());

      expect(fakeAnthropic.recordedCalls).toHaveLength(2);
      expect(envelope.calls).toHaveLength(1);
      expect(envelope.notes).toBe('Key point: nothing.');
    });

    it('flattens page_location citations from the final response, in order', async () => {
      const { sessionId } = await service.createSession({
        arxivId: '2301.00234',
      });
      fakeAnthropic.queueMessage(
        fakeTextMessage('unused', {
          content: [
            {
              type: 'text',
              text: 'It found nothing interesting.',
              citations: [
                {
                  type: 'page_location',
                  cited_text: 'nothing interesting was found',
                  document_index: 0,
                  document_title: TEST_PAPER.title,
                  start_page_number: 2,
                  end_page_number: 3,
                  file_id: null,
                },
              ],
            },
          ],
        }),
      );

      const envelope = await service.ask(sessionId, buildAskDto());

      expect(envelope.citations).toEqual([
        {
          citedText: 'nothing interesting was found',
          documentTitle: TEST_PAPER.title,
          startPage: 2,
          endPage: 3,
        },
      ]);
    });
  });

  describe('the text-editor tool loop against /notes.md', () => {
    async function askWithTool(
      sessionId: string,
      toolInput: Record<string, unknown>,
    ): Promise<{ toolResultContent: unknown; isError: boolean }> {
      fakeAnthropic.queueMessage(
        fakeToolUseMessage([
          {
            id: 'call_1',
            name: 'str_replace_based_edit_tool',
            input: toolInput,
          },
        ]),
      );
      fakeAnthropic.queueMessage(fakeTextMessage('done'));
      await service.ask(sessionId, buildAskDto());

      const secondCallMessages =
        fakeAnthropic.recordedCalls[fakeAnthropic.recordedCalls.length - 1]
          .messages;
      const toolResultMessage = secondCallMessages[
        secondCallMessages.length - 1
      ] as {
        content: Array<{ content: unknown; is_error?: boolean }>;
      };
      return {
        toolResultContent: toolResultMessage.content[0].content,
        isError: Boolean(toolResultMessage.content[0].is_error),
      };
    }

    it('create initializes notesFileContent', async () => {
      const { sessionId } = await service.createSession({
        arxivId: '2301.00234',
      });
      const { isError } = await askWithTool(sessionId, {
        command: 'create',
        path: '/notes.md',
        file_text: 'line one\nline two',
      });
      expect(isError).toBe(false);
    });

    it('view returns line-numbered content', async () => {
      const { sessionId } = await service.createSession({
        arxivId: '2301.00234',
      });
      await askWithTool(sessionId, {
        command: 'create',
        path: '/notes.md',
        file_text: 'line one\nline two',
      });
      const { toolResultContent, isError } = await askWithTool(sessionId, {
        command: 'view',
        path: '/notes.md',
      });
      expect(isError).toBe(false);
      expect(toolResultContent).toBe('1\tline one\n2\tline two');
    });

    it('a unique str_replace updates the content', async () => {
      const { sessionId } = await service.createSession({
        arxivId: '2301.00234',
      });
      await askWithTool(sessionId, {
        command: 'create',
        path: '/notes.md',
        file_text: 'the cat sat',
      });
      const { isError } = await askWithTool(sessionId, {
        command: 'str_replace',
        path: '/notes.md',
        old_str: 'cat',
        new_str: 'dog',
      });
      expect(isError).toBe(false);
      const { toolResultContent } = await askWithTool(sessionId, {
        command: 'view',
        path: '/notes.md',
      });
      expect(toolResultContent).toBe('1\tthe dog sat');
    });

    it('a 0-match str_replace returns is_error true with a clear message', async () => {
      const { sessionId } = await service.createSession({
        arxivId: '2301.00234',
      });
      await askWithTool(sessionId, {
        command: 'create',
        path: '/notes.md',
        file_text: 'the cat sat',
      });
      const { isError, toolResultContent } = await askWithTool(sessionId, {
        command: 'str_replace',
        path: '/notes.md',
        old_str: 'giraffe',
        new_str: 'dog',
      });
      expect(isError).toBe(true);
      expect(toolResultContent).toContain('No match found');
    });

    it('a 2+-match str_replace returns is_error true with a clear message', async () => {
      const { sessionId } = await service.createSession({
        arxivId: '2301.00234',
      });
      await askWithTool(sessionId, {
        command: 'create',
        path: '/notes.md',
        file_text: 'cat cat',
      });
      const { isError, toolResultContent } = await askWithTool(sessionId, {
        command: 'str_replace',
        path: '/notes.md',
        old_str: 'cat',
        new_str: 'dog',
      });
      expect(isError).toBe(true);
      expect(toolResultContent).toContain('2 locations');
    });

    it('a command against a path other than /notes.md returns is_error true', async () => {
      const { sessionId } = await service.createSession({
        arxivId: '2301.00234',
      });
      const { isError, toolResultContent } = await askWithTool(sessionId, {
        command: 'view',
        path: '/other.md',
      });
      expect(isError).toBe(true);
      expect(toolResultContent).toContain('No such file');
    });
  });

  describe('streamAsk', () => {
    it('reconstructs a streamed thinking block with its thinking/signature intact, so it resends validly as history on the next ask', async () => {
      const { sessionId } = await service.createSession({
        arxivId: '2301.00234',
      });

      const firstCallEvents: AnthropicStreamEvent[] = [
        {
          type: 'message_start',
          message: fakeTextMessage('', { content: [], stop_reason: null }),
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'thinking_delta',
            thinking: 'Considering the question...',
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'signature_delta', signature: 'sig-abc' },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'text', text: '', citations: null },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'text_delta', text: 'This paper is about nothing.' },
        },
        { type: 'content_block_stop', index: 1 },
        {
          type: 'message_delta',
          delta: {
            container: null,
            stop_details: null,
            stop_reason: 'end_turn',
            stop_sequence: null,
          },
          usage: {
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            input_tokens: 10,
            output_tokens: 10,
            output_tokens_details: null,
            server_tool_use: null,
          },
        },
        { type: 'message_stop' },
      ];
      fakeAnthropic.queueStream(firstCallEvents);
      fakeAnthropic.queueMessage(fakeTextMessage('Second answer.'));

      const frames: DocumentResearchAssistantStreamFrame[] = [];
      for await (const frame of service.streamAsk(
        sessionId,
        buildAskDto({ question: 'First question?', stream: true }),
      )) {
        frames.push(frame);
      }
      const turnComplete = frames.find(
        (frame) => frame.kind === 'turn-complete',
      );
      if (turnComplete?.kind !== 'turn-complete') {
        throw new Error('expected a turn-complete frame');
      }
      expect(turnComplete.envelope.answer).toBe('This paper is about nothing.');

      await service.ask(
        sessionId,
        buildAskDto({ question: 'Second question?' }),
      );

      const secondAskMessages = fakeAnthropic.recordedCalls[1].messages;
      const historyAssistantMessage = secondAskMessages[1] as {
        content: Array<{ type: string; thinking?: string; signature?: string }>;
      };
      const thinkingBlock = historyAssistantMessage.content.find(
        (block) => block.type === 'thinking',
      );
      expect(thinkingBlock?.thinking).toBe('Considering the question...');
      expect(thinkingBlock?.signature).toBe('sig-abc');
    });

    it('accumulates a citations_delta event into the reconstructed text block, flattened the same as a non-streamed response', async () => {
      const { sessionId } = await service.createSession({
        arxivId: '2301.00234',
      });

      fakeAnthropic.queueStream([
        {
          type: 'message_start',
          message: fakeTextMessage('', { content: [], stop_reason: null }),
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '', citations: null },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: 'It found nothing interesting.',
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'citations_delta',
            citation: {
              type: 'page_location',
              cited_text: 'nothing interesting was found',
              document_index: 0,
              document_title: TEST_PAPER.title,
              start_page_number: 2,
              end_page_number: 3,
              file_id: null,
            },
          },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'message_delta',
          delta: {
            container: null,
            stop_details: null,
            stop_reason: 'end_turn',
            stop_sequence: null,
          },
          usage: {
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            input_tokens: 10,
            output_tokens: 10,
            output_tokens_details: null,
            server_tool_use: null,
          },
        },
        { type: 'message_stop' },
      ]);

      const frames: DocumentResearchAssistantStreamFrame[] = [];
      for await (const frame of service.streamAsk(
        sessionId,
        buildAskDto({ stream: true }),
      )) {
        frames.push(frame);
      }
      const turnComplete = frames.find(
        (frame) => frame.kind === 'turn-complete',
      );
      if (turnComplete?.kind !== 'turn-complete') {
        throw new Error('expected a turn-complete frame');
      }

      expect(turnComplete.envelope.citations).toEqual([
        {
          citedText: 'nothing interesting was found',
          documentTitle: TEST_PAPER.title,
          startPage: 2,
          endPage: 3,
        },
      ]);
    });
  });
});
