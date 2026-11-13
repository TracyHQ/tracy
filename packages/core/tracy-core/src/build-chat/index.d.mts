export declare const BUILD_CHAT_PATH: '/new/build'
export declare function isBuildChatSession(sessionId: unknown): boolean
export declare function isBuildChatPage(pathname: string): boolean

export interface ResearchSource {
  name: string
  url: string
  summary: string
  found: string[]
}
export interface ResearchRow {
  title: string
  summary: string
  details: { items: { title: string; subtitle: string; fields: never[]; lines: string[] }[] }
}
export interface AskItem {
  id: string
  question: string
  options: { label: string; description?: string }[]
  multiSelect: false
  recommended?: string
}
export interface BuildAnswer {
  schema: 'tracy-build-answer/v1'
  question: string
  choice?: string
  text?: string
  skipped?: true
}
export interface ReplyData {
  callId: string
  outcome: 'answered'
  questions: { id: string; question: string; options: { label: string }[] }[]
  answers: { id: string; selected: string[]; custom?: string }[]
  text: string
  time: number
}
export declare const BUILD_CHAT_STRINGS: Readonly<
  Record<'research.title.one' | 'research.title.other', string>
>
export declare const MAX_QUESTIONS_AT_ONCE: 3
export declare function researchRowOf(
  research: { summary: string; sources: ResearchSource[] },
  t?: (key: string, vars?: Record<string, unknown>) => string
): ResearchRow
// biome-ignore lint/suspicious/noExplicitAny: Contract B documents are checked by the contract, not typed here
export declare function askRequestOf(questions: any[], answers: any[]): { questions: AskItem[] } | null
export declare function answerOf(
  // biome-ignore lint/suspicious/noExplicitAny: a Contract B question
  question: any,
  item: { id: string; selected: string[]; custom?: string }
): BuildAnswer | null
// biome-ignore lint/suspicious/noExplicitAny: Contract B documents
export declare function replyOf(questions: any[], answers: any[], callId?: string): ReplyData

export interface TemplateOption {
  slug: string
  name: string
  version: string
  picture: string
  reason: string
  quickstart: string
  fits: boolean
  recommended?: boolean
}
export interface TemplateChoice {
  options: TemplateOption[]
  chosen: string | null
  none: boolean
}
export declare function templateChoiceOf(templates: TemplateOption[] | undefined): TemplateChoice
export declare function templateOfChoice(option: TemplateOption): {
  slug: string
  name: string
  version: string
}

export type ProgressState = 'done' | 'running' | 'pending' | 'failed'
export interface ProgressItem {
  id: string
  label: string
  state: ProgressState
  note: null | 'failed' | 'failed-twice' | 'not-started'
}
export interface Progress {
  kind: 'build' | 'partial'
  items: ProgressItem[]
  counts: { done: number; running: number; pending: number; failed: number }
  elapsedSeconds: number
  running: boolean
  result: null | 'done' | 'stopped'
}
export interface Stopped {
  step: string
  twice: boolean
  writtenPages: number
  siteUnchanged: boolean
  teamNotified: boolean
}
// biome-ignore lint/suspicious/noExplicitAny: a Contract B run
export declare function progressOf(run: { events?: any[]; outcome?: any }): Progress
// biome-ignore lint/suspicious/noExplicitAny: a Contract B outcome
export declare function stoppedOf(outcome: any): Stopped | null
export declare function clockOf(seconds: number): string
