import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { ModelConfigModule } from './model-config/model-config.module';
import { FakeModeModule } from './fake-mode/fake-mode.module';

@Module({
  imports: [
    AppConfigModule,
    ModelConfigModule,
    FakeModeModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api{/*splat}'],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
