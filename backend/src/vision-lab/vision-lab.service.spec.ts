import { Test } from '@nestjs/testing';
import { AnthropicClient } from '../shared/anthropic-client/anthropic-client';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import { ModelTier } from '../shared/model-config/model-config.types';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { StreamResponseBuilderService } from '../shared/stream-response-builder/stream-response-builder.service';
import { ContentBlockBuilderService } from '../shared/content-block-builder/content-block-builder.service';
import { ExternalApiError } from '../shared/api-error-handling';
import { FakeAnthropicClient } from '../testing/anthropic/fake-anthropic-client';
import {
  fakeTextMessage,
  fakeTextStreamEvents,
} from '../testing/anthropic/message-builders';
import { FakeWikimediaClient } from '../testing/wikimedia/fake-wikimedia-client';
import { WikimediaClient, WikimediaImage } from './wikimedia-client';
import { VisionLabService, VisionLabStreamFrame } from './vision-lab.service';
import { RunDto } from './dto/run.dto';

const MODEL_MAP: Record<ModelTier, string> = {
  default: 'claude-sonnet-5',
  classification: 'claude-haiku-4-5',
  'hardest-call': 'claude-opus-4-8',
};

function buildImage(overrides: Partial<WikimediaImage> = {}): WikimediaImage {
  return {
    url: 'https://upload.wikimedia.org/wikipedia/commons/test/Test.jpg',
    title: 'File:Test.jpg',
    mediaType: 'image/jpeg',
    widthPx: 1200,
    heightPx: 900,
    bytes: Buffer.from('test JPEG bytes'),
    ...overrides,
  };
}

function buildRunDto(overrides: Partial<RunDto> = {}): RunDto {
  return {
    query: 'cats',
    imageCount: 2,
    instruction: 'Describe these images.',
    deliveryMode: 'base64',
    stream: false,
    ...overrides,
  };
}

describe('VisionLabService', () => {
  let fakeAnthropic: FakeAnthropicClient;
  let fakeWikimedia: FakeWikimediaClient;
  let service: VisionLabService;

  beforeEach(async () => {
    fakeAnthropic = new FakeAnthropicClient();
    fakeWikimedia = new FakeWikimediaClient();
    const modelConfigStub: Partial<ModelConfigService> = {
      getModel: jest.fn((tier: ModelTier) => MODEL_MAP[tier]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VisionLabService,
        EnvelopeBuilderService,
        StreamResponseBuilderService,
        ContentBlockBuilderService,
        { provide: AnthropicClient, useValue: fakeAnthropic },
        { provide: ModelConfigService, useValue: modelConfigStub },
        { provide: WikimediaClient, useValue: fakeWikimedia },
      ],
    }).compile();

    service = moduleRef.get(VisionLabService);
  });

  describe('run', () => {
    it('builds one base64 image content block per fetched image, ahead of the instruction text', async () => {
      fakeWikimedia.setImages([
        buildImage({ url: 'https://example.com/a.jpg' }),
        buildImage({ url: 'https://example.com/b.jpg' }),
      ]);
      fakeAnthropic.queueMessage(fakeTextMessage('Two images described.'));

      const envelope = await service.run(buildRunDto({ imageCount: 2 }));

      expect(fakeAnthropic.recordedCalls).toHaveLength(1);
      const [{ messages }] = fakeAnthropic.recordedCalls;
      const content = messages[0].content as Array<Record<string, unknown>>;
      expect(content).toHaveLength(3);
      expect(content[0]).toMatchObject({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg' },
      });
      expect(content[1]).toMatchObject({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg' },
      });
      expect(content[2]).toEqual({
        type: 'text',
        text: 'Describe these images.',
      });
      expect(envelope.answer).toBe('Two images described.');
    });

    it('builds file-backed image content blocks in files-api mode, one upload per image', async () => {
      fakeWikimedia.setImages([
        buildImage({ url: 'https://example.com/a.jpg' }),
        buildImage({ url: 'https://example.com/b.jpg' }),
      ]);
      fakeAnthropic.queueFileUpload({ id: 'file_a' });
      fakeAnthropic.queueFileUpload({ id: 'file_b' });
      fakeAnthropic.queueMessage(fakeTextMessage('Two images described.'));

      await service.run(
        buildRunDto({ imageCount: 2, deliveryMode: 'files-api' }),
      );

      const [{ messages }] = fakeAnthropic.recordedCalls;
      const content = messages[0].content as Array<Record<string, unknown>>;
      expect(content[0]).toMatchObject({
        type: 'image',
        source: { type: 'file', file_id: 'file_a' },
      });
      expect(content[1]).toMatchObject({
        type: 'image',
        source: { type: 'file', file_id: 'file_b' },
      });
    });

    it('reports the images actually used and their dimensions', async () => {
      const first = buildImage({
        url: 'https://example.com/a.jpg',
        title: 'File:A.jpg',
      });
      const second = buildImage({
        url: 'https://example.com/b.jpg',
        title: 'File:B.jpg',
      });
      fakeWikimedia.setImages([first, second]);
      fakeAnthropic.queueMessage(fakeTextMessage('described'));

      const envelope = await service.run(buildRunDto({ imageCount: 2 }));

      expect(envelope.images).toEqual([
        {
          url: first.url,
          title: first.title,
          widthPx: first.widthPx,
          heightPx: first.heightPx,
        },
        {
          url: second.url,
          title: second.title,
          widthPx: second.widthPx,
          heightPx: second.heightPx,
        },
      ]);
    });

    it('throws ExternalApiError("wikimedia", ...) when fewer images are found than requested', async () => {
      fakeWikimedia.setImages([buildImage()]);

      await expect(
        service.run(buildRunDto({ query: 'rare thing', imageCount: 3 })),
      ).rejects.toMatchObject({
        source: 'wikimedia',
        message: expect.stringContaining('rare thing') as unknown,
      });
      await expect(
        service.run(buildRunDto({ imageCount: 3 })),
      ).rejects.toBeInstanceOf(ExternalApiError);
    });

    describe('dimensionCapApplied', () => {
      it('is true when imageCount > 1 and a fetched image exceeds 2000px', async () => {
        fakeWikimedia.setImages([
          buildImage({ widthPx: 1200, heightPx: 900 }),
          buildImage({ widthPx: 3000, heightPx: 1800 }),
        ]);
        fakeAnthropic.queueMessage(fakeTextMessage('described'));

        const envelope = await service.run(buildRunDto({ imageCount: 2 }));

        expect(envelope.dimensionCapApplied).toBe(true);
      });

      it('is false when imageCount === 1, even for an oversized image', async () => {
        fakeWikimedia.setImages([
          buildImage({ widthPx: 3000, heightPx: 1800 }),
        ]);
        fakeAnthropic.queueMessage(fakeTextMessage('described'));

        const envelope = await service.run(buildRunDto({ imageCount: 1 }));

        expect(envelope.dimensionCapApplied).toBe(false);
      });

      it('is false when imageCount > 1 and every image is at or under 2000px', async () => {
        fakeWikimedia.setImages([
          buildImage({ widthPx: 1200, heightPx: 900 }),
          buildImage({ widthPx: 2000, heightPx: 2000 }),
        ]);
        fakeAnthropic.queueMessage(fakeTextMessage('described'));

        const envelope = await service.run(buildRunDto({ imageCount: 2 }));

        expect(envelope.dimensionCapApplied).toBe(false);
      });
    });
  });

  describe('streamRun', () => {
    it('yields a turn-complete frame carrying images and dimensionCapApplied', async () => {
      fakeWikimedia.setImages([
        buildImage({ widthPx: 1200, heightPx: 900 }),
        buildImage({ widthPx: 3000, heightPx: 1800 }),
      ]);
      fakeAnthropic.queueStream(fakeTextStreamEvents('streamed description'));

      const frames: VisionLabStreamFrame[] = [];
      for await (const frame of service.streamRun(
        buildRunDto({ imageCount: 2, stream: true }),
      )) {
        frames.push(frame);
      }

      const turnComplete = frames.find(
        (frame) => frame.kind === 'turn-complete',
      );
      if (turnComplete?.kind !== 'turn-complete') {
        throw new Error('expected a turn-complete frame');
      }
      expect(turnComplete.envelope.answer).toBe('streamed description');
      expect(turnComplete.envelope.images).toHaveLength(2);
      expect(turnComplete.envelope.dimensionCapApplied).toBe(true);
    });

    it('yields a terminal error frame (no turn-complete) when fewer images are found than requested', async () => {
      fakeWikimedia.setImages([buildImage()]);

      const frames: VisionLabStreamFrame[] = [];
      for await (const frame of service.streamRun(
        buildRunDto({ imageCount: 3, stream: true }),
      )) {
        frames.push(frame);
      }

      expect(frames).toHaveLength(1);
      expect(frames[0].kind).toBe('error');
      if (frames[0].kind !== 'error') {
        throw new Error('expected an error frame');
      }
      expect(frames[0].shaped.body.error.source).toBe('wikimedia');
      expect(frames.some((frame) => frame.kind === 'turn-complete')).toBe(
        false,
      );
    });
  });
});
