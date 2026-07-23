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
  mockWikimediaImageDownload,
  mockWikimediaSearch,
  mockWikimediaSearchServerError,
  WikimediaFixtureImage,
} from '../src/testing/http-fixtures/wikimedia.fixtures';
import {
  fakeTextMessage,
  fakeTextStreamEvents,
} from '../src/testing/anthropic/message-builders';
import type { VisionLabEnvelope } from '../src/vision-lab/vision-lab.service';

interface ShapedErrorBody {
  error: { message: string; source: string };
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

function buildFixtureImages(
  count: number,
  widths: number[] = [],
): WikimediaFixtureImage[] {
  return Array.from({ length: count }, (_, index) => ({
    title: `File:Volcano ${index + 1}.jpg`,
    url: `https://upload.wikimedia.org/wikipedia/commons/fake/volcano-${index + 1}.jpg`,
    width: widths[index] ?? 1600,
    height: 1200,
    mime: 'image/jpeg',
  }));
}

function mockSearchAndDownloads(images: WikimediaFixtureImage[]): void {
  mockWikimediaSearch(images);
  images.forEach((image, index) => {
    mockWikimediaImageDownload(
      image.url,
      Buffer.from(`fake test image bytes ${index}`),
    );
  });
}

function baseRequestBody(overrides: Record<string, unknown> = {}) {
  return {
    query: 'volcano',
    imageCount: 2,
    instruction: 'Compare these images.',
    deliveryMode: 'base64',
    stream: false,
    ...overrides,
  };
}

describe('VisionLabController (e2e)', () => {
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

  it('POST /vision-lab/run (base64, non-streaming) returns the images used, the answer, and dimensionCapApplied', async () => {
    const images = buildFixtureImages(2, [1600, 1800]);
    mockSearchAndDownloads(images);
    mockAnthropicMessagesCreate(fakeTextMessage('Both show volcanoes.'));

    const response = await request(app.getHttpServer())
      .post('/vision-lab/run')
      .send(baseRequestBody())
      .expect(200);

    const envelope = response.body as VisionLabEnvelope;
    expect(envelope.answer).toBe('Both show volcanoes.');
    expect(envelope.images).toEqual([
      {
        url: images[0].url,
        title: images[0].title,
        widthPx: images[0].width,
        heightPx: images[0].height,
      },
      {
        url: images[1].url,
        title: images[1].title,
        widthPx: images[1].width,
        heightPx: images[1].height,
      },
    ]);
    expect(envelope.dimensionCapApplied).toBe(false);

    const requestMessages = (
      envelope.request as { messages: Array<{ content: unknown }> }
    ).messages;
    const content = requestMessages[0].content as Array<
      Record<string, unknown>
    >;
    expect(content).toHaveLength(3);
    expect(content[0]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg' },
    });
    expect(content[2]).toEqual({
      type: 'text',
      text: 'Compare these images.',
    });
  });

  it('sets dimensionCapApplied true when imageCount > 1 and a fetched image exceeds 2000px', async () => {
    const images = buildFixtureImages(2, [1600, 3000]);
    mockSearchAndDownloads(images);
    mockAnthropicMessagesCreate(fakeTextMessage('One is much larger.'));

    const response = await request(app.getHttpServer())
      .post('/vision-lab/run')
      .send(baseRequestBody())
      .expect(200);

    expect((response.body as VisionLabEnvelope).dimensionCapApplied).toBe(true);
  });

  it('POST /vision-lab/run (files-api, non-streaming) uploads each image and attaches file-backed blocks', async () => {
    const images = buildFixtureImages(2);
    mockSearchAndDownloads(images);
    mockAnthropicFilesUpload('file_a');
    mockAnthropicFilesUpload('file_b');
    mockAnthropicBetaMessagesCreate(fakeTextMessage('Both show volcanoes.'));

    const response = await request(app.getHttpServer())
      .post('/vision-lab/run')
      .send(baseRequestBody({ deliveryMode: 'files-api' }))
      .expect(200);

    const envelope = response.body as VisionLabEnvelope;
    const requestMessages = (
      envelope.request as { messages: Array<{ content: unknown }> }
    ).messages;
    const content = requestMessages[0].content as Array<
      Record<string, unknown>
    >;
    expect(content[0]).toMatchObject({
      type: 'image',
      source: { type: 'file', file_id: 'file_a' },
    });
    expect(content[1]).toMatchObject({
      type: 'image',
      source: { type: 'file', file_id: 'file_b' },
    });
  });

  it('rejects an out-of-range imageCount with a plain 400 before any outbound call', async () => {
    const scope = mockWikimediaSearch(buildFixtureImages(2));

    await request(app.getHttpServer())
      .post('/vision-lab/run')
      .send(baseRequestBody({ imageCount: 5 }))
      .expect(400);

    expect(scope.isDone()).toBe(false);
  });

  it('rejects an empty query with a plain 400 before any outbound call', async () => {
    const scope = mockWikimediaSearch(buildFixtureImages(2));

    await request(app.getHttpServer())
      .post('/vision-lab/run')
      .send(baseRequestBody({ query: '' }))
      .expect(400);

    expect(scope.isDone()).toBe(false);
  });

  it('returns a 502 with the shaped error body when the Wikimedia search call fails', async () => {
    mockWikimediaSearchServerError();

    const response = await request(app.getHttpServer())
      .post('/vision-lab/run')
      .send(baseRequestBody())
      .expect(502);

    expect((response.body as ShapedErrorBody).error.source).toBe('wikimedia');
  });

  it('returns a 502 with the shaped error body when fewer images are found than requested', async () => {
    const images = buildFixtureImages(1);
    mockSearchAndDownloads(images);

    const response = await request(app.getHttpServer())
      .post('/vision-lab/run')
      .send(baseRequestBody({ imageCount: 3 }))
      .expect(502);

    expect((response.body as ShapedErrorBody).error.source).toBe('wikimedia');
  });

  it('returns a 502 with the shaped error body when the Claude API call fails (non-streaming)', async () => {
    const images = buildFixtureImages(2);
    mockSearchAndDownloads(images);
    mockAnthropicMessagesAuthError();

    const response = await request(app.getHttpServer())
      .post('/vision-lab/run')
      .send(baseRequestBody())
      .expect(502);

    expect((response.body as ShapedErrorBody).error.source).toBe('anthropic');
  });

  it('POST /vision-lab/run (streaming) forwards raw events and ends with a turn_complete carrying images/dimensionCapApplied', async () => {
    const images = buildFixtureImages(2, [1600, 3000]);
    mockSearchAndDownloads(images);
    const streamEvents = fakeTextStreamEvents('streamed comparison');
    mockAnthropicMessagesStream(streamEvents);

    const response = await request(app.getHttpServer())
      .post('/vision-lab/run')
      .send(baseRequestBody({ stream: true }))
      .expect(200);

    expect(response.headers['content-type']).toContain('text/event-stream');

    const frames = parseSseFrames(response.text);
    const last = frames[frames.length - 1];
    expect(last.event).toBe('turn_complete');
    const envelope = last.data as VisionLabEnvelope;
    expect(envelope.answer).toBe('streamed comparison');
    expect(envelope.images).toHaveLength(2);
    expect(envelope.dimensionCapApplied).toBe(true);
  });

  it('emits a terminal error frame (no turn_complete) when the Claude API fails mid-stream', async () => {
    const images = buildFixtureImages(2);
    mockSearchAndDownloads(images);
    mockAnthropicMessagesAuthError();

    const response = await request(app.getHttpServer())
      .post('/vision-lab/run')
      .send(baseRequestBody({ stream: true }))
      .expect(200);

    const frames = parseSseFrames(response.text);
    expect(frames).toHaveLength(1);
    expect(frames[0].event).toBe('error');
    const errorBody = frames[0].data as ShapedErrorBody;
    expect(errorBody.error.source).toBe('anthropic');
    expect(frames.some((frame) => frame.event === 'turn_complete')).toBe(false);
  });

  it('emits a terminal error frame (no turn_complete) when fewer images are found than requested', async () => {
    const images = buildFixtureImages(1);
    mockSearchAndDownloads(images);

    const response = await request(app.getHttpServer())
      .post('/vision-lab/run')
      .send(baseRequestBody({ imageCount: 3, stream: true }))
      .expect(200);

    const frames = parseSseFrames(response.text);
    expect(frames).toHaveLength(1);
    expect(frames[0].event).toBe('error');
    const errorBody = frames[0].data as ShapedErrorBody;
    expect(errorBody.error.source).toBe('wikimedia');
  });
});
