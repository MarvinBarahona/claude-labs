import { IsInt, IsPositive } from 'class-validator';

export class RunDto {
  @IsInt()
  @IsPositive()
  issueNumber: number;
}
