import { Module } from '@nestjs/common';
import { ModelConfigModule } from '../shared/model-config/model-config.module';
import { AnthropicClientModule } from '../shared/anthropic-client/anthropic-client.module';
import { EnvelopeBuilderModule } from '../shared/envelope-builder/envelope-builder.module';
import { StructuredOutputConsoleController } from './structured-output-console.controller';
import { StructuredOutputConsoleService } from './structured-output-console.service';

@Module({
  imports: [ModelConfigModule, AnthropicClientModule, EnvelopeBuilderModule],
  controllers: [StructuredOutputConsoleController],
  providers: [StructuredOutputConsoleService],
})
export class StructuredOutputConsoleModule {}
