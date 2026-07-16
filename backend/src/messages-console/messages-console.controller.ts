import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MessagesConsoleService } from './messages-console.service';
import { TurnEnvelope } from '../shared/envelope-builder/envelope-builder.types';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('messages-console')
export class MessagesConsoleController {
  constructor(private readonly service: MessagesConsoleService) {}

  /** Both branches share `@Res({ passthrough: false })` since streaming needs manual SSE framing. */
  @Post('turn')
  async sendTurn(
    @Body() dto: SendMessageDto,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!dto.stream) {
      const envelope: TurnEnvelope = await this.service.createTurn(dto);
      res.status(200).json(envelope);
      return;
    }

    // Nest defaults a POST route's status to 201 before the handler runs
    // (see `getStatusByMethod` in `@nestjs/core`); override it for SSE's 200.
    res.status(200);
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
}
