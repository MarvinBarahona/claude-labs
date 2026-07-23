import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  AgentPlaygroundEnvelope,
  AgentPlaygroundService,
} from './agent-playground.service';
import { RunDto } from './dto/run.dto';

@Controller('agent-playground')
export class AgentPlaygroundController {
  constructor(private readonly service: AgentPlaygroundService) {}

  /** Both branches share `@Res({ passthrough: false })` since streaming needs manual SSE framing. */
  @Post('run')
  async run(
    @Body() dto: RunDto,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!dto.stream) {
      const envelope: AgentPlaygroundEnvelope = await this.service.run(dto);
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
        case 'tool-call-start':
          res.write(
            `event: tool_call_start\ndata: ${JSON.stringify({ name: frame.name, input: frame.input })}\n\n`,
          );
          break;
        case 'tool-call-result':
          res.write(
            `event: tool_call_result\ndata: ${JSON.stringify({ name: frame.name, result: frame.result, isError: frame.isError })}\n\n`,
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
