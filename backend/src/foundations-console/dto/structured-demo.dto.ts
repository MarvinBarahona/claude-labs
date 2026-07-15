import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { MODEL_CHOICES } from './send-message.dto';
import type { ModelChoice } from './send-message.dto';

export class StructuredDemoDto {
  @IsIn(MODEL_CHOICES)
  modelChoice: ModelChoice;

  @IsString()
  @IsNotEmpty()
  input: string;
}
