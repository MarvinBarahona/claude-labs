import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { VisionLabService, VisionLabEnvelope } from './vision-lab.service';
import { RunDto } from './dto/run.dto';

@Controller('vision-lab')
export class VisionLabController {
  constructor(private readonly service: VisionLabService) {}

  /** Both branches share `@Res({ passthrough: false })` since streaming needs manual SSE framing. */
  @Post('run')
  async run(
    @Body() dto: RunDto,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!dto.stream) {
      const envelope: VisionLabEnvelope = await this.service.run(dto);
      res.status(200).json(envelope);
      return;
    }

    // Nest defaults a POST route's status to 201 before the handler runs; override it for SSE's 200.
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');

    for await (const frame of this.service.streamRun(dto)) {
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
