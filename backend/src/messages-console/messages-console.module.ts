import { Module } from '@nestjs/common';
import { ModelConfigModule } from '../shared/model-config/model-config.module';
import { AnthropicClientModule } from '../shared/anthropic-client/anthropic-client.module';
import { EnvelopeBuilderModule } from '../shared/envelope-builder/envelope-builder.module';
import { MessagesConsoleController } from './messages-console.controller';
import { MessagesConsoleService } from './messages-console.service';

@Module({
  imports: [ModelConfigModule, AnthropicClientModule, EnvelopeBuilderModule],
  controllers: [MessagesConsoleController],
  providers: [MessagesConsoleService],
})
export class MessagesConsoleModule {}
