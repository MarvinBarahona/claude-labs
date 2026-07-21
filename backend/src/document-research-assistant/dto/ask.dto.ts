import { IsBoolean, IsIn, IsNotEmpty, IsString } from 'class-validator';
import type { ContentBlockDeliveryMode } from '../../shared/content-block-builder/content-block-builder.types';

const DELIVERY_MODES: ContentBlockDeliveryMode[] = ['files-api', 'base64'];

export class AskDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsIn(DELIVERY_MODES)
  deliveryMode: ContentBlockDeliveryMode;

  @IsBoolean()
  stream: boolean;
}
