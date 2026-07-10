import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

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

  afterEach(async () => {
    await app.close();
  });
});
