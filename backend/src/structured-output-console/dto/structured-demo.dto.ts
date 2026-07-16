import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { MODEL_TIERS } from '../../shared/model-config/model-config.types';
import type { ModelTier } from '../../shared/model-config/model-config.types';

export class StructuredDemoDto {
  @IsIn(MODEL_TIERS)
  modelChoice: ModelTier;

  @IsString()
  @IsNotEmpty()
  input: string;
}
