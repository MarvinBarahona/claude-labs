/**
 * The data shape every lab feeds the inspector panel. A lab's backend response
 * payload just needs to be shaped consistently enough to populate this — the
 * component itself never special-cases a particular lab or Claude API call type.
 */
export interface InspectorCall {
  /** The raw request body sent to the Claude API, as-is. */
  readonly request: unknown;
  /** The raw response body, once available (absent while a stream is still in flight). */
  readonly response?: unknown;
  /** Raw streaming events, in arrival order, appended incrementally as they come in. */
  readonly streamEvents?: readonly unknown[];
  /** Earlier request/response pairs in a multi-call turn, in chronological order, before the final call above. */
  readonly calls?: readonly { request: unknown; response: unknown }[];
  readonly stopReason?: string | null;
  readonly usage?: InspectorUsage;
}

export interface InspectorUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheCreationInputTokens?: number;
  readonly cacheReadInputTokens?: number;
}
