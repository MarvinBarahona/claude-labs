import { Module } from '@nestjs/common';
import { ModelConfigModule } from '../shared/model-config/model-config.module';
import { AnthropicClientModule } from '../shared/anthropic-client/anthropic-client.module';
import { FoundationsConsoleController } from './foundations-console.controller';
import { FoundationsConsoleService } from './foundations-console.service';

@Module({
  imports: [ModelConfigModule, AnthropicClientModule],
  controllers: [FoundationsConsoleController],
  providers: [FoundationsConsoleService],
})
export class FoundationsConsoleModule {}
