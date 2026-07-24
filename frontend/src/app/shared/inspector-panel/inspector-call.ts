/** The data shape every lab feeds the inspector panel — a lab's backend response just needs to be shaped consistently enough to populate this. */
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

/** The inspector's initial state before any call has been made — shared so every lab starts from the same empty value. */
export const NO_CALL_YET: InspectorCall = { request: null };
