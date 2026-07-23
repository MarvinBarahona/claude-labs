import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AppConfigService } from '../shared/config/config.service';
import {
  ResearchEnvelope,
  WebRepoResearchReporterService,
} from './web-repo-research-reporter.service';
import { ResearchQuestionDto } from './dto/research-question.dto';

export interface WebRepoResearchReporterConfigResponse {
  targetRepo: string;
}

@Controller('web-repo-research-reporter')
export class WebRepoResearchReporterController {
  constructor(
    private readonly service: WebRepoResearchReporterService,
    private readonly config: AppConfigService,
  ) {}

  /** So the frontend can name the actual repo this lab researches, rather than talking about "a repo" in the abstract. */
  @Get('config')
  getConfig(): WebRepoResearchReporterConfigResponse {
    return { targetRepo: this.config.githubTargetRepo };
  }

  @Post('run')
  @HttpCode(200)
  async run(@Body() dto: ResearchQuestionDto): Promise<ResearchEnvelope> {
    return this.service.run(dto);
  }
}
