/**
 * Types of `index.mjs`: the undo of one chat turn, shared by the chat card (`tracy-chat-input`) and
 * the Site changes row (`site-tabs`). Contract: `tasks/undo-change/api-contract.md`.
 */

/**
 * Every string key this module hands to `say`. A package that uses it ships each of them in its
 * own namespace, with the same English (`tracy-chat-input` and `tracy-site-tabs` `strings.ts`).
 */
export type TurnUndoKey =
  | 'undo.zone.design'
  | 'undo.zone.function'
  | 'undo.zone.addons'
  | 'undo.zone.content'
  | 'undo.zone.core'
  | 'undo.zone.system'
  | 'undo.zone.other'
  | 'undo.files.one'
  | 'undo.files.other'
  | 'undo.more'
  | 'undo.part.content'
  | 'undo.part.look'
  | 'undo.named.post'
  | 'undo.named.page'
  | 'undo.named.article'
  | 'undo.named.category'
  | 'undo.named.tag'
  | 'undo.named.menu'
  | 'undo.named.menuItem'
  | 'undo.named.module'
  | 'undo.named.templatePart'
  | 'undo.named.template'
  | 'undo.named.media'
  | 'undo.named.setting'
  | 'undo.named.field'
  | 'undo.named.profile'
  | 'undo.named.entry'
  | 'undo.named.any'
  | 'undo.unnamed.post'
  | 'undo.unnamed.page'
  | 'undo.unnamed.postOrPage'
  | 'undo.unnamed.article'
  | 'undo.unnamed.category'
  | 'undo.unnamed.tag'
  | 'undo.unnamed.categoryOrTag'
  | 'undo.unnamed.menu'
  | 'undo.unnamed.menuItem'
  | 'undo.unnamed.module'
  | 'undo.unnamed.templatePart'
  | 'undo.unnamed.template'
  | 'undo.unnamed.media'
  | 'undo.unnamed.setting'
  | 'undo.unnamed.field'
  | 'undo.unnamed.profile'
  | 'undo.unnamed.entry'
  | 'undo.unnamed.item'
  | 'undo.working'
  | 'undo.needsCode'
  | 'undo.needsContent'
  | 'undo.blocked.contentAdmin'
  | 'undo.blocked.contentAdminNoBy'
  | 'undo.blocked.contentTracy'
  | 'undo.blocked.contentTracyNoBy'
  | 'undo.blocked.content'
  | 'undo.blocked.look'
  | 'undo.blocked.files'
  | 'undo.blocked.filesNoList'
  | 'undo.blocked.restored'
  | 'undo.blocked.restoredNoTime'
  | 'undo.blocked.notRecordedFiles'
  | 'undo.blocked.notRecordedContent'
  | 'undo.blocked.notRecordedLook'
  | 'undo.blocked.later'
  | 'undo.blocked.shared'
  | 'undo.blocked.unsealed'
  | 'undo.blocked.built'
  | 'undo.blocked.other'
  | OutcomeKey

export type OutcomeKey =
  | 'undo.result.partial'
  | 'undo.result.partialUnsure'
  | 'undo.result.unsure'
  | 'undo.result.signedOut'
  | 'undo.result.role'
  | 'undo.result.busy'
  | 'undo.result.other'

export type Say = (key: TurnUndoKey, params?: Record<string, string | number>) => string
export interface Words {
  key: TurnUndoKey
  params?: Record<string, string | number>
}

export interface Target {
  kind: string | null
  id: string | null
  title: string | null
}
export interface ContentWrite {
  applyId: string
  action: string
  target: Target | null
  at: string | null
}
export interface LookWrite {
  undo: string
  at: string | null
}
export interface Reason {
  code: string
  [field: string]: unknown
}
export interface Turn {
  turnId: string
  turn: number
  title: string | null
  openedAt: string | null
  closedAt: string | null
  changed: boolean
  files: { count: number; commits: string[]; zones: Record<string, number> }
  content: ContentWrite[]
  /** Its WordPress look writes: the site's Additional CSS, each with its look undo id. */
  look: LookWrite[]
  undo: {
    state: 'available' | 'blocked' | 'undone' | 'none'
    latest: boolean
    reasons: Reason[]
    needs: { code: boolean; content: boolean }
  }
}
/** The site's newest design system apply (`/turns` `designSystem`): site-wide, not the chat's. */
export interface DesignSystemApply {
  applyId: string
  id: string
  name: string | null
  previous: { id: string; name: string | null } | null
  at: string
  by: string | null
  undone: boolean
  /** This seat holds the toolset the undo needs (`code`). */
  canUndo: boolean
}
export interface TurnsAnswer {
  cms: string | null
  siteBusy: boolean
  turns: Turn[]
  /** Absent server field → null. */
  designSystem: DesignSystemApply | null
}

export interface BookEntry {
  status: 'loading' | 'ready' | 'failed'
  answer: TurnsAnswer | null
  signal: string
  startedAt: number
  answerFrom: number
  undoing: boolean
}
export interface TurnsBook {
  get(siteKey: string, sessionId: string): BookEntry | undefined
  mark(): number
  want(siteKey: string, sessionId: string, signal: string): void
  wantSince(siteKey: string, sessionId: string, mark: number): void
  refresh(siteKey: string, sessionId: string): Promise<void>
  begin(siteKey: string, sessionId: string): boolean
  end(siteKey: string, sessionId: string): void
  subscribe(listener: () => void): () => void
}

export type UndoOutcome =
  | { kind: 'done' }
  | { kind: 'partial'; unsure: boolean }
  | { kind: 'refused'; code: string }
  | { kind: 'unsure'; code: string }

export type Action = 'undo' | 'goBack'
export type Card =
  | { kind: 'ready'; turn: Turn; action: Action; later: number }
  | { kind: 'disabled'; turn: Turn; action: Action; note: Words }
  | { kind: 'blocked'; turn: Turn; ask: boolean }
  | { kind: 'emdash'; turn: Turn }
  | { kind: 'undone'; turn: Turn }

export function turnsUrl(siteKey: string, sessionId: string): string
export function readTurnsAnswer(status: number, body: unknown): TurnsAnswer | null
export function createTurnsBook(deps?: { fetchImpl?: typeof fetch }): TurnsBook
export function undoTurn(ask: {
  siteKey: string
  sessionId: string
  turnId: string
  scope: 'turn' | 'from-here'
  idemKey?: string
  fetchImpl?: typeof fetch
  /** Where a done or partial undo is said (`TURN_UNDONE_EVENT`); the page's window by default. */
  target?: EventTarget
}): Promise<UndoOutcome>

/** Said on `window` after an undo took anything back (toolbar contract §3). */
export const TURN_UNDONE_EVENT: 'tracy:turn-undone'
export interface TurnUndone {
  sessionId: string
  siteKey: string
  turnIds: string[]
}
export function readTurnUndone(detail: unknown): TurnUndone | null
export function announceTurnUndone(detail: TurnUndone, target?: EventTarget): void
export function onTurnUndone(listener: (detail: TurnUndone) => void, target?: EventTarget): () => void
export function sameSiteKey(a: unknown, b: unknown): boolean
export function newestUndoOf(
  answer: TurnsAnswer
): { kind: 'turn'; turn: Turn } | { kind: 'design-system'; apply: DesignSystemApply } | null
export const DESIGN_SYSTEM_CHANGED_EVENT: 'tracy:design-system-changed'
export interface DesignSystemChanged {
  siteKey: string
  applyId: string | null
  undone: boolean
}
export function announceDesignSystemChanged(detail: DesignSystemChanged, target?: EventTarget): void
export function onDesignSystemChanged(
  listener: (detail: DesignSystemChanged) => void,
  target?: EventTarget
): () => void
export const SITE_SYNCED_EVENT: 'tracy:site-synced'
export interface SiteSynced {
  siteKey: string
  syncId: string
}
export function announceSiteSynced(detail: SiteSynced, target?: EventTarget): void
export function onSiteSynced(listener: (detail: SiteSynced) => void, target?: EventTarget): () => void
export function undoDesignSystemApply(ask: {
  siteKey: string
  applyId: string
  fetchImpl?: typeof fetch
  target?: EventTarget
}): Promise<
  | { kind: 'done'; worn: { name: string } | null }
  | { kind: 'refused'; code: string }
  | { kind: 'unsure'; code: string }
>
export function outcomeKey(outcome: UndoOutcome): OutcomeKey | null
export function cardOf(answer: TurnsAnswer, n: number): Card | null
export function laterTurns(answer: TurnsAnswer, n: number): Turn[]
export function targetText(target: Target, say: Say, action?: string | null): string
export function whatOf(turn: Turn, say: Say): string
export function putsBackOf(turn: Turn, say: Say): string[]
export function reasonWords(
  reason: Reason | undefined,
  cms: string | null,
  say: Say,
  timeOf?: (iso: string) => string
): Words
