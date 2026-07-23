import { IsBoolean } from 'class-validator';

export class RunDto {
  @IsBoolean()
  stream: boolean;
}
