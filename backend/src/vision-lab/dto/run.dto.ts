import { IsBoolean, IsIn, IsNotEmpty, IsString } from 'class-validator';
import type { ContentBlockDeliveryMode } from '../../shared/content-block-builder/content-block-builder.types';

const DELIVERY_MODES: ContentBlockDeliveryMode[] = ['files-api', 'base64'];
const IMAGE_COUNTS = [1, 2, 3, 4] as const;

export class RunDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsIn(IMAGE_COUNTS)
  imageCount: 1 | 2 | 3 | 4;

  @IsString()
  @IsNotEmpty()
  instruction: string;

  @IsIn(DELIVERY_MODES)
  deliveryMode: ContentBlockDeliveryMode;

  @IsBoolean()
  stream: boolean;
}
