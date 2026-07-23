import { Module } from '@nestjs/common';
import { DeepwikiConnectorService } from './deepwiki-connector.service';

@Module({
  providers: [DeepwikiConnectorService],
  exports: [DeepwikiConnectorService],
})
export class DeepwikiConnectorModule {}
