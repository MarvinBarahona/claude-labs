import { Injectable } from '@nestjs/common';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import {
  AnthropicClient,
  AnthropicMessage,
  AnthropicMessageParams,
} from '../shared/anthropic-client/anthropic-client';
import { ExternalApiError } from '../shared/api-error-handling';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { TurnEnvelope } from '../shared/envelope-builder/envelope-builder.types';
import { StructuredDemoDto } from './dto/structured-demo.dto';

const STRUCTURED_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
    actionItems: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'sentiment', 'actionItems'],
  additionalProperties: false,
} as const;

export interface StructuredOutput {
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  actionItems: string[];
}

export interface StructuredEnvelope extends TurnEnvelope {
  parsed: StructuredOutput;
}

@Injectable()
export class StructuredOutputConsoleService {
  constructor(
    private readonly anthropicClient: AnthropicClient,
    private readonly modelConfig: ModelConfigService,
    private readonly envelopeBuilder: EnvelopeBuilderService,
  ) {}

  async run(dto: StructuredDemoDto): Promise<StructuredEnvelope> {
    const params: AnthropicMessageParams = {
      model: this.modelConfig.getModel(dto.modelChoice),
      max_tokens: this.modelConfig.getDefaultMaxTokens(),
      messages: [{ role: 'user', content: dto.input }],
      output_config: {
        format: { type: 'json_schema', schema: STRUCTURED_OUTPUT_SCHEMA },
      },
    };

    const response = await this.anthropicClient.createMessage(params);
    const textBlock = response.content.find(
      (
        block,
      ): block is Extract<
        AnthropicMessage['content'][number],
        { type: 'text' }
      > => block.type === 'text',
    );
    if (!textBlock) {
      throw new ExternalApiError(
        'anthropic',
        'Structured response did not include a text block to parse',
      );
    }

    const parsed = JSON.parse(textBlock.text) as StructuredOutput;
    return { ...this.envelopeBuilder.build(params, response), parsed };
  }
}
