export interface LabCatalogEntry {
  readonly goal: string;
  readonly concepts: readonly string[];
}

// One entry per lab that has in-app documentation, keyed by its FEATURE_ROUTES slug.
export const LAB_CATALOG: Readonly<Record<string, LabCatalogEntry>> = {
  'messages-console': {
    goal: 'Send a multi-turn Messages API call, streamed or non-streamed, with a system prompt and temperature control.',
    concepts: ['Messages API', 'Streaming (Server-Sent Events)', 'System prompts', 'Temperature'],
  },
  'structured-output-console': {
    goal: 'Force a single Messages API reply to conform to a JSON schema and inspect the parsed result.',
    concepts: ['Structured output (output_config)', 'JSON schema'],
  },
  'live-tool-use-console': {
    goal: 'Let Claude choose between two backend-executed tools — real-time weather lookup and GitHub repo stats — across a full tool-use loop, including fine-grained streaming of tool arguments.',
    concepts: ['Custom tool definitions', 'Tool-use/tool-result loop', 'Fine-grained (eager) tool-argument streaming'],
  },
};
