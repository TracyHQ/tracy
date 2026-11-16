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
  | 'tool.research.one'
  | 'tool.research.other'
  | 'review.question'
  | 'review.summary'
  | 'review.pages.one'
  | 'review.pages.other'
  | 'plan.count.service.one'
  | 'plan.count.service.other'
  | 'review.approve'
  | 'review.change'
export declare const BUILD_CHAT_STRINGS: Readonly<Record<BuildChatStringKey, string>>
/** The English question words said by code (`ask.*` of the `tracy-build-chat` namespace). */
export type AskStringKey = `ask.${string}`
export declare const ASK_STRINGS: Readonly<Record<AskStringKey, string>>
/** A translator of the question words: the text in the interface language, or null for a key it does not hold. */
export type AskWords = (key: string, vars?: Record<string, unknown>) => string | null
export declare function localizedAskOf(
  ask: { questions: AskItem[] },
  // biome-ignore lint/suspicious/noExplicitAny: Contract B questions
  questions: any[],
  words: AskWords,
  language: string
): { questions: AskItem[] }
export declare function sentChoiceIdOf(
  // biome-ignore lint/suspicious/noExplicitAny: a Contract B question
  question: any,
  sent: string[],
  label: unknown
): string | null
export declare const MAX_QUESTIONS_AT_ONCE: 3
export declare const TEAM_SEES_SAY: string
export declare const FAULT_SAY: string
export declare const UNCHANGED_SAY: string
export declare const DESIGN_CHANGE_SAY: string
export declare const BUILD_LOCKED_SAY: string
export declare const BUILD_DONE_SAY: string
export declare function nameTooLongSay(limit: number): string
export declare function answerTooLongSay(limit: number): string
export declare function requestTooLongSay(limit: number): string
export declare function researchRowOf(
  research: { summary: string; sources: ResearchSource[] },
  t?: (key: string, vars?: Record<string, unknown>) => string
): ResearchRow
// biome-ignore lint/suspicious/noExplicitAny: Contract B documents are checked by the contract, not typed here
export declare function askRequestOf(questions: any[], answers: any[]): { questions: AskItem[] } | null
export declare function answerOf(
  // biome-ignore lint/suspicious/noExplicitAny: a Contract B question
  question: any,
  item: { id: string; selected: string[]; custom?: string; choice?: string }
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
  /** What a pick sends, as the plan holds it. */
  value: string
  /** How the value reads on the card (character references decoded). */
  text: string
  source: string
  /** The source's origin code (`website`, `google`, `social`, `answer`), or null. */
  sourceKind: string | null
  selected: boolean
}
export interface PlanFact {
  id: string
  field: string
  /** The data kind (`business.name`, `contact.phone`), or null. */
  kind: string | null
  label: string
  value: string
  source: string
  /** The source's origin code (`website`, `google`, `social`, `answer`), or null. */
  sourceKind: string | null
  /** Set when the sources disagree on this fact: its values, the website's first. */
  choice: null | { field: string; said: string; options: PlanChoiceOption[] }
  /** The value as the owner reads it, written by code (opening hours); `value` stays what an edit changes. */
  display?: string
  /** The display's stable code (`opening_hours`) and its parameters. */
  code?: string
  params?: Record<string, unknown>
}
/** A stable text code and its parameters, beside the English text it stands for. */
export interface PlanTextCode {
  code?: string
  params?: Record<string, unknown>
}
export type BlockHolds =
  | { services: string[] }
  | { facts: string[]; factKinds: (string | null)[]; counts: { kind: string; count: number }[] }
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
    logo: { kind: string; source?: string; code?: string; sourceKind?: string }
  }
  services: { id: string; field: string; label: string; source: string; sourceKind: string | null }[]
  pages: {
    id: string
    name: string
    blocks: {
      id: string
      label: string
      labelCode?: string
      reason: string
      holds: BlockHolds
      lists?: BlockList[]
    }[]
  }[]
  pictures: {
    own: { frames: number; from: string[]; fromKinds?: string[] }
    generated: { frames: number; reason?: string } & PlanTextCode
  }
  assumptions: ({ id: string; said: string } & PlanTextCode)[]
  /** One line per distinct thing and reason; `count` when several were left out for the same reason. */
  leftOut: { what: string; kind: string; reason: string; count?: number; code?: string; params?: Record<string, unknown> }[]
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
  /** Where the plan's accent and logo came from; a logo the machine drew from the owner's logo says `drawn-from-logo`. */
  lookSources?: {
    accent?: { from: string; name?: string }
    logo?: { from: string; name?: string; reason?: string }
  } | null
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
/** The plan review's fixed answer values: never shown, never translated. */
export declare const PLAN_REVIEW_APPROVE: 'Approve'
export declare const PLAN_REVIEW_CHANGE: 'Change the plan'
/** The id of the plan review of one plan revision: `plan-review:<plan id>:<revision>`. */
export declare function planReviewIdOf(plan: { id: string; revision: number }): string
/** The plan revision a plan review id names, or null. */
export declare function planOfReviewId(id: unknown): { id: string; revision: number } | null
/** The plan revision the answered review named, when the answer is Approve; null for anything else. */
export declare function approvalOf(
  reply: { answers?: { id: string; selected?: string[] }[] } | null
): { plan: { id: string; revision: number } } | null

export declare const BUILD_TOOL: 'tracy_build'
export declare const PLAN_REVIEW_ID: 'plan-review'
/** What a change request did, in the plan step's own English lines: what changed and what was not done and why. */
export interface RevisionNote {
  changed: string[]
  notDone: { what: string; why: string }[]
  /** The values an `edit` call of the agent changed; the card says each in its own words. */
  edits?: { field: string; value: string | number }[]
  /**
   * The stable code of each line, parallel to `changed` and `notDone` (null for a line the model wrote), so the card
   * can say a coded line in its own words. Absent when the plan step sent no codes.
   */
  codes?: {
    changed: (string | null)[]
    notDone: (string | null)[]
    /** The parameters of each changed line's code, one to one with `changed`; absent when the step sent none. */
    changedParams?: (Record<string, unknown> | null)[]
    /** The parameters of each not done line's code, one to one with `notDone`. */
    notDoneParams?: (Record<string, unknown> | null)[]
    /** The refusal kind of every not done line (`no_recipe`, `no_data`, ...), also one the model wrote. */
    notDoneReasons?: (string | null)[]
  }
}
/** Plan text with its HTML character references decoded, as text only (never HTML). */
export declare function plainTextOf<T>(text: T): T
export type BuildToolResult =
  | { kind: 'research'; business: string }
  | { kind: 'templates'; options: TemplateOption[]; none: boolean }
  | { kind: 'plan'; id: string; revision: number; revised?: RevisionNote }
  | { kind: 'stopped'; step?: string; rerun: boolean }
  | { kind: 'running' | 'quiet' }
export declare function buildToolResultOf(text: unknown): BuildToolResult | null
/** The note of a change request answer's `revision`, its lines and their codes side by side; null for no object. */
export declare function revisedOf(value: unknown): Omit<RevisionNote, 'edits'> | null
export type BuildToolRow =
  | { kind: 'research'; sources: number; business: string }
  | { kind: 'working'; step: string }
  | { kind: 'templates' | 'plan' | 'edit' | 'stopped' }
export declare function buildToolRowOf(rawArgs: unknown, text: string | null): BuildToolRow | null
export interface BuildToolFold {
  calls: Readonly<Record<string, string>>
  templates: { turn: number; seq: number; options: TemplateOption[]; none: boolean } | null
  plan: { turn: number; seq: number; id: string; revision: number; revised?: RevisionNote } | null
  /** The latest call while it waits: not answered yet, or answered `running`. */
  working: { turn: number; seq: number; step: string } | null
  /** The latest stop while no call has been made since: whether the step may be rerun, and how many retries of it in a row stopped again. */
  stop: StopSeen | null
  streak: { step: string; count: number } | null
  /** The latest call that asked for the build: the build run feed reads again from it. */
  build: { turn: number; seq: number; callId: string } | null
  /** What each `edit` call asked to change, by call id. */
  edits?: Readonly<Record<string, { field: string; value: string | number }[]>>
}
export interface StopSeen {
  turn: number
  seq: number
  step: string
  rerun: boolean
  retries: number
}
/** The one fixed message the Try again button sends as the owner. */
export declare const RETRY_MESSAGE: 'Please try again.'
/** How many times the owner may press Try again for the same step in a row. */
export declare const MAX_STEP_RETRIES: 2
export declare function canRetryStop(stop: StopSeen | null | undefined): boolean
// biome-ignore lint/suspicious/noExplicitAny: a dsh session event, duck-typed
export declare function buildToolFoldOf(state: BuildToolFold | undefined, event: any): BuildToolFold
export declare function isPlanReviewRequest(questions: unknown): boolean

export declare const HANDOFF_FENCE: 'tracy-build-handoff'
export declare const HANDOFF_SCHEMA: 'tracy-build-handoff/v1'
export declare const HANDOFF_SOURCE: 'build-handoff'
export interface HandoffMessage {
  role: 'user' | 'assistant'
  text: string
}
export interface Handoff {
  conversation: HandoffMessage[]
  // biome-ignore lint/suspicious/noExplicitAny: the approved Contract B plan
  plan: any
  site: { siteKey?: string; name?: string } | null
  requestId: string | null
}
export declare function handoffOfText(text: unknown): Handoff | null
export declare function withoutHandoff(text: unknown): string
// biome-ignore lint/suspicious/noExplicitAny: a dsh session event, duck-typed
export declare function buildHistoryFoldOf(state: HandoffMessage[] | undefined, event: any): HandoffMessage[]
export interface HandoffFold {
  openTurn: number | null
  pending: Handoff | null
  found: { turn: number; handoff: Handoff } | null
}
// biome-ignore lint/suspicious/noExplicitAny: a dsh session event, duck-typed
export declare function handoffFoldOf(state: HandoffFold | undefined, event: any): HandoffFold
