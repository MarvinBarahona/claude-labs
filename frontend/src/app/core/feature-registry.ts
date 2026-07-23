import type { FeatureRoute } from './feature-route';

// Every feature's route, keyed by slug. Array order is the nav render order, by design.
export const FEATURE_ROUTES: readonly FeatureRoute[] = [
  {
    slug: 'home',
    label: 'Home',
    loadComponent: () => import('../home/home').then((m) => m.Home),
  },
  {
    slug: 'messages-console',
    label: 'Messages Console',
    loadComponent: () =>
      import('../messages-console/messages-console').then((m) => m.MessagesConsole),
  },
  {
    slug: 'structured-output-console',
    label: 'Structured Output Console',
    loadComponent: () =>
      import('../structured-output-console/structured-output-console').then(
        (m) => m.StructuredOutputConsole,
      ),
  },
  {
    slug: 'live-tool-use-console',
    label: 'Live Tool-Use Console',
    loadComponent: () =>
      import('../live-tool-use-console/live-tool-use-console').then(
        (m) => m.LiveToolUseConsole,
      ),
  },
  {
    slug: 'document-research-assistant',
    label: 'Document Research Assistant',
    loadComponent: () =>
      import('../document-research-assistant/document-research-assistant').then(
        (m) => m.DocumentResearchAssistant,
      ),
  },
  {
    slug: 'workflow-gallery',
    label: 'Workflow Gallery',
    loadComponent: () =>
      import('../workflow-gallery/workflow-gallery').then(
        (m) => m.WorkflowGallery,
      ),
  },
  {
    slug: 'extended-thinking-bench',
    label: 'Extended Thinking Bench',
    loadComponent: () =>
      import('../extended-thinking-bench/extended-thinking-bench').then(
        (m) => m.ExtendedThinkingBench,
      ),
  },
  {
    slug: 'web-repo-research-reporter',
    label: 'Web & Repo Research Reporter',
    loadComponent: () =>
      import('../web-repo-research-reporter/web-repo-research-reporter').then(
        (m) => m.WebRepoResearchReporter,
      ),
  },
  {
    slug: 'data-code-sandbox',
    label: 'Data & Code Sandbox',
    loadComponent: () =>
      import('../data-code-sandbox/data-code-sandbox').then(
        (m) => m.DataCodeSandbox,
      ),
  },
  {
    slug: 'vision-lab',
    label: 'Vision Lab',
    loadComponent: () =>
      import('../vision-lab/vision-lab').then(
        (m) => m.VisionLab,
      ),
  },
  {
    slug: 'agent-playground',
    label: 'Agent Playground',
    loadComponent: () =>
      import('../agent-playground/agent-playground').then(
        (m) => m.AgentPlayground,
      ),
  },
];
