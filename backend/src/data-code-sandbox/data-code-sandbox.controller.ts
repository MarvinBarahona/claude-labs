import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  DataCodeSandboxEnvelope,
  DataCodeSandboxService,
} from './data-code-sandbox.service';
import { RunDto } from './dto/run.dto';

@Controller('data-code-sandbox')
export class DataCodeSandboxController {
  constructor(private readonly service: DataCodeSandboxService) {}

  @Post('run')
  @HttpCode(200)
  async run(@Body() dto: RunDto): Promise<DataCodeSandboxEnvelope> {
    return this.service.run(dto);
  }
}
