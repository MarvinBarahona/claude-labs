import { IsIn, IsNotEmpty, IsString } from 'class-validator';

/** Labeled Sonnet / Haiku / Opus by the frontend; all three resolve through `ModelConfigService`. */
export const MODEL_CHOICES = [
  'default',
  'classification',
  'hardest-call',
] as const;

export type ModelChoice = (typeof MODEL_CHOICES)[number];

export class StructuredDemoDto {
  @IsIn(MODEL_CHOICES)
  modelChoice: ModelChoice;

  @IsString()
  @IsNotEmpty()
  input: string;
}
