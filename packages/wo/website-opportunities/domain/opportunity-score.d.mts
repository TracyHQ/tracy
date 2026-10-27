// Types of opportunity-score.mjs for the TypeScript client, which imports it by relative path.
export type Grade = 'A' | 'B' | 'C'
export type ScoreReason = [key: string, points: number | null, params?: Record<string, unknown>]
export interface Score {
  score: number
  grade: Grade
  pending: boolean
  reasons: ScoreReason[]
}

export function scoreOpportunity(input?: {
  candidate?: object
  siteCheck?: object | null
  /** The freshest post across the place's social pages, an ISO timestamp. */
  social?: { lastPostAt?: string | null } | null
  status?: string
  slowSiteThreshold?: number
  now?: Date
}): Score

export interface ScoringEvidence {
  candidate: Record<string, any>
  siteCheck: Record<string, any> | null
  social: { lastPostAt?: string | null } | null
  slowSiteThreshold: number
  now: Date
}
export interface ScoringRule {
  id: string
  weight: number
  holdsScore?: boolean
  score(
    evidence: ScoringEvidence
  ): { points: number | null; reason: string; params?: Record<string, unknown> } | null
}
export const BUILT_IN_SCORING_RULES: readonly ScoringRule[]
export function defineScoringRule(rule: ScoringRule): Readonly<ScoringRule>
export function scoringRules(rules?: readonly ScoringRule[]): readonly ScoringRule[]
export function scoreWithRules(
  rules: readonly ScoringRule[],
  input?: Parameters<typeof scoreOpportunity>[0]
): Score
