import { Test } from '@nestjs/testing';
import {
  AnthropicClient,
  AnthropicStreamEvent,
} from '../../shared/anthropic-client/anthropic-client';
import { FakeAnthropicClient } from './fake-anthropic-client';
import {
  fakeTextMessage,
  fakeToolUseMessage,
  fakeTextStreamEvents,
} from './message-builders';

const params = { model: 'claude-sonnet-5', max_tokens: 100, messages: [] };

describe('FakeAnthropicClient', () => {
  it('can be injected via Nest DI in place of AnthropicClient', async () => {
    const fake = new FakeAnthropicClient().queueMessage(fakeTextMessage('hi'));
    const moduleRef = await Test.createTestingModule({
      providers: [{ provide: AnthropicClient, useValue: fake }],
    }).compile();

    const client = moduleRef.get(AnthropicClient);
    const message = await client.createMessage(params);

    expect(message.content).toEqual([
      { type: 'text', text: 'hi', citations: null },
    ]);
  });

  it('returns a canned non-streaming response', async () => {
    const fake = new FakeAnthropicClient().queueMessage(
      fakeTextMessage('hello there'),
    );

    const message = await fake.createMessage(params);

    expect(message.stop_reason).toBe('end_turn');
    expect(message.content[0]).toMatchObject({
      type: 'text',
      text: 'hello there',
    });
  });

  it('returns a canned streaming event sequence', async () => {
    const fake = new FakeAnthropicClient().queueStream(
      fakeTextStreamEvents('streamed'),
    );

    const events: AnthropicStreamEvent[] = [];
    for await (const event of fake.streamMessage({ ...params, stream: true })) {
      events.push(event);
    }

    expect(events.map((e) => e.type)).toEqual([
      'message_start',
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
      'message_delta',
      'message_stop',
    ]);
  });

  it('replays a queued tool-use loop across successive calls', async () => {
    const fake = new FakeAnthropicClient()
      .queueMessage(
        fakeToolUseMessage([
          { id: 'toolu_1', name: 'get_weather', input: { city: 'nyc' } },
        ]),
      )
      .queueMessage(fakeTextMessage('It is sunny in NYC.'));

    const firstTurn = await fake.createMessage(params);
    expect(firstTurn.stop_reason).toBe('tool_use');
    expect(firstTurn.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'get_weather',
    });

    const secondTurn = await fake.createMessage(params);
    expect(secondTurn.stop_reason).toBe('end_turn');
    expect(secondTurn.content[0]).toMatchObject({
      type: 'text',
      text: 'It is sunny in NYC.',
    });

    expect(fake.recordedCalls).toHaveLength(2);
  });

  it('throws a clear error when called with nothing queued', async () => {
    const fake = new FakeAnthropicClient();

    await expect(fake.createMessage(params)).rejects.toThrow(
      /no queued message left/,
    );
  });

  it('throws a clear error from streamMessage() when called with nothing queued', async () => {
    const fake = new FakeAnthropicClient();

    const iterator = fake
      .streamMessage({ ...params, stream: true })
      [Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toThrow(/no queued stream left/);
  });

  it('throws a clear error from uploadFile() when called with nothing queued', async () => {
    const fake = new FakeAnthropicClient();

    await expect(
      fake.uploadFile(Buffer.from('bytes'), 'application/pdf'),
    ).rejects.toThrow(/no queued result left/);
  });

  it('returns the queued result from uploadFile() once queued', async () => {
    const fake = new FakeAnthropicClient().queueFileUpload({
      id: 'file_queued_1',
    });

    const result = await fake.uploadFile(Buffer.from('bytes'), 'image/png');

    expect(result).toEqual({ id: 'file_queued_1' });
  });

  it('throws a clear error from downloadFile() when called with nothing queued', async () => {
    const fake = new FakeAnthropicClient();

    await expect(fake.downloadFile('file_123')).rejects.toThrow(
      /no queued result left/,
    );
  });

  it('returns the queued result from downloadFile() once queued', async () => {
    const fake = new FakeAnthropicClient().queueFileDownload({
      bytes: Buffer.from('chart bytes'),
      mediaType: 'image/png',
      filename: 'chart.png',
    });

    const result = await fake.downloadFile('file_123');

    expect(result).toEqual({
      bytes: Buffer.from('chart bytes'),
      mediaType: 'image/png',
      filename: 'chart.png',
    });
  });

  it('throws a clear error from registerSkill() when called with nothing queued', async () => {
    const fake = new FakeAnthropicClient();

    await expect(
      fake.registerSkill([{ filename: 'SKILL.md', content: Buffer.from('') }]),
    ).rejects.toThrow(/no queued result left/);
  });

  it('returns the queued result from registerSkill() once queued', async () => {
    const fake = new FakeAnthropicClient().queueSkillRegistration({
      id: 'skill_queued_1',
    });

    const result = await fake.registerSkill([
      { filename: 'SKILL.md', content: Buffer.from('') },
    ]);

    expect(result).toEqual({ id: 'skill_queued_1' });
  });

  describe('allowUnqueuedFallback', () => {
    it('still throws with nothing queued when left at its default (false)', async () => {
      const fake = new FakeAnthropicClient();

      await expect(fake.createMessage(params)).rejects.toThrow(
        /no queued message left/,
      );
    });

    it('returns a generic canned message instead of throwing once enabled', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const message = await fake.createMessage(params);

      expect(message.stop_reason).toBe('end_turn');
      expect(message.content[0]).toMatchObject({ type: 'text' });
    });

    it('still prefers a queued message over the fallback once enabled', async () => {
      const fake = new FakeAnthropicClient().queueMessage(
        fakeTextMessage('queued, not fallback'),
      );
      fake.allowUnqueuedFallback = true;

      const message = await fake.createMessage(params);

      expect(message.content[0]).toMatchObject({
        type: 'text',
        text: 'queued, not fallback',
      });
    });

    it('returns schema-conformant JSON as the fallback when output_config.format requests structured output', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const message = await fake.createMessage({
        ...params,
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                sentiment: {
                  type: 'string',
                  enum: ['positive', 'neutral', 'negative'],
                },
                actionItems: { type: 'array', items: { type: 'string' } },
              },
              required: ['summary', 'sentiment', 'actionItems'],
            },
          },
        },
      });

      const block = message.content[0];
      expect(block).toMatchObject({ type: 'text' });
      if (block.type !== 'text') {
        throw new Error('expected a text block');
      }
      const parsed: unknown = JSON.parse(block.text);
      expect(parsed).toEqual({
        summary: 'fake mode — no response was queued for this call',
        sentiment: 'positive',
        actionItems: ['fake mode — no response was queued for this call'],
      });
    });

    it('yields a generic canned stream instead of throwing once enabled', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const events: AnthropicStreamEvent[] = [];
      for await (const event of fake.streamMessage({
        ...params,
        stream: true,
      })) {
        events.push(event);
      }

      expect(events.map((e) => e.type)).toEqual([
        'message_start',
        'content_block_start',
        'content_block_delta',
        'content_block_stop',
        'message_delta',
        'message_stop',
      ]);
    });

    const weatherRepoTools = [
      {
        name: 'get_weather',
        description: 'Get the current weather conditions for a named location.',
        input_schema: {
          type: 'object' as const,
          properties: { location: { type: 'string' } },
          required: ['location'],
        },
      },
      {
        name: 'get_repo_stats',
        description: "Get stats for the app's configured GitHub repository.",
        input_schema: { type: 'object' as const, properties: {} },
      },
    ];

    it('returns a fabricated tool_use call as the fallback when tools are offered and no tool_result exists yet', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const message = await fake.createMessage({
        ...params,
        tools: weatherRepoTools,
        messages: [{ role: 'user', content: 'How is the repo doing?' }],
      });

      expect(message.stop_reason).toBe('tool_use');
      expect(message.content[0]).toMatchObject({
        type: 'tool_use',
        name: 'get_repo_stats',
        input: {},
      });
    });

    it('returns a fabricated bash_code_execution round trip with an output file when the code execution tool is offered', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const message = await fake.createMessage({
        ...params,
        tools: [{ type: 'code_execution_20260521', name: 'code_execution' }],
        messages: [{ role: 'user', content: 'Chart something.' }],
      });

      const blocks = message.content as unknown as Array<
        Record<string, unknown>
      >;
      const toolUse = blocks.find(
        (block) => block['type'] === 'server_tool_use',
      );
      expect(toolUse).toMatchObject({ name: 'bash_code_execution' });
      const toolResult = blocks.find(
        (block) => block['type'] === 'bash_code_execution_tool_result',
      ) as unknown as {
        content: { content: Array<{ file_id: string }> };
      };
      expect(toolResult.content.content[0].file_id).toEqual(expect.any(String));
    });

    it('fabricates a web-search/DeepWiki-MCP round trip and a schema-conforming brief when both are offered', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const message = await fake.createMessage({
        ...params,
        messages: [
          {
            role: 'user',
            content: 'What testing approach does this repo use?',
          },
        ],
        tools: [
          { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
          { type: 'mcp_toolset', mcp_server_name: 'deepwiki' },
        ],
        mcp_servers: [
          {
            type: 'url',
            url: 'https://mcp.deepwiki.com/mcp',
            name: 'deepwiki',
          },
        ],
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                findings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      claim: { type: 'string' },
                      source: { type: 'string' },
                    },
                    required: ['claim', 'source'],
                  },
                },
              },
              required: ['summary', 'findings'],
            },
          },
        },
      } as unknown as Parameters<typeof fake.createMessage>[0]);

      const blocks = message.content as unknown as Array<
        Record<string, unknown>
      >;
      expect(
        blocks.find((block) => block['type'] === 'server_tool_use'),
      ).toMatchObject({
        name: 'web_search',
      });
      expect(
        blocks.find((block) => block['type'] === 'web_search_tool_result'),
      ).toBeTruthy();
      expect(
        blocks.find((block) => block['type'] === 'mcp_tool_use'),
      ).toMatchObject({
        name: 'ask_question',
      });
      expect(
        blocks.find((block) => block['type'] === 'mcp_tool_result'),
      ).toBeTruthy();

      const textBlock = blocks.find((block) => block['type'] === 'text') as {
        text: string;
      };
      const parsed: unknown = JSON.parse(textBlock.text);
      expect(parsed).toEqual({
        summary: 'fake mode — no response was queued for this call',
        findings: [
          {
            claim: 'fake mode — no response was queued for this call',
            source: 'fake mode — no response was queued for this call',
          },
        ],
      });
    });

    it('returns a fabricated create call on /notes.md when a schema-less text-editor tool is offered (no custom tools)', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const message = await fake.createMessage({
        ...params,
        tools: [
          { type: 'text_editor_20250728', name: 'str_replace_based_edit_tool' },
        ],
        messages: [{ role: 'user', content: 'What is this paper about?' }],
      });

      expect(message.stop_reason).toBe('tool_use');
      expect(message.content[0]).toMatchObject({
        type: 'tool_use',
        name: 'str_replace_based_edit_tool',
        input: { command: 'create', path: '/notes.md' },
      });
    });

    it('fabricates a page_location citation on the plain-text fallback when a document with citations enabled was attached', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const message = await fake.createMessage({
        ...params,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: 'ZmFrZQ==',
                },
                title: 'A Test Paper',
                citations: { enabled: true },
              },
              { type: 'text', text: 'What is this about?' },
            ],
          },
        ],
      });

      expect(message.content[0]).toMatchObject({
        type: 'text',
        citations: [{ type: 'page_location', document_title: 'A Test Paper' }],
      });
    });

    it('returns the plain-text fallback once the latest message already carries a tool_result', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const message = await fake.createMessage({
        ...params,
        tools: weatherRepoTools,
        messages: [
          { role: 'user', content: 'How is the repo doing?' },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'fake_tool_call_1',
                name: 'get_repo_stats',
                input: {},
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'fake_tool_call_1',
                content: '{}',
              },
            ],
          },
        ],
      });

      expect(message.stop_reason).toBe('end_turn');
      expect(message.content[0]).toMatchObject({ type: 'text' });
    });

    it('returns a canned file id from uploadFile() instead of throwing once enabled', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const result = await fake.uploadFile(Buffer.from('bytes'), 'image/png');

      expect(result).toEqual({ id: 'file_fake_unqueued' });
    });

    it('still prefers a queued uploadFile() result over the fallback once enabled', async () => {
      const fake = new FakeAnthropicClient().queueFileUpload({
        id: 'file_queued_2',
      });
      fake.allowUnqueuedFallback = true;

      const result = await fake.uploadFile(Buffer.from('bytes'), 'image/png');

      expect(result).toEqual({ id: 'file_queued_2' });
    });

    it('returns a canned result from downloadFile() instead of throwing once enabled', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const result = await fake.downloadFile('file_123');

      expect(result).toMatchObject({
        mediaType: 'application/octet-stream',
        filename: 'fake-output.bin',
      });
    });

    it('returns a canned skill id from registerSkill() instead of throwing once enabled', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const result = await fake.registerSkill([
        { filename: 'SKILL.md', content: Buffer.from('') },
      ]);

      expect(result).toEqual({ id: 'skill_fake_unqueued' });
    });

    it('yields a fabricated tool_use stream as the fallback when tools are offered and no tool_result exists yet', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const events: AnthropicStreamEvent[] = [];
      for await (const event of fake.streamMessage({
        ...params,
        tools: weatherRepoTools,
        messages: [{ role: 'user', content: 'What is the weather like?' }],
        stream: true,
      })) {
        events.push(event);
      }

      const startEvent = events.find(
        (event) => event.type === 'content_block_start',
      );
      expect(startEvent).toMatchObject({
        content_block: { type: 'tool_use', name: 'get_weather' },
      });
      const deltaEvent = events.find((event) => event.type === 'message_delta');
      expect(deltaEvent).toMatchObject({ delta: { stop_reason: 'tool_use' } });
    });
  });
});
