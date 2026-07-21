import { Module } from '@nestjs/common';
import { ModelConfigModule } from '../shared/model-config/model-config.module';
import { AnthropicClientModule } from '../shared/anthropic-client/anthropic-client.module';
import { EnvelopeBuilderModule } from '../shared/envelope-builder/envelope-builder.module';
import { GithubProviderModule } from '../shared/github-provider/github-provider.module';
import { CachingLayerModule } from '../shared/caching-layer/caching-layer.module';
import { WorkflowGalleryController } from './workflow-gallery.controller';
import { WorkflowGalleryService } from './workflow-gallery.service';

@Module({
  imports: [
    ModelConfigModule,
    AnthropicClientModule,
    EnvelopeBuilderModule,
    GithubProviderModule,
    CachingLayerModule,
  ],
  controllers: [WorkflowGalleryController],
  providers: [WorkflowGalleryService],
})
export class WorkflowGalleryModule {}
