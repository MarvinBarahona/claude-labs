import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { useNockFixtures } from '../src/testing/http-fixtures/nock-lifecycle';
import {
  mockAnthropicBetaMessagesCreate,
  mockAnthropicFilesUpload,
  mockAnthropicMessagesAuthError,
  mockAnthropicMessagesCreate,
  mockAnthropicMessagesStream,
} from '../src/testing/http-fixtures/anthropic.fixtures';
import {
  buildArxivAtomXml,
  mockArxivPdf,
  mockArxivQuery,
  mockArxivQueryServerError,
} from '../src/testing/http-fixtures/arxiv.fixtures';
import {
  fakeTextMessage,
  fakeTextStreamEvents,
  fakeToolUseStreamEvents,
} from '../src/testing/anthropic/message-builders';
import type { DocumentResearchAssistantEnvelope } from '../src/document-research-assistant/document-research-assistant.service';

interface ShapedErrorBody {
  error: { message: string; source: string };
}

interface SessionResponseBody {
  sessionId: string;
  paper: {
    arxivId: string;
    title: string;
    authors: string[];
    summary: string;
    pdfUrl: string;
  };
}

/** Parses a raw SSE response body into `{ event, data }` frames, in order. */
function parseSseFrames(body: string): { event: string; data: unknown }[] {
  return body
    .split('\n\n')
    .filter((chunk) => chunk.trim().length > 0)
    .map((chunk) => {
      const eventLine = chunk
        .split('\n')
        .find((line) => line.startsWith('event: '));
      const dataLine = chunk
        .split('\n')
        .find((line) => line.startsWith('data: '));
      const data: unknown = dataLine
        ? (JSON.parse(dataLine.slice('data: '.length)) as unknown)
        : null;
      return { event: eventLine?.slice('event: '.length) ?? '', data };
    });
}

const ARXIV_ID = '2301.00234';
const PDF_URL = 'https://arxiv.org/pdf/2301.00234v1';

function mockPaperFixtures(): void {
  mockArxivQuery(
    ARXIV_ID,
    buildArxivAtomXml({
      title: 'A Test Paper About Nothing in Particular',
      summary: 'This paper is about nothing in particular.',
      authors: ['Ada Lovelace'],
      pdfUrl: PDF_URL,
    }),
  );
  mockArxivPdf(PDF_URL, Buffer.from('%PDF-1.4 fake test bytes'));
}

describe('DocumentResearchAssistantController (e2e)', () => {
  let app: INestApplication<App>;

  useNockFixtures();

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function createSession(): Promise<string> {
    mockPaperFixtures();
    const response = await request(app.getHttpServer())
      .post('/document-research-assistant/session')
      .send({ arxivId: ARXIV_ID })
      .expect(200);
    return (response.body as SessionResponseBody).sessionId;
  }

  it('POST /session fetches the real paper metadata+PDF via the (nock-mocked) arXiv API', async () => {
    mockPaperFixtures();

    const response = await request(app.getHttpServer())
      .post('/document-research-assistant/session')
      .send({ arxivId: ARXIV_ID })
      .expect(200);

    const body = response.body as SessionResponseBody;
    expect(body.sessionId).toEqual(expect.any(String));
    expect(body.paper).toEqual({
      arxivId: ARXIV_ID,
      title: 'A Test Paper About Nothing in Particular',
      authors: ['Ada Lovelace'],
      summary: 'This paper is about nothing in particular.',
      pdfUrl: PDF_URL,
    });
  });

  it('normalizes a full arxiv.org URL into a bare ID', async () => {
    mockPaperFixtures();

    const response = await request(app.getHttpServer())
      .post('/document-research-assistant/session')
      .send({ arxivId: `https://arxiv.org/abs/${ARXIV_ID}` })
      .expect(200);

    expect((response.body as SessionResponseBody).paper.arxivId).toBe(ARXIV_ID);
  });

  it('rejects an empty arxivId with a plain 400 before any outbound call', async () => {
    await request(app.getHttpServer())
      .post('/document-research-assistant/session')
      .send({ arxivId: '' })
      .expect(400);
  });

  it('returns a 502 with the shaped error body when the arXiv API fails', async () => {
    mockArxivQueryServerError(ARXIV_ID);

    const response = await request(app.getHttpServer())
      .post('/document-research-assistant/session')
      .send({ arxivId: ARXIV_ID })
      .expect(502);

    expect((response.body as ShapedErrorBody).error.source).toBe('arxiv');
  });

  it('returns a plain 404 for an ask against an unknown sessionId (non-streaming)', async () => {
    await request(app.getHttpServer())
      .post('/document-research-assistant/session/does-not-exist/ask')
      .send({ question: 'Hi', deliveryMode: 'base64', stream: false })
      .expect(404);
  });

  it('returns a plain 404 for an ask against an unknown sessionId (streaming)', async () => {
    await request(app.getHttpServer())
      .post('/document-research-assistant/session/does-not-exist/ask')
      .send({ question: 'Hi', deliveryMode: 'base64', stream: true })
      .expect(404);
  });

  it('rejects an empty question with a plain 400 before any outbound call', async () => {
    const sessionId = await createSession();

    await request(app.getHttpServer())
      .post(`/document-research-assistant/session/${sessionId}/ask`)
      .send({ question: '', deliveryMode: 'base64', stream: false })
      .expect(400);
  });

  it('first ask (files-api, non-streaming): uploads once, attaches the document with citations enabled, marks the cache boundary; a follow-up ask reuses the fileId and reports a cache read', async () => {
    const sessionId = await createSession();

    mockAnthropicFilesUpload('file_abc123');
    mockAnthropicBetaMessagesCreate(
      fakeTextMessage('This paper is about nothing in particular.'),
    );

    const firstResponse = await request(app.getHttpServer())
      .post(`/document-research-assistant/session/${sessionId}/ask`)
      .send({
        question: 'What is this paper about?',
        deliveryMode: 'files-api',
        stream: false,
      })
      .expect(200);

    const firstEnvelope =
      firstResponse.body as DocumentResearchAssistantEnvelope;
    expect(firstEnvelope.answer).toBe(
      'This paper is about nothing in particular.',
    );
    expect(firstEnvelope.cache).toEqual({ read: false, write: false });
    const firstRequestMessages = (
      firstEnvelope.request as { messages: Array<{ content: unknown }> }
    ).messages;
    const firstDocumentBlock = (
      firstRequestMessages[0].content as Array<Record<string, unknown>>
    )[0];
    expect(firstDocumentBlock).toMatchObject({
      type: 'document',
      source: { type: 'file', file_id: 'file_abc123' },
      title: 'A Test Paper About Nothing in Particular',
      citations: { enabled: true },
    });

    // No second mockAnthropicFilesUpload is registered — if the code re-uploaded instead of
    // reusing the cached fileId, this second call would hit an un-mocked host and fail outright.
    mockAnthropicBetaMessagesCreate(
      fakeTextMessage('Follow-up answer.', {
        usage: {
          input_tokens: 5,
          output_tokens: 5,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: 1200,
          cache_creation: null,
          inference_geo: null,
          output_tokens_details: null,
          server_tool_use: null,
          service_tier: 'standard',
        },
      }),
    );

    const secondResponse = await request(app.getHttpServer())
      .post(`/document-research-assistant/session/${sessionId}/ask`)
      .send({
        question: 'Anything else?',
        deliveryMode: 'files-api',
        stream: false,
      })
      .expect(200);

    const secondEnvelope =
      secondResponse.body as DocumentResearchAssistantEnvelope;
    expect(secondEnvelope.cache.read).toBe(true);
    const secondRequestMessages = (
      secondEnvelope.request as { messages: Array<{ content: unknown }> }
    ).messages;
    const secondDocumentBlock = (
      secondRequestMessages[0].content as Array<Record<string, unknown>>
    )[0];
    expect(secondDocumentBlock).toMatchObject({
      source: { type: 'file', file_id: 'file_abc123' },
    });
  });

  it('returns a 502 with the shaped error body when the Claude API call fails (base64, non-streaming)', async () => {
    const sessionId = await createSession();
    mockAnthropicMessagesAuthError();

    const response = await request(app.getHttpServer())
      .post(`/document-research-assistant/session/${sessionId}/ask`)
      .send({
        question: 'What is this about?',
        deliveryMode: 'base64',
        stream: false,
      })
      .expect(502);

    expect((response.body as ShapedErrorBody).error.source).toBe('anthropic');
  });

  it('an ask (base64, streaming) that edits notes forwards tool_call frames and a turn_complete carrying the updated notes', async () => {
    const sessionId = await createSession();

    mockAnthropicMessagesStream(
      fakeToolUseStreamEvents([
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
    mockAnthropicMessagesStream(fakeTextStreamEvents('Noted it down.'));

    const response = await request(app.getHttpServer())
      .post(`/document-research-assistant/session/${sessionId}/ask`)
      .send({
        question: 'Note the key point.',
        deliveryMode: 'base64',
        stream: true,
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/event-stream');
    const frames = parseSseFrames(response.text);
    const events = frames.map((frame) => frame.event);

    const startIndex = events.indexOf('tool_call_start');
    const resultIndex = events.indexOf('tool_call_result');
    const completeIndex = events.indexOf('turn_complete');
    expect(startIndex).toBeGreaterThan(-1);
    expect(resultIndex).toBeGreaterThan(startIndex);
    expect(completeIndex).toBe(events.length - 1);

    const startFrame = frames[startIndex].data as { name: string };
    expect(startFrame.name).toBe('str_replace_based_edit_tool');

    const finalEnvelope = frames[completeIndex]
      .data as DocumentResearchAssistantEnvelope;
    expect(finalEnvelope.notes).toBe('Key point: nothing.');
    expect(finalEnvelope.answer).toBe('Noted it down.');
    expect(finalEnvelope.calls).toHaveLength(1);
  });

  it('emits a mid-stream error frame (no turn_complete) when the Claude API call fails', async () => {
    const sessionId = await createSession();
    mockAnthropicMessagesAuthError();

    const response = await request(app.getHttpServer())
      .post(`/document-research-assistant/session/${sessionId}/ask`)
      .send({
        question: 'What is this about?',
        deliveryMode: 'base64',
        stream: true,
      })
      .expect(200);

    const frames = parseSseFrames(response.text);
    const last = frames[frames.length - 1];
    expect(last.event).toBe('error');
    expect((last.data as ShapedErrorBody).error.source).toBe('anthropic');
    expect(frames.some((frame) => frame.event === 'turn_complete')).toBe(false);
  });

  it('flattens page_location citations from the final response', async () => {
    const sessionId = await createSession();
    mockAnthropicMessagesCreate(
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
                document_title: 'A Test Paper About Nothing in Particular',
                start_page_number: 2,
                end_page_number: 3,
                file_id: null,
              },
            ],
          },
        ],
      }),
    );

    const response = await request(app.getHttpServer())
      .post(`/document-research-assistant/session/${sessionId}/ask`)
      .send({
        question: 'What did it find?',
        deliveryMode: 'base64',
        stream: false,
      })
      .expect(200);

    const envelope = response.body as DocumentResearchAssistantEnvelope;
    expect(envelope.citations).toEqual([
      {
        citedText: 'nothing interesting was found',
        documentTitle: 'A Test Paper About Nothing in Particular',
        startPage: 2,
        endPage: 3,
      },
    ]);
  });
});
