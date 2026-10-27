/**
 * The one evaluator every surface decides visibility with — `packages/site/tracy-site-build-core/
 * src/questions.mjs`, a JSDoc-typed module. This declaration is the slice of it the Ops screens
 * use; the functions themselves are imported, never copied, so the preview here, the Build form
 * and the server cannot disagree about which question is shown.
 */
declare module '@tracy/site-build-core/questions' {
  export const SCHEMA: 'tracy-questions/v1'
  export const SCHEMA_V2: 'tracy-questions/v2'
  export const KINDS: readonly string[]
  export const FEEDS: readonly string[]
  export function visibleQuestions<Q extends { id: string }>(
    questions: Q[],
    answers: Record<string, unknown> | null | undefined
  ): Q[]
  export function missingRequired(
    questions: { id: string; required?: boolean }[],
    answers: Record<string, unknown> | null | undefined
  ): string[]
  export function effectiveAnswers(
    questions: { id: string }[],
    answers: Record<string, unknown> | null | undefined
  ): Record<string, unknown>
  export function bindingsOf(q: unknown): { consumer: string; target: string }[]
}
