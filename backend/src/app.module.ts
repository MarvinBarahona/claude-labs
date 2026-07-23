import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './shared/config/config.module';
import { ModelConfigModule } from './shared/model-config/model-config.module';
import { FakeModeModule } from './shared/fake-mode/fake-mode.module';
import { ApiErrorHandlingModule } from './shared/api-error-handling/api-error-handling.module';
import { MessagesConsoleModule } from './messages-console/messages-console.module';
import { StructuredOutputConsoleModule } from './structured-output-console/structured-output-console.module';
import { LiveToolUseConsoleModule } from './live-tool-use-console/live-tool-use-console.module';
import { WorkflowGalleryModule } from './workflow-gallery/workflow-gallery.module';
import { ExtendedThinkingBenchModule } from './extended-thinking-bench/extended-thinking-bench.module';
import { DocumentResearchAssistantModule } from './document-research-assistant/document-research-assistant.module';
import { WebRepoResearchReporterModule } from './web-repo-research-reporter/web-repo-research-reporter.module';
import { DataCodeSandboxModule } from './data-code-sandbox/data-code-sandbox.module';
import { VisionLabModule } from './vision-lab/vision-lab.module';

@Module({
  imports: [
    AppConfigModule,
    ModelConfigModule,
    FakeModeModule,
    ApiErrorHandlingModule,
    MessagesConsoleModule,
    StructuredOutputConsoleModule,
    LiveToolUseConsoleModule,
    WorkflowGalleryModule,
    ExtendedThinkingBenchModule,
    DocumentResearchAssistantModule,
    WebRepoResearchReporterModule,
    DataCodeSandboxModule,
    VisionLabModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api{/*splat}'],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
