import { Test } from '@nestjs/testing';
import { AppConfigModule } from '../src/shared/config/config.module';
import { AnthropicClient } from '../src/shared/anthropic-client/anthropic-client';
import { AnthropicClientModule } from '../src/shared/anthropic-client/anthropic-client.module';
import { RealAnthropicClient } from '../src/shared/anthropic-client/real-anthropic-client';
import { fakeTextMessage } from '../src/testing/anthropic/message-builders';
import { mockAnthropicMessagesCreate } from '../src/testing/http-fixtures/anthropic.fixtures';
import { useNockFixtures } from '../src/testing/http-fixtures/nock-lifecycle';

const params = { model: 'claude-sonnet-5', max_tokens: 100, messages: [] };

// FAKE_MODE=true wiring is already proven at the unit level in
// anthropic-client.module.spec.ts; this covers only what a real, fully
// composed app can: RealAnthropicClient making a real, nock-intercepted call.
describe('AnthropicClientModule wiring (e2e)', () => {
  useNockFixtures();

  it('resolves to RealAnthropicClient and makes a real (nock-intercepted) HTTP call when FAKE_MODE=false', async () => {
    const scope = mockAnthropicMessagesCreate(fakeTextMessage('hi'));

    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, AnthropicClientModule],
    }).compile();
    const client = moduleRef.get(AnthropicClient);
    expect(client).toBeInstanceOf(RealAnthropicClient);

    await client.createMessage(params);
    expect(scope.isDone()).toBe(true);
  });
});
