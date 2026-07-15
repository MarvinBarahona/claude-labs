import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './shared/config/config.module';
import { ModelConfigModule } from './shared/model-config/model-config.module';
import { FakeModeModule } from './shared/fake-mode/fake-mode.module';
import { ApiErrorHandlingModule } from './shared/api-error-handling/api-error-handling.module';

@Module({
  imports: [
    AppConfigModule,
    ModelConfigModule,
    FakeModeModule,
    ApiErrorHandlingModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api{/*splat}'],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
