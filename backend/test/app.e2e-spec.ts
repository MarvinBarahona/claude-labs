import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { useNockFixtures } from '../src/testing/http-fixtures/nock-lifecycle';
import { mockAnthropicModelsList } from '../src/testing/http-fixtures/anthropic.fixtures';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  useNockFixtures();

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/smoke-test (GET)', () => {
    return request(app.getHttpServer())
      .get('/smoke-test')
      .expect(200)
      .expect({ message: 'Hello from the claude-labs backend' });
  });

  it('/mode (GET) reports fakeMode: false, no repoUrl, and the key health check result by default', () => {
    mockAnthropicModelsList([{ id: 'claude-sonnet-5' }]);

    return request(app.getHttpServer())
      .get('/mode')
      .expect(200)
      .expect({ fakeMode: false, keyStatus: 'valid' });
  });

  afterEach(async () => {
    await app.close();
  });
});
