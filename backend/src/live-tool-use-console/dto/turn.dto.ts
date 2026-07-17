import { IsBoolean, IsIn, IsNotEmpty, IsString } from 'class-validator';
import { MODEL_TIERS } from '../../shared/model-config/model-config.types';
import type { ModelTier } from '../../shared/model-config/model-config.types';

export class TurnDto {
  @IsIn(MODEL_TIERS)
  modelChoice: ModelTier;

  @IsString()
  @IsNotEmpty()
  question: string;

  @IsBoolean()
  stream: boolean;
}
