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
  time?: number
}
export type BuildChatStringKey =
  | 'research.title.one'
  | 'research.title.other'
  | 'review.question'
  | 'review.summary'
  | 'review.pages.one'
  | 'review.pages.other'
  | 'review.services.one'
  | 'review.services.other'
  | 'review.approve'
  | 'review.change'
export declare const BUILD_CHAT_STRINGS: Readonly<Record<BuildChatStringKey, string>>
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
export declare function textTooLongOf(
  // biome-ignore lint/suspicious/noExplicitAny: a Contract B question
  question: any,
  item: { id: string; selected: string[]; custom?: string }
): { limit: number; length: number } | null
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
  result: null | 'done' | 'stopped' | 'cancelled'
}
export interface Stopped {
  step: string
  twice: boolean
  writtenPages: number
  siteUnchanged: boolean
  teamNotified: boolean
}
export interface Cancelled {
  siteUnchanged: boolean
  teamNotified: boolean
}
// biome-ignore lint/suspicious/noExplicitAny: a Contract B outcome
export declare function cancelledOf(outcome: any): Cancelled | null
// biome-ignore lint/suspicious/noExplicitAny: a Contract B run
export declare function progressOf(run: { events?: any[]; outcome?: any }): Progress
// biome-ignore lint/suspicious/noExplicitAny: a Contract B outcome
export declare function stoppedOf(outcome: any): Stopped | null
export declare function clockOf(seconds: number): string

export interface PlanChoiceOption {
  value: string
  source: string
  selected: boolean
}
export interface PlanFact {
  id: string
  field: string
  label: string
  value: string
  source: string
  /** Set when the sources disagree on this fact: its values, the website's first. */
  choice: null | { field: string; said: string; options: PlanChoiceOption[] }
}
export type BlockHolds =
  | { services: string[] }
  | { facts: string[]; counts: { kind: string; count: number }[] }
/** One child list of a block as the card shows it; a list planned empty is not on the card. */
export interface BlockList {
  /** The item's label for a list inside an item; absent for a list of the block itself. */
  head?: string
  rows: { label: string; lists?: BlockList[] }[]
}
export interface PlanCard {
  planId: string
  revision: number
  name: string
  facts: PlanFact[]
  language: string
  look: {
    template: string
    accent: string
    accentDark: string | null
    logo: { kind: string; source?: string }
  }
  services: { id: string; field: string; label: string; source: string }[]
  pages: {
    id: string
    name: string
    blocks: { id: string; label: string; reason: string; holds: BlockHolds; lists?: BlockList[] }[]
  }[]
  pictures: { own: { frames: number; from: string[] }; generated: { frames: number; reason?: string } }
  assumptions: { id: string; said: string }[]
  /** One line per distinct thing and reason; `count` when several were left out for the same reason. */
  leftOut: { what: string; kind: string; reason: string; count?: number }[]
  counts: { pages: number; services: number }
}
export interface PlanChange {
  field: string
  value: unknown
}
export interface PlanEdit {
  schema: 'tracy-build-plan-edit/v1'
  id: string
  plan: { id: string; revision: number }
  changes: PlanChange[]
}
type BuildChatT = (key: string, vars?: Record<string, unknown>) => string
// biome-ignore lint/suspicious/noExplicitAny: a Contract B plan
export declare function planCardOf(plan: any): PlanCard
// biome-ignore lint/suspicious/noExplicitAny: a Contract B plan
export declare function planEditOf(plan: any, changes: PlanChange[], id: string): PlanEdit
export declare function planChangeOf(
  field: string,
  current: string | number,
  text: string
): { field: string; value: string | number } | null
/** A build draft as tracy-web's draft doors answer it: the living plan, its last edit, whether one undo is offered. */
export interface PlanDraft {
  // biome-ignore lint/suspicious/noExplicitAny: a Contract B plan
  plan: any
  lastEdit?: PlanEdit | null
  canUndo?: boolean
}
export declare function changedFieldsOf(draft: PlanDraft): string[]
export declare function planReviewRequestOf(
  // biome-ignore lint/suspicious/noExplicitAny: a Contract B plan
  plan: any,
  t?: BuildChatT
): {
  questions: {
    id: string
    question: string
    detail: string
    options: { label: string }[]
    intent: { kind: 'plan-review'; approve: string }
  }[]
}
export declare function approvalOf(
  // biome-ignore lint/suspicious/noExplicitAny: a Contract B plan
  plan: any,
  reply: { answers?: { id: string; selected?: string[] }[] } | null,
  t?: BuildChatT
): { plan: { id: string; revision: number } } | null

export declare const BUILD_TOOL: 'tracy_build'
export declare const PLAN_REVIEW_ID: 'plan-review'
export type BuildToolResult =
  | { kind: 'research'; business: string }
  | { kind: 'templates'; options: TemplateOption[]; none: boolean }
  | { kind: 'plan'; id: string; revision: number }
  | { kind: 'running' | 'stopped' | 'quiet' }
export declare function buildToolResultOf(text: unknown): BuildToolResult | null
export type BuildToolRow =
  | { kind: 'research'; sources: number; business: string }
  | { kind: 'working'; step: string }
  | { kind: 'templates' | 'plan' | 'edit' | 'stopped' }
export declare function buildToolRowOf(rawArgs: unknown, text: string | null): BuildToolRow | null
export interface BuildToolFold {
  calls: Readonly<Record<string, string>>
  templates: { turn: number; seq: number; options: TemplateOption[]; none: boolean } | null
  plan: { turn: number; seq: number; id: string; revision: number } | null
  /** The latest call while it waits: not answered yet, or answered `running`. */
  working: { turn: number; seq: number; step: string } | null
}
// biome-ignore lint/suspicious/noExplicitAny: a dsh session event, duck-typed
export declare function buildToolFoldOf(state: BuildToolFold | undefined, event: any): BuildToolFold
export declare function isPlanReviewRequest(questions: unknown): boolean

export declare const HANDOFF_FENCE: 'tracy-build-handoff'
export declare const HANDOFF_SCHEMA: 'tracy-build-handoff/v1'
export interface HandoffMessage {
  role: 'user' | 'assistant'
  text: string
}
export interface Handoff {
  conversation: HandoffMessage[]
  // biome-ignore lint/suspicious/noExplicitAny: the approved Contract B plan
  plan: any
  site: { siteKey?: string; name?: string } | null
}
export declare function handoffOfText(text: unknown): Handoff | null
// biome-ignore lint/suspicious/noExplicitAny: a dsh session event, duck-typed
export declare function buildHistoryFoldOf(state: HandoffMessage[] | undefined, event: any): HandoffMessage[]
export interface HandoffFold {
  openTurn: number | null
  pending: Handoff | null
  found: { turn: number; handoff: Handoff } | null
}
// biome-ignore lint/suspicious/noExplicitAny: a dsh session event, duck-typed
export declare function handoffFoldOf(state: HandoffFold | undefined, event: any): HandoffFold
