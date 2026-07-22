import { Injectable } from '@nestjs/common';
import {
  AnthropicMessage,
  AnthropicStreamEvent,
} from '../anthropic-client/anthropic-client';

type MessageContentBlock = AnthropicMessage['content'][number];

@Injectable()
export class StreamResponseBuilderService {
  /** `message_start`'s own `content` is always `[]` in real streaming — reassembles the full `Message` from the accumulated delta events instead. */
  reconstructMessage(
    events: readonly AnthropicStreamEvent[],
  ): AnthropicMessage {
    const startEvent = events.find((event) => event.type === 'message_start');
    if (!startEvent || startEvent.type !== 'message_start') {
      throw new Error(
        'Streamed response completed without a message_start event',
      );
    }

    const deltaEvent = events.find((event) => event.type === 'message_delta');

    return {
      ...startEvent.message,
      content: this.accumulateContent(events),
      ...(deltaEvent && deltaEvent.type === 'message_delta'
        ? {
            stop_reason: deltaEvent.delta.stop_reason,
            stop_sequence: deltaEvent.delta.stop_sequence,
            usage: {
              ...startEvent.message.usage,
              input_tokens:
                deltaEvent.usage.input_tokens ??
                startEvent.message.usage.input_tokens,
              output_tokens:
                deltaEvent.usage.output_tokens ??
                startEvent.message.usage.output_tokens,
              cache_creation_input_tokens:
                deltaEvent.usage.cache_creation_input_tokens ??
                startEvent.message.usage.cache_creation_input_tokens,
              cache_read_input_tokens:
                deltaEvent.usage.cache_read_input_tokens ??
                startEvent.message.usage.cache_read_input_tokens,
            },
          }
        : {}),
    };
  }

  private accumulateContent(
    events: readonly AnthropicStreamEvent[],
  ): MessageContentBlock[] {
    const blocksByIndex = new Map<number, MessageContentBlock>();
    const toolInputJsonByIndex = new Map<number, string>();

    for (const event of events) {
      if (event.type === 'content_block_start') {
        blocksByIndex.set(event.index, { ...event.content_block });
        if (event.content_block.type === 'tool_use') {
          toolInputJsonByIndex.set(event.index, '');
        }
        continue;
      }

      if (event.type === 'content_block_delta') {
        const block = blocksByIndex.get(event.index);
        switch (event.delta.type) {
          case 'text_delta':
            if (block && block.type === 'text') {
              block.text += event.delta.text;
            }
            break;
          case 'thinking_delta':
            if (block && block.type === 'thinking') {
              block.thinking += event.delta.thinking;
            }
            break;
          case 'signature_delta':
            if (block && block.type === 'thinking') {
              block.signature += event.delta.signature;
            }
            break;
          case 'citations_delta':
            if (block && block.type === 'text') {
              block.citations = [
                ...(block.citations ?? []),
                event.delta.citation,
              ];
            }
            break;
          case 'input_json_delta': {
            const soFar = toolInputJsonByIndex.get(event.index) ?? '';
            toolInputJsonByIndex.set(
              event.index,
              soFar + event.delta.partial_json,
            );
            break;
          }
          default: {
            // A delta kind the SDK's union doesn't declare yet is a build failure here, not a silently-dropped field.
            const exhaustive: never = event.delta;
            throw new Error(
              `Unhandled stream delta type: ${(exhaustive as { type: string }).type}`,
            );
          }
        }
        continue;
      }

      if (event.type === 'content_block_stop') {
        const block = blocksByIndex.get(event.index);
        const json = toolInputJsonByIndex.get(event.index);
        if (block && block.type === 'tool_use' && json !== undefined) {
          block.input = json.length > 0 ? JSON.parse(json) : {};
        }
      }
    }

    return [...blocksByIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, block]) => block);
  }
}
