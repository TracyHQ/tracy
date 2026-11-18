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
export declare const RESEARCH_READ_SAY: string
export declare const SAY_STRINGS: Readonly<Record<'say.researchRead', string>>
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
  /** Kept on the card although no page shows it (a left out entry reports it): marked as not on the site. */
  offSite?: true
}
/** A fact as the review parts of the card name it. */
export interface PlanFactRef {
  id: string
  kind: string | null
  label: string
  value: string
}
/** A section as the review parts of the card name it. */
export interface PlanSectionRef {
  id: string
  label: string
  labelCode?: string
}
/** Where a fact is shown: the page, the section, and whether that section is a footer. */
export interface PlanPlace {
  page: string
  pageName: string
  section: PlanSectionRef
  footer: boolean
}
/** One page as the card reviews it (#575): its intent for the writer, its sections, what the owner can take off. */
export interface PlanReviewPage {
  id: string
  name: string
  removable: boolean
  lock: string | null
  keyMessage?: string
  visitorQuestion?: string
  seo: { searchTerms: string[]; titleIntent?: string; descriptionIntent?: string; ownerAdded: string[] } | null
  sections: (PlanSectionRef & {
    type: string
    library?: true
    message?: string
    carries: { id: string; label: string }[]
    end: boolean
    removable: boolean
    items: { id: string; kind: string; label: string; removable: boolean }[]
    facts: PlanFactRef[]
  })[]
}
/** What the owner took off at this review, one line per removal. */
export interface PlanRemovedLine {
  removal: string
  what: string
  kind: string
  dataKind?: string | null
  details: number
  restorable: boolean
}
/** The review parts of the plan card (#575): intent, reach, shared parts, pages, not on the site, sources, later. */
export interface PlanReviewParts {
  keyMessages: {
    id: string
    label: string
    field: string
    carriedBy: { page: string; pageName: string; blocks: PlanSectionRef[] }[]
  }[]
  reach: {
    primary: (PlanFactRef & { places: PlanPlace[] })[]
    ends: { page: string; pageName: string; section: PlanSectionRef; facts: PlanFactRef[] }[]
    channels: (PlanFactRef & { places: PlanPlace[]; footerPages: number; removable: boolean })[]
  }
  site: { menu: string[]; header: PlanFactRef[]; footer: PlanFactRef[]; privacyLink: boolean }
  sitePages: PlanReviewPage[]
  standard: {
    privacy: { page: string | null; facts: PlanFactRef[] } | null
    notFound: { leadsTo: string[] } | null
  }
  notOnSite: {
    removed: PlanRemovedLine[]
    /** Each group with its lines, as indexes into the card's `leftOut`. */
    groups: { group: string; lines: number[] }[]
    /** The picture spots of people the template has and nothing fills. */
    peopleSpots: number
  }
  sources: {
    kind: string
    facts: PlanFactRef[]
    shownFacts: PlanFactRef[]
    items: { kind: string; got: number; shown: number }[]
  }[]
  later: { code: string; what: string; reason: string; params: Record<string, unknown> }[]
  /** No locks were answered (an older server): nothing is offered for removal but key messages and later entries. */
  locked: boolean
}
export declare const NOT_ON_SITE_GROUPS: readonly string[]
/** The draft's plan review (#575), as `GET /api/build-draft` answers it. */
export interface PlanReview {
  count: number
  canRevert: boolean
  removals: { id: string; op: string; target: Record<string, string> }[]
  locks?: {
    pages: Record<string, string>
    blocks: Record<string, string>
    facts: Record<string, string>
    minItems: Record<string, number>
  } | null
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
export interface PlanCard extends PlanReviewParts {
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
    /** Only when the draft's `lookSources` were given: what the card needs to show the business's look (#575). */
    brand?: {
      logo: {
        light: PlanLookPicture | null
        dark: PlanLookPicture | null
        from: string | null
        name: string | null
      }
      favicon: PlanLookPicture | null
      accent: {
        from: string | null
        name: string | null
        said: string | null
        code?: string
        params?: Record<string, unknown>
      }
    }
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
      /** Kept from general knowledge of the owner's trade (Contract B `basis: "trade"`). */
      trade?: true
      lists?: BlockList[]
    }[]
  }[]
  pictures: {
    /** `frames`: the picture spots the owner's photos fill; `photos`: the owner's photos the plan holds. */
    own: { frames: number; photos: number; from: string[]; fromKinds?: string[] }
    generated: { frames: number; reason?: string } & PlanTextCode
  }
  assumptions: ({ id: string; said: string } & PlanTextCode)[]
  /** One line per distinct thing and reason; `count` when several were left out for the same reason. */
  leftOut: {
    what: string
    kind: string
    reason: string
    count?: number
    code?: string
    params?: Record<string, unknown>
    /** The data kind of the items the line counts (`quote`, `gallery`...): the card says "3 reviews" in its words. */
    dataKind?: string
    /** The data kind of the fact the line names (`contact.hours`): the card says its label in its words. */
    factKind?: string
    /** The names of the template's pages left out for this line's reason, in plan order (site content). */
    pages?: string[]
    /** The other reasons the items of this line's kind were left out for. */
    also?: { reason: string; code?: string; params?: Record<string, unknown> }[]
  }[]
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
  changes?: PlanChange[]
  operation?: PlanOperation
}
/** One structured operation of the plan card (#575). */
export type PlanOperation =
  | { op: 'remove-page'; page: string }
  | { op: 'remove-block'; page: string; block: string }
  | { op: 'remove-item'; page: string; block: string; item: string }
  | { op: 'remove-key-message'; message: string }
  | { op: 'remove-channel'; fact: string }
  | { op: 'remove-later'; later: string }
  | { op: 'restore'; removal: string }
  | { op: 'revert' }
type BuildChatT = (key: string, vars?: Record<string, unknown>) => string
/** A picture the brand step kept with the draft, named by its draft picture id. */
export interface PlanLookPicture {
  picture: string
  mime?: string
}
export declare function planCardOf(
  // biome-ignore lint/suspicious/noExplicitAny: a Contract B plan
  plan: any,
  options?: { lookSources?: PlanDraft['lookSources']; review?: PlanReview | null }
): PlanCard
// biome-ignore lint/suspicious/noExplicitAny: a Contract B plan
export declare function planEditOf(plan: any, changes: PlanChange[], id: string): PlanEdit
// biome-ignore lint/suspicious/noExplicitAny: a Contract B plan
export declare function planOperationOf(plan: any, operation: PlanOperation, id: string): PlanEdit
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
  /** The owner's review on the plan card (#575): changes counted, parts that can come back, the kit's locks. */
  review?: PlanReview | null
  /** Where the plan's accent and logo came from; a logo the machine drew from the owner's logo says `drawn-from-logo`. */
  lookSources?: {
    accent?: { from: string; name?: string }
    logo?: { from: string; name?: string; reason?: string; pictured?: boolean }
    /** The pictures the brand step kept with the draft (#575): the logo on each ground and the site icon. */
    pictures?: { logoLight?: PlanLookPicture; logoDark?: PlanLookPicture; favicon?: PlanLookPicture }
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
/** One link the owner gave the research, and what became of it (#609). */
export interface LinkRead {
  name: string
  state: 'reading' | 'choice' | 'read' | 'failed'
  reason?: string
  facts?: number
  pictures?: number
  /** Every picture the link gave, set aside ones too, when more than the ones the site may use (`pictures`). */
  picturesFound?: number
  /** None of the pictures found is usable, only because the business did not post them. */
  picturesNotOwn?: boolean
  picturesLost?: number
  picturesNotKept?: boolean
}
export type LinkReadKey =
  | 'links.reading'
  | 'links.choice'
  | 'links.failed'
  | 'links.failedWhy'
  | 'links.read'
  | 'links.readNothing'
  | 'links.readPicturesLost'
  | 'links.readPicturesNotKept'
  | 'links.facts.one'
  | 'links.facts.other'
  | 'links.pictures.one'
  | 'links.pictures.other'
  | 'links.pictures.none'
  | 'links.pictures.someLost'
  | LinkFoundKey
export type LinkFoundKey =
  | 'links.pictures.foundSome'
  | 'links.pictures.foundNotOwn.one'
  | 'links.pictures.foundNotOwn.other'
  | 'links.pictures.foundNone.one'
  | 'links.pictures.foundNone.other'
export declare const LINK_READ_STRINGS: Readonly<Record<Exclude<LinkReadKey, LinkFoundKey>, string>>
export declare const LINK_FOUND_STRINGS: Record<LinkFoundKey, string>
export declare function linkNameOf(link: string): string
export declare function linkReadsOf(value: unknown): LinkRead[]
export declare function readingLinksOf(links: unknown): LinkRead[]
export declare function linkLineOf(
  line: LinkRead,
  t: (key: LinkReadKey, vars?: Record<string, string | number>) => string
): string
export type BuildToolResult =
  | { kind: 'research'; business: string; links: LinkRead[] }
  | { kind: 'templates'; options: TemplateOption[]; none: boolean }
  | { kind: 'plan'; id: string; revision: number; revised?: RevisionNote }
  | { kind: 'stopped'; step?: string; rerun: boolean; reason?: string; retryAt?: string; paused?: true }
  | { kind: 'running'; links: LinkRead[] }
  | { kind: 'choosing'; links: LinkRead[] }
  | { kind: 'quiet' }
export declare function buildToolResultOf(text: unknown): BuildToolResult | null
/** The note of a change request answer's `revision`, its lines and their codes side by side; null for no object. */
export declare function revisedOf(value: unknown): Omit<RevisionNote, 'edits'> | null
export type BuildToolRow =
  | { kind: 'research'; sources: number; business: string; links: LinkRead[] }
  | { kind: 'working'; step: string; links: LinkRead[] }
  | { kind: 'waiting'; links: LinkRead[] }
  | { kind: 'templates' | 'plan' | 'edit' | 'stopped' }
export declare function buildToolRowOf(rawArgs: unknown, text: string | null): BuildToolRow | null
export interface BuildToolFold {
  calls: Readonly<Record<string, string>>
  /** The language the cards use, as the latest answer named it (`chatLanguage`); absent until one does. */
  language?: string
  templates: { turn: number; seq: number; options: TemplateOption[]; none: boolean; language?: string } | null
  plan: {
    turn: number
    seq: number
    id: string
    revision: number
    revised?: RevisionNote
    language?: string
  } | null
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
  /** Why it stopped, when the engine named a reason (`try-later`, `cancelled`, ...). */
  reason?: string
  /** A stop on a limit: when the owner may try again (ISO time). */
  retryAt?: string
  /** A start refused for its limit: nothing ran. */
  paused?: true
  /** The language the cards use, when the answer named one. */
  language?: string
}
/** The stop card at the end of the build chat: why, and whether Try again is offered now, later or not at all. */
export interface StopCard {
  step: string
  /** A stop on a limit: the card says when the owner may try again. */
  limit: boolean
  retryAt: string | null
  retry: 'offered' | 'waiting' | 'none'
}
export declare function stopCardOf(seen: {
  stop?: StopSeen | null
  // biome-ignore lint/suspicious/noExplicitAny: the engine door's state, duck-typed
  engine?: any
  now?: number
}): StopCard | null
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
