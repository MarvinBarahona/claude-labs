import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApiErrorHandlingModule } from '../src/shared/api-error-handling/api-error-handling.module';
import { ExternalApiError } from '../src/shared/api-error-handling';

@Controller('test-only')
class ThrowawayController {
  @Get('external-api-error')
  throwExternalApiError(): never {
    throw new ExternalApiError('anthropic', 'boom');
  }

  @Get('unexpected-error')
  throwUnexpectedError(): never {
    throw new Error('leaky internal detail');
  }

  @Get('validation-error')
  throwValidationError(): never {
    throw new BadRequestException('bad request');
  }
}

describe('API error handling (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiErrorHandlingModule],
      controllers: [ThrowawayController],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 502 with the documented body for an ExternalApiError', () => {
    return request(app.getHttpServer())
      .get('/test-only/external-api-error')
      .expect(502)
      .expect({ error: { message: 'boom', source: 'anthropic' } });
  });

  it('returns 500 with the generic body for an unexpected error, never the original message', () => {
    return request(app.getHttpServer())
      .get('/test-only/unexpected-error')
      .expect(500)
      .expect({
        error: { message: 'An unexpected error occurred', source: 'app' },
      });
  });

  it("leaves Nest's own validation-style rejection unchanged", () => {
    return request(app.getHttpServer())
      .get('/test-only/validation-error')
      .expect(400)
      .expect({
        message: 'bad request',
        error: 'Bad Request',
        statusCode: 400,
      });
  });
});
