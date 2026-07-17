import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppConfigService } from '../shared/config/config.service';
import {
  LiveToolUseConsoleService,
  LiveToolUseEnvelope,
} from './live-tool-use-console.service';
import { TurnDto } from './dto/turn.dto';

export interface LiveToolUseConsoleConfigResponse {
  targetRepo: string;
}

@Controller('live-tool-use-console')
export class LiveToolUseConsoleController {
  constructor(
    private readonly service: LiveToolUseConsoleService,
    private readonly config: AppConfigService,
  ) {}

  /** So the frontend can name the actual repo `get_repo_stats` queries, rather than talking about "a repo" in the abstract. */
  @Get('config')
  getConfig(): LiveToolUseConsoleConfigResponse {
    return { targetRepo: this.config.githubTargetRepo };
  }

  /** Both branches share `@Res({ passthrough: false })` since streaming needs manual SSE framing. */
  @Post('turn')
  async sendTurn(
    @Body() dto: TurnDto,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!dto.stream) {
      const envelope: LiveToolUseEnvelope = await this.service.createTurn(dto);
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
