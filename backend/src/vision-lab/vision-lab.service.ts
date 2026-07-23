import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import {
  AnthropicClient,
  AnthropicMessage,
  AnthropicMessageParams,
  AnthropicStreamEvent,
} from '../shared/anthropic-client/anthropic-client';
import {
  ExternalApiError,
  shapeError,
  ShapedError,
} from '../shared/api-error-handling';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { TurnEnvelope } from '../shared/envelope-builder/envelope-builder.types';
import { StreamResponseBuilderService } from '../shared/stream-response-builder/stream-response-builder.service';
import { ContentBlockBuilderService } from '../shared/content-block-builder/content-block-builder.service';
import { WikimediaClient, WikimediaImage } from './wikimedia-client';
import { RunDto } from './dto/run.dto';

const DEFAULT_MAX_TOKENS = 4096;
/** The dimension the Messages API caps the longer side of an image down to once a 2nd image is attached to the same request. */
const DIMENSION_CAP_THRESHOLD_PX = 2000;
/** Needed on the Messages call itself (not just the upload) whenever a request references an uploaded `file_id`. */
const FILES_API_BETA = 'files-api-2025-04-14';

type MessageContentBlock = AnthropicMessage['content'][number];
type ContentBlockParam = Anthropic.Messages.ContentBlockParam;

export interface VisionLabImage {
  url: string;
  title: string;
  widthPx: number;
  heightPx: number;
}

export type VisionLabEnvelope = TurnEnvelope & {
  images: VisionLabImage[];
  answer: string;
  dimensionCapApplied: boolean;
};

export type VisionLabStreamFrame =
  | { kind: 'stream-event'; event: AnthropicStreamEvent }
  | { kind: 'turn-complete'; envelope: VisionLabEnvelope }
  | { kind: 'error'; shaped: ShapedError };

function extractAnswerText(response: AnthropicMessage): string {
  return response.content
    .filter(
      (block): block is Extract<MessageContentBlock, { type: 'text' }> =>
        block.type === 'text',
    )
    .map((block) => block.text)
    .join('');
}

@Injectable()
export class VisionLabService {
  constructor(
    private readonly anthropicClient: AnthropicClient,
    private readonly modelConfig: ModelConfigService,
    private readonly envelopeBuilder: EnvelopeBuilderService,
    private readonly streamResponseBuilder: StreamResponseBuilderService,
    private readonly contentBlockBuilder: ContentBlockBuilderService,
    private readonly wikimediaClient: WikimediaClient,
  ) {}

  async run(dto: RunDto): Promise<VisionLabEnvelope> {
    const images = await this.fetchImages(dto);
    const params = await this.buildParams(dto, images);
    const response = await this.anthropicClient.createMessage(
      params,
      this.betasFor(dto),
    );
    return this.buildEnvelope(dto, images, params, response);
  }

  async *streamRun(dto: RunDto): AsyncGenerator<VisionLabStreamFrame> {
    try {
      const images = await this.fetchImages(dto);
      const params = await this.buildParams(dto, images);
      const events: AnthropicStreamEvent[] = [];
      for await (const event of this.anthropicClient.streamMessage(
        params,
        this.betasFor(dto),
      )) {
        events.push(event);
        yield { kind: 'stream-event', event };
      }
      const response = this.streamResponseBuilder.reconstructMessage(events);
      yield {
        kind: 'turn-complete',
        envelope: this.buildEnvelope(dto, images, params, response),
      };
    } catch (exception) {
      yield { kind: 'error', shaped: shapeError(exception) };
    }
  }

  private betasFor(dto: RunDto): string[] | undefined {
    return dto.deliveryMode === 'files-api' ? [FILES_API_BETA] : undefined;
  }

  private async fetchImages(dto: RunDto): Promise<WikimediaImage[]> {
    const images = await this.wikimediaClient.searchImages(
      dto.query,
      dto.imageCount,
    );
    if (images.length < dto.imageCount) {
      throw new ExternalApiError(
        'wikimedia',
        `Fewer than ${dto.imageCount} images found for "${dto.query}"`,
      );
    }
    return images;
  }

  private async buildParams(
    dto: RunDto,
    images: WikimediaImage[],
  ): Promise<AnthropicMessageParams> {
    const imageBlocks = await Promise.all(
      images.map((image) =>
        this.contentBlockBuilder.buildBlock(
          image.bytes,
          image.mediaType,
          dto.deliveryMode,
        ),
      ),
    );

    // ContentBlock's media_type is a generic string, not the SDK's literal image-mime union — cast is deliberate, not a modeling mistake.
    const content = [
      ...imageBlocks,
      { type: 'text', text: dto.instruction },
    ] as unknown as ContentBlockParam[];

    return {
      model: this.modelConfig.getModel('default'),
      max_tokens: DEFAULT_MAX_TOKENS,
      messages: [{ role: 'user', content }],
    };
  }

  private buildEnvelope(
    dto: RunDto,
    images: WikimediaImage[],
    params: AnthropicMessageParams,
    response: AnthropicMessage,
  ): VisionLabEnvelope {
    const envelope = this.envelopeBuilder.build(params, response);
    return {
      ...envelope,
      images: images.map(({ url, title, widthPx, heightPx }) => ({
        url,
        title,
        widthPx,
        heightPx,
      })),
      answer: extractAnswerText(response),
      dimensionCapApplied: this.dimensionCapApplied(dto, images),
    };
  }

  private dimensionCapApplied(dto: RunDto, images: WikimediaImage[]): boolean {
    if (dto.imageCount <= 1) {
      return false;
    }
    return images.some(
      (image) =>
        image.widthPx > DIMENSION_CAP_THRESHOLD_PX ||
        image.heightPx > DIMENSION_CAP_THRESHOLD_PX,
    );
  }
}
