import { FakeAnthropicClient } from '../../testing/anthropic/fake-anthropic-client';
import { ContentBlockBuilderService } from './content-block-builder.service';

const PDF_BYTES = Buffer.from('fake pdf bytes');
const IMAGE_BYTES = Buffer.from('fake png bytes');

describe('ContentBlockBuilderService', () => {
  it('files-api mode uploads and returns a document file-reference block for a PDF', async () => {
    const anthropicClient = new FakeAnthropicClient();
    anthropicClient.queueFileUpload({ id: 'file_abc123' });
    const service = new ContentBlockBuilderService(anthropicClient);

    const block = await service.buildBlock(
      PDF_BYTES,
      'application/pdf',
      'files-api',
    );

    expect(block).toEqual({
      type: 'document',
      source: { type: 'file', file_id: 'file_abc123' },
    });
  });

  it('files-api mode uploads and returns an image file-reference block for an image media type', async () => {
    const anthropicClient = new FakeAnthropicClient();
    anthropicClient.queueFileUpload({ id: 'file_def456' });
    const service = new ContentBlockBuilderService(anthropicClient);

    const block = await service.buildBlock(
      IMAGE_BYTES,
      'image/png',
      'files-api',
    );

    expect(block).toEqual({
      type: 'image',
      source: { type: 'file', file_id: 'file_def456' },
    });
  });

  it('base64 mode returns an inline document block with no upload call', async () => {
    const anthropicClient = new FakeAnthropicClient();
    const uploadFile = jest.spyOn(anthropicClient, 'uploadFile');
    const service = new ContentBlockBuilderService(anthropicClient);

    const block = await service.buildBlock(
      PDF_BYTES,
      'application/pdf',
      'base64',
    );

    expect(block).toEqual({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: PDF_BYTES.toString('base64'),
      },
    });
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('base64 mode returns an inline image block with no upload call', async () => {
    const anthropicClient = new FakeAnthropicClient();
    const uploadFile = jest.spyOn(anthropicClient, 'uploadFile');
    const service = new ContentBlockBuilderService(anthropicClient);

    const block = await service.buildBlock(IMAGE_BYTES, 'image/png', 'base64');

    expect(block).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: IMAGE_BYTES.toString('base64'),
      },
    });
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('produces blocks whose type matches across both modes for the same media type', async () => {
    const filesApiClient = new FakeAnthropicClient();
    filesApiClient.queueFileUpload({ id: 'file_ghi789' });
    const filesApiService = new ContentBlockBuilderService(filesApiClient);
    const base64Service = new ContentBlockBuilderService(
      new FakeAnthropicClient(),
    );

    const filesApiBlock = await filesApiService.buildBlock(
      PDF_BYTES,
      'application/pdf',
      'files-api',
    );
    const base64Block = await base64Service.buildBlock(
      PDF_BYTES,
      'application/pdf',
      'base64',
    );

    expect(filesApiBlock.type).toBe(base64Block.type);
    expect(filesApiBlock.source.type).not.toBe(base64Block.source.type);
  });
});
