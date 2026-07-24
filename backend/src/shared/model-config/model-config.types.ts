/** The single source of truth for valid model tiers — every DTO's `@IsIn()` validates against this instead of redeclaring its own list. */
export const MODEL_TIERS = [
  'default',
  'classification',
  'hardest-call',
] as const;

export type ModelTier = (typeof MODEL_TIERS)[number];
