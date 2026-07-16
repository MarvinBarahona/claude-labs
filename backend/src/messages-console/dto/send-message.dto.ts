import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MODEL_TIERS } from '../../shared/model-config/model-config.types';
import type { ModelTier } from '../../shared/model-config/model-config.types';

export type TranscriptRole = 'user' | 'assistant';

class TranscriptMessageDto {
  @IsIn(['user', 'assistant'])
  role: TranscriptRole;

  @IsString()
  text: string;
}

export class SendMessageDto {
  @IsIn(MODEL_TIERS)
  modelChoice: ModelTier;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  temperature?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TranscriptMessageDto)
  messages: TranscriptMessageDto[];

  @IsBoolean()
  stream: boolean;
}
