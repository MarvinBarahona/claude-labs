import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { InspectorCall } from './inspector-call';

interface ContentBlockView {
  readonly type: string;
  readonly json: string;
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function blockType(block: unknown): string {
  if (typeof block === 'object' && block !== null) {
    const { type } = block as Record<string, unknown>;
    if (typeof type === 'string') {
      return type;
    }
  }
  return 'unknown';
}

function eventType(event: unknown): string {
  return blockType(event);
}

@Component({
  selector: 'app-inspector-panel',
  templateUrl: './inspector-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectorPanel {
  readonly call = input.required<InspectorCall>();
  /** Distinguishes multiple instances stacked on one page (e.g. one per comparison run) — every existing single-instance lab keeps the plain default. */
  readonly title = input('Inspector');

  protected readonly requestJson = computed(() => prettyJson(this.call().request));

  protected readonly responseJson = computed(() => {
    const response = this.call().response;
    return response === undefined ? null : prettyJson(response);
  });

  protected readonly streamEvents = computed(() =>
    (this.call().streamEvents ?? []).map((event) => ({ type: eventType(event), json: prettyJson(event) })),
  );

  protected readonly priorCalls = computed(() =>
    (this.call().calls ?? []).map((c, i) => ({
      index: i,
      requestJson: prettyJson(c.request),
      responseJson: prettyJson(c.response),
    })),
  );

  protected readonly contentBlocks = computed<ContentBlockView[]>(() => {
    const response = this.call().response;
    if (typeof response !== 'object' || response === null) {
      return [];
    }
    const { content } = response as Record<string, unknown>;
    if (!Array.isArray(content)) {
      return [];
    }
    return content.map((block) => ({ type: blockType(block), json: prettyJson(block) }));
  });

  protected readonly stopReason = computed(() => this.call().stopReason ?? null);
  protected readonly usage = computed(() => this.call().usage);
  protected readonly cacheWrite = computed(() => this.usage()?.cacheCreationInputTokens ?? 0);
  protected readonly cacheRead = computed(() => this.usage()?.cacheReadInputTokens ?? 0);
}
