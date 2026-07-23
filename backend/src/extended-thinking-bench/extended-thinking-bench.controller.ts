import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ExtendedThinkingBenchResult,
  ExtendedThinkingBenchService,
  IssuesResponse,
} from './extended-thinking-bench.service';
import { RunDto } from './dto/run.dto';

@Controller('extended-thinking-bench')
export class ExtendedThinkingBenchController {
  constructor(private readonly service: ExtendedThinkingBenchService) {}

  @Get('issues')
  async getIssues(): Promise<IssuesResponse> {
    return this.service.listIssues();
  }

  @Post('run')
  @HttpCode(200)
  async run(@Body() dto: RunDto): Promise<ExtendedThinkingBenchResult> {
    return this.service.run(dto);
  }
}
