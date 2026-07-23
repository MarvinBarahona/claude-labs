import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ResearchQuestionDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxSearches?: number;
}
