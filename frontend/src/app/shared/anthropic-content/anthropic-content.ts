export interface CallPair {
  readonly request: unknown;
  readonly response: unknown;
}

export interface ToolUseBlock {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

export interface ToolActivityEntry {
  readonly name: string;
  readonly status: 'running' | 'done';
  readonly input?: unknown;
  readonly result?: unknown;
  readonly isError?: boolean;
}

/** Joins every `text`-typed content block in a Messages API response into one string. */
export function extractResponseText(response: unknown): string {
  if (typeof response !== 'object' || response === null) {
    return '';
  }
  const { content } = response as Record<string, unknown>;
  if (!Array.isArray(content)) {
    return '';
  }
  let text = '';
  for (const block of content) {
    if (typeof block !== 'object' || block === null) {
      continue;
    }
    const { type, text: blockText } = block as Record<string, unknown>;
    if (type === 'text' && typeof blockText === 'string') {
      text += blockText;
    }
  }
  return text;
}

export function extractToolUses(response: unknown): readonly ToolUseBlock[] {
  if (typeof response !== 'object' || response === null) {
    return [];
  }
  const { content } = response as Record<string, unknown>;
  if (!Array.isArray(content)) {
    return [];
  }
  const uses: ToolUseBlock[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null) {
      continue;
    }
    const { type, id, name, input } = block as Record<string, unknown>;
    if (type === 'tool_use' && typeof id === 'string' && typeof name === 'string') {
      uses.push({ id, name, input });
    }
  }
  return uses;
}

export function extractToolResults(request: unknown): Map<string, { result: unknown; isError: boolean }> {
  const results = new Map<string, { result: unknown; isError: boolean }>();
  if (typeof request !== 'object' || request === null) {
    return results;
  }
  const { messages } = request as Record<string, unknown>;
  if (!Array.isArray(messages)) {
    return results;
  }
  for (const message of messages) {
    if (typeof message !== 'object' || message === null) {
      continue;
    }
    const { content } = message as Record<string, unknown>;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      if (typeof block !== 'object' || block === null) {
        continue;
      }
      const record = block as Record<string, unknown>;
      const toolUseId = record['tool_use_id'];
      if (record['type'] === 'tool_result' && typeof toolUseId === 'string') {
        results.set(toolUseId, { result: record['content'], isError: Boolean(record['is_error']) });
      }
    }
  }
  return results;
}

/** Non-streaming has no live per-tool feed, so once the envelope lands every tool_use/tool_result pair is already resolved and rendered as a `done` entry in one pass. */
export function deriveToolActivityFromCalls(
  calls: readonly CallPair[] | undefined,
  finalCall: CallPair,
): readonly ToolActivityEntry[] {
  const sequence = [...(calls ?? []), finalCall];
  const entries: ToolActivityEntry[] = [];
  for (let i = 0; i < sequence.length; i++) {
    const uses = extractToolUses(sequence[i].response);
    if (uses.length === 0) {
      continue;
    }
    const nextRequest = sequence[i + 1]?.request;
    const results = nextRequest !== undefined ? extractToolResults(nextRequest) : new Map<string, { result: unknown; isError: boolean }>();
    for (const use of uses) {
      const resolved = results.get(use.id);
      entries.push({
        name: use.name,
        status: resolved ? 'done' : 'running',
        input: use.input,
        result: resolved?.result,
        isError: resolved?.isError,
      });
    }
  }
  return entries;
}

export function findLastRunningIndex(activity: readonly ToolActivityEntry[], name: string): number {
  for (let i = activity.length - 1; i >= 0; i--) {
    if (activity[i].name === name && activity[i].status === 'running') {
      return i;
    }
  }
  return -1;
}
