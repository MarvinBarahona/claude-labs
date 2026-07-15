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

/** Labeled Sonnet / Haiku / Opus by the frontend; all three resolve through `ModelConfigService`. */
export const MODEL_CHOICES = ['default', 'classification', 'hardest-call'] as const;

export type ModelChoice = (typeof MODEL_CHOICES)[number];

export type TranscriptRole = 'user' | 'assistant';

class TranscriptMessageDto {
  @IsIn(['user', 'assistant'])
  role: TranscriptRole;

  @IsString()
  text: string;
}

export class SendMessageDto {
  @IsIn(MODEL_CHOICES)
  modelChoice: ModelChoice;

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
