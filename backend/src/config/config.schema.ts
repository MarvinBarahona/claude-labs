import { z } from 'zod';

export const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  GITHUB_TARGET_REPO: z.string().min(1).default('angular/angular'),
  GITHUB_TOKEN: z.string().optional(),
  MODEL_DEFAULT: z.string().min(1).default('claude-sonnet-5'),
  MODEL_CLASSIFICATION: z.string().min(1).default('claude-haiku-4-5'),
  MODEL_HARDEST_CALL: z.string().min(1).default('claude-opus-4-8'),
  THINKING_EFFORT_DEFAULT: z
    .enum(['low', 'medium', 'high', 'xhigh', 'max'])
    .default('medium'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
