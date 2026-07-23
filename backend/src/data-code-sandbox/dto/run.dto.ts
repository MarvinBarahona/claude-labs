import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class RunDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsBoolean()
  useSkill: boolean;
}
