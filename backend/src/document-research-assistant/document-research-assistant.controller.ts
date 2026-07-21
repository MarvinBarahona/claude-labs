import { Body, Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  DocumentResearchAssistantService,
  DocumentResearchAssistantEnvelope,
  CreateSessionResult,
} from './document-research-assistant.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { AskDto } from './dto/ask.dto';

@Controller('document-research-assistant')
export class DocumentResearchAssistantController {
  constructor(private readonly service: DocumentResearchAssistantService) {}

  @Post('session')
  @HttpCode(200)
  async createSession(
    @Body() dto: CreateSessionDto,
  ): Promise<CreateSessionResult> {
    return this.service.createSession(dto);
  }

  /** Both branches share `@Res({ passthrough: false })` since streaming needs manual SSE framing. */
  @Post('session/:sessionId/ask')
  async ask(
    @Param('sessionId') sessionId: string,
    @Body() dto: AskDto,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!dto.stream) {
      const envelope: DocumentResearchAssistantEnvelope =
        await this.service.ask(sessionId, dto);
      res.status(200).json(envelope);
      return;
    }

    // A 404 has to land as a real HTTP status; once SSE headers are committed that's no longer
    // possible, so the session's existence is checked up front, before res.status()/setHeader().
    this.service.assertSessionExists(sessionId);

    // Nest defaults a POST route's status to 201 before the handler runs
    // (see `getStatusByMethod` in `@nestjs/core`); override it for SSE's 200.
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');

    for await (const frame of this.service.streamAsk(sessionId, dto)) {
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
