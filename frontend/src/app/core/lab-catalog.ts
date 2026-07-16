export interface LabCatalogEntry {
  readonly goal: string;
  readonly concepts: readonly string[];
}

// Populated by the write-lab-doc skill, one entry per graduated lab keyed by its FEATURE_ROUTES slug.
export const LAB_CATALOG: Readonly<Record<string, LabCatalogEntry>> = {
  'messages-console': {
    goal: 'Send a multi-turn Messages API call, streamed or non-streamed, with a system prompt and temperature control.',
    concepts: ['Messages API', 'Streaming (Server-Sent Events)', 'System prompts', 'Temperature'],
  },
  'structured-output-console': {
    goal: 'Force a single Messages API reply to conform to a JSON schema and inspect the parsed result.',
    concepts: ['Structured output (output_config)', 'JSON schema'],
  },
};
