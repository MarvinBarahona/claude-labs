import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  StructuredEnvelope,
  StructuredOutputConsoleService,
} from './structured-output-console.service';
import { StructuredDemoDto } from './dto/structured-demo.dto';

@Controller('structured-output-console')
export class StructuredOutputConsoleController {
  constructor(private readonly service: StructuredOutputConsoleService) {}

  @Post('run')
  @HttpCode(200)
  async run(@Body() dto: StructuredDemoDto): Promise<StructuredEnvelope> {
    return this.service.run(dto);
  }
}
