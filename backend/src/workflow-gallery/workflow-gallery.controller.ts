import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  IssuesResponse,
  WorkflowGalleryEnvelope,
  WorkflowGalleryService,
} from './workflow-gallery.service';
import { RunDto } from './dto/run.dto';

@Controller('workflow-gallery')
export class WorkflowGalleryController {
  constructor(private readonly service: WorkflowGalleryService) {}

  @Get('issues')
  async getIssues(): Promise<IssuesResponse> {
    return this.service.listIssues();
  }

  @Post('run')
  @HttpCode(200)
  async run(@Body() dto: RunDto): Promise<WorkflowGalleryEnvelope> {
    return this.service.run(dto);
  }
}
