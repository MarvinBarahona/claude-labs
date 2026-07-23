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
  'document-research-assistant': {
    goal: 'Fetch a real arXiv paper, then answer multi-turn questions about it with source citations, while Claude keeps a running notes file up to date via the text-editor tool.',
    concepts: ['PDF support (document content blocks)', 'Citations', 'Prompt caching', 'Files API', 'Text editor tool'],
  },
  'workflow-gallery': {
    goal: 'Route a real open GitHub issue to a category, chain a draft-then-refine reply, grade it in parallel against several criteria, and loop that feedback back into drafting until it passes or hits a retry cap.',
    concepts: ['Routing', 'Chaining', 'Parallelization', 'Evaluator-optimizer', 'Prompt caching'],
  },
  'web-repo-research-reporter': {
    goal: "Ask a research question about the subject repo or its ecosystem — Claude combines a live web search with a direct call to the public DeepWiki MCP server and returns a structured, cited brief.",
    concepts: ['Web search tool', 'MCP connector', 'Structured output (output_config)'],
  },
  'data-code-sandbox': {
    goal: 'Upload real GitHub issue/commit data through the Files API and have Claude write and run Python in a sandboxed container to analyze it, producing charts and, optionally, a spreadsheet via an Agent Skill.',
    concepts: ['Code execution tool', 'Files API', 'Agent Skills'],
  },
};
