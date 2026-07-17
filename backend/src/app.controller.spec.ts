import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('smoke-test', () => {
    it('should return a smoke-test message', () => {
      expect(appController.getSmokeTest()).toEqual({
        message: 'Hello from the claude-labs backend',
      });
    });

    it('DELIBERATE CI BREAK — throwaway, reverted immediately', () => {
      expect(true).toBe(false);
    });
  });
});
