export type ContentBlockDeliveryMode = 'files-api' | 'base64';

export interface ContentBlockFileSource {
  type: 'document' | 'image';
  source: { type: 'file'; file_id: string };
}

export interface ContentBlockBase64Source {
  type: 'document' | 'image';
  source: { type: 'base64'; media_type: string; data: string };
}

export type ContentBlock = ContentBlockFileSource | ContentBlockBase64Source;
