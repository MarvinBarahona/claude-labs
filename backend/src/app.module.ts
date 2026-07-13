import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { ModelConfigModule } from './model-config/model-config.module';

@Module({
  imports: [AppConfigModule, ModelConfigModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
