import { TestBed } from '@angular/core/testing';
import { InspectorPanel } from './inspector-panel';
import type { InspectorCall } from './inspector-call';

describe('InspectorPanel', () => {
  async function createFixture(call: InspectorCall) {
    await TestBed.configureTestingModule({ imports: [InspectorPanel] }).compileComponents();
    const fixture = TestBed.createComponent(InspectorPanel);
    fixture.componentRef.setInput('call', call);
    fixture.detectChanges();
    return fixture;
  }

  it('renders request JSON, response JSON, stop_reason and usage for a non-streaming call', async () => {
    const fixture = await createFixture({
      request: { model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'hi' }] },
      response: { content: [{ type: 'text', text: 'hello' }] },
      stopReason: 'end_turn',
      usage: { inputTokens: 12, outputTokens: 4 },
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('claude-sonnet-5');
    expect(text).toContain('"text": "hello"');
    expect(text).toContain('stop_reason: end_turn');
    expect(text).toContain('in 12 / out 4');
  });

  it('shows a placeholder when no response has arrived yet', async () => {
    const fixture = await createFixture({ request: { model: 'claude-sonnet-5' } });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No response yet.');
  });

  it('renders a streaming event log incrementally and in order', async () => {
    const fixture = await createFixture({
      request: { model: 'claude-sonnet-5' },
      streamEvents: [{ type: 'message_start' }],
    });

    fixture.componentRef.setInput('call', {
      request: { model: 'claude-sonnet-5' },
      streamEvents: [{ type: 'message_start' }, { type: 'content_block_delta', delta: { text: 'hi' } }],
    });
    fixture.detectChanges();

    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('ol li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('message_start');
    expect(items[1].textContent).toContain('content_block_delta');
  });

  it('shows cache read and cache write distinctly', async () => {
    const fixture = await createFixture({
      request: {},
      response: {},
      usage: { cacheCreationInputTokens: 250, cacheReadInputTokens: 1800 },
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('cache write: 250');
    expect(text).toContain('cache read: 1800');
  });

  it('renders arbitrary content block types, including tool_use and tool_result, without special-casing', async () => {
    const fixture = await createFixture({
      request: {},
      response: {
        content: [
          { type: 'text', text: 'checking the weather' },
          { type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { city: 'Berlin' } },
          { type: 'tool_result', tool_use_id: 'toolu_1', content: '18°C, cloudy' },
        ],
      },
    });

    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('ul li');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('text');
    expect(items[1].textContent).toContain('tool_use');
    expect(items[1].textContent).toContain('get_weather');
    expect(items[2].textContent).toContain('tool_result');
    expect(items[2].textContent).toContain('18°C, cloudy');
  });

  it('renders each prior call\'s request/response pair, in order, above the final call', async () => {
    const fixture = await createFixture({
      request: { model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'final' }] },
      response: { content: [{ type: 'text', text: 'final answer' }] },
      calls: [
        { request: { marker: 'call-0-request' }, response: { marker: 'call-0-response' } },
        { request: { marker: 'call-1-request' }, response: { marker: 'call-1-response' } },
      ],
      stopReason: 'end_turn',
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    const idx0Request = text.indexOf('call-0-request');
    const idx0Response = text.indexOf('call-0-response');
    const idx1Request = text.indexOf('call-1-request');
    const idx1Response = text.indexOf('call-1-response');
    const idxFinal = text.indexOf('final answer');

    expect(idx0Request).toBeGreaterThan(-1);
    expect(idx0Response).toBeGreaterThan(-1);
    expect(idx1Request).toBeGreaterThan(-1);
    expect(idx1Response).toBeGreaterThan(-1);
    expect(idxFinal).toBeGreaterThan(-1);
    // Chronological reading order: call 0, then call 1, then the final call.
    expect(idx0Request).toBeLessThan(idx1Request);
    expect(idx1Response).toBeLessThan(idxFinal);
  });

  it('renders exactly as before when calls is omitted or empty (regression check)', async () => {
    const fixture = await createFixture({
      request: { model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'hi' }] },
      response: { content: [{ type: 'text', text: 'hello' }] },
      stopReason: 'end_turn',
      usage: { inputTokens: 12, outputTokens: 4 },
      calls: [],
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('claude-sonnet-5');
    expect(text).toContain('"text": "hello"');
    expect(text).toContain('stop_reason: end_turn');
    expect(text).toContain('in 12 / out 4');
  });
});
