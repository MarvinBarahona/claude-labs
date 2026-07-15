import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  FoundationsConsoleService,
  MessagesEnvelope,
  StructuredEnvelope,
} from './foundations-console.service';
import { SendMessageDto } from './dto/send-message.dto';
import { StructuredDemoDto } from './dto/structured-demo.dto';

@Controller('foundations-console')
export class FoundationsConsoleController {
  constructor(private readonly service: FoundationsConsoleService) {}

  /** Both branches share `@Res({ passthrough: false })` since streaming needs manual SSE framing. */
  @Post('messages')
  async sendMessage(
    @Body() dto: SendMessageDto,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!dto.stream) {
      const envelope: MessagesEnvelope = await this.service.createTurn(dto);
      res.status(200).json(envelope);
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');

    for await (const frame of this.service.streamTurn(dto)) {
      switch (frame.kind) {
        case 'stream-event':
          res.write(
            `event: ${frame.event.type}\ndata: ${JSON.stringify(frame.event)}\n\n`,
          );
          break;
        case 'turn-complete':
          res.write(
            `event: turn_complete\ndata: ${JSON.stringify(frame.envelope)}\n\n`,
          );
          break;
        case 'error':
          res.write(
            `event: error\ndata: ${JSON.stringify(frame.shaped.body)}\n\n`,
          );
          break;
      }
    }

    res.end();
  }

  @Post('structured')
  @HttpCode(200)
  async structuredDemo(
    @Body() dto: StructuredDemoDto,
  ): Promise<StructuredEnvelope> {
    return this.service.runStructuredDemo(dto);
  }
}
