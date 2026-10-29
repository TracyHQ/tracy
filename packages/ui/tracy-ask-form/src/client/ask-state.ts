/**
 * The ask form tab's state, kept apart from React and from dsh so `node --test` runs it as is:
 * which pending interaction is a question this plugin answers, the customer's drafts, and the
 * controller that opens the tab once per request and says which requests the chat column's
 * PointerCard may claim.
 *
 * 🔒 THE POINTER CARD CLAIMS ONLY WHAT THE FORM HOLDS. The chat column's question card is dsh's
 * until the Questions tab actually opened for that request. When the side card refuses the tab
 * (the operator's switch, the viewer's own setting), the request is never `taken`, so dsh's card
 * keeps asking it — the customer is never left with a pointer to a tab that does not exist.
 */

import {
  type AskDraft,
  type AskForm,
  type DshAnswer,
  type DshAnswerMode,
  type DshQuestionItem,
  fromDsh,
  toDshAnswer
} from '../../../../site/tracy-site-build-core/src/client/ask-form/model.ts'

/**
 * A pending `ask_user_question` request as this plugin reads it: the slice of dsh's
 * `PendingQuestion` (`ui-user-questions/src/client/contract/slots.ts`) it uses. Declared here
 * rather than imported: the class is not exported (only its type is), and a type import would make
 * this plugin depend on a dsh client package for nothing but a shape.
 */
export interface PendingAsk {
  readonly kind: 'question'
  readonly key: string
  readonly sessionId: string
  readonly questions: readonly DshQuestionItem[]
  answer(answer: DshAnswer): Promise<void>
  /** A forwarded request may acquire a new answer channel after reconnecting. */
  getSnapshot?(): { readonly channel: 'waterfall' | 'rpc' | 'none' }
  subscribe?(listener: () => void): () => void
}

/** `uiSession.sessionStatus` (`ui-session/src/client/index.ts`), as far as this plugin reads it. */
export interface SessionStatusSource {
  getSnapshot(): ReadonlyMap<string, { readonly pendingInteraction?: unknown } | undefined>
  subscribe(listener: () => void): () => void
}

/** The better-sidebar service, as far as this plugin calls it. */
export interface SidebarFace {
  getSnapshot(): { sessionId: string | undefined }
  subscribeState(listener: () => void): () => void
  isTabEnabled(id: string): boolean
  openTab(seed: { type: string }, scope?: { sessionId: string }): void
  closeTab(tabId: string): void
  openTabsOf(type: string): readonly { id: string }[]
}

/**
 * dsh's own right column (`ctx.sidebarRight`, `ui-sidebar-right/src/client/service.ts`), as far as
 * this plugin closes tabs in it. Needed beside the side card's `openTabsOf`: that answers only from
 * the side card's records, and a record exists only while the tab's body is mounted. With the
 * operator's switch off the side card's tab policy refuses the type, so the side card unregisters
 * it from dsh, no body mounts, and a Questions tab restored from the saved layout (or named by
 * `?tab=`) has no record — `openTabsOf` answers nothing and dsh draws "Nothing here can view this
 * kind of content yet." in its place. dsh's inventory still lists that tab, and dsh can close it.
 */
export interface NativeColumn {
  /** Every session's open tabs, saved layouts included; fires when a tab opens or closes. */
  openTabs?: {
    getSnapshot?(): readonly { sessionId: string; tabId: string; kind: string }[]
    subscribe(listener: () => void): () => void
  }
  /** Close a tab of any session whose layout dsh has adopted (not on the public face; probed). */
  closeIn?(sessionId: string, tabId: string): void
  /** Close a tab of the mounted session. */
  close?(tabId: string): void
  mounted?: { getSnapshot(): string | undefined }
  /** The active tab of the active pane: the tab to return to once a question is answered. */
  active?(): { id: string; kind: string } | undefined
  /** Focus a tab and the pane holding it; a missing tab is left alone. */
  focus?(tabId: string): void
}

/** `uiSwitches()` of `@tracy/core/ui-switches`, as far as this plugin reads it. */
export interface SwitchesFace {
  ready: Promise<unknown>
  isShown(id: string): boolean
  subscribe(listener: () => void): () => void
}

/**
 * The pending interaction as a question this plugin answers, or null. Narrowed by shape (the
 * public discriminator `kind === 'question'` and an `answer` verb), never `instanceof`: the class
 * lives in another bundle. A plan review is dsh's own decision card: its `kind` says so, and a
 * request carrying the `plan-review` intent that dsh did not narrow is left to dsh too.
 */
export function questionOf(pending: unknown): PendingAsk | null {
  if (pending === null || typeof pending !== 'object') return null
  const p = pending as Partial<Record<keyof PendingAsk, unknown>>
  if (p.kind !== 'question') return null
  if (typeof p.answer !== 'function' || typeof p.key !== 'string' || typeof p.sessionId !== 'string')
    return null
  if (!Array.isArray(p.questions)) return null
  const items = p.questions as readonly { intent?: { kind?: unknown } }[]
  if (items.some((q) => q?.intent?.kind === 'plan-review')) return null
  return pending as PendingAsk
}

/** FNV-1a, 32 bits, from a given basis: enough to tell two question sets of one session apart. */
function fnv1a(text: string, basis: number): string {
  let hash = basis >>> 0
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * What a request asks, as a short stable digest: each question's id, its text and its options'
 * labels, in order. The same set asked again hashes the same in every page load.
 */
export function questionsDigest(questions: readonly DshQuestionItem[]): string {
  const text = JSON.stringify(questions.map((q) => [q.id, q.question, (q.options ?? []).map((o) => o.label)]))
  return fnv1a(text, 0x811c9dc5) + fnv1a(text, 0x050c5d1f)
}

/**
 * One request's identity across sessions AND across page loads: drafts and the open ledger are
 * keyed by it.
 *
 * 🔒 NEVER `pending.key`. dsh keys a request the Host forwarded without a `wait` (Tracy's
 * `ask_user_question` is one) as `question:<random per page load>:<counter>`
 * (`ui-user-questions/src/client/contract/slots.ts`), so a draft stored under it was never found
 * again after a reload (e2e-dev 04/10, F4). The session and what the request asks are the same in
 * every load.
 */
export function takeKey(pending: Pick<PendingAsk, 'sessionId' | 'questions'>): string {
  return `${pending.sessionId}\u0000ask-${questionsDigest(pending.questions)}`
}

/**
 * The PointerCard's chain selector for one set of claimed requests. Pure on the owner props: the
 * set is a frozen snapshot closed over at registration, and a new set is a new registration.
 */
export function pointerSelect(
  taken: ReadonlySet<string>
): (owner: { pendingInteraction?: unknown }) => PendingAsk | null {
  return ({ pendingInteraction }) => {
    const pending = questionOf(pendingInteraction)
    return pending !== null && taken.has(takeKey(pending)) ? pending : null
  }
}

/** The form a request is drawn as. */
export function formOf(pending: PendingAsk): AskForm {
  return fromDsh(pending.questions)
}

/**
 * Answer a request through dsh's own verb. `submit` carries no `action` (an older reader takes a
 * missing one as submit); the other two say what the customer asked for in `action`, never in the
 * text of an answer.
 */
export function answerPending(
  pending: PendingAsk,
  form: AskForm,
  draft: AskDraft,
  mode: DshAnswerMode
): Promise<void> {
  try {
    return pending.answer(toDshAnswer(form, draft, mode))
  } catch (error) {
    return Promise.reject(error)
  }
}

const EMPTY_DRAFT: AskDraft = Object.freeze({}) as AskDraft

/** The slice of the Web Storage API the drafts use (`sessionStorage` in a page). */
export interface DraftStorage {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Prefix of a draft's storage key: `tracy-ask-form:<sessionId>:ask-<questions digest>`. */
export const DRAFT_STORAGE_PREFIX = 'tracy-ask-form:'

/** A request's storage key (`takeKey` joins session and request with a NUL a key cannot carry). */
export function draftStorageKey(id: string): string {
  return DRAFT_STORAGE_PREFIX + id.replace('\u0000', ':')
}

/** The page's `sessionStorage`, or null where reading it throws (a private window, blocked storage). */
function pageStorage(): DraftStorage | null {
  try {
    return (globalThis as { sessionStorage?: DraftStorage }).sessionStorage ?? null
  } catch {
    return null
  }
}

/** A stored draft, or null when the value is not one (another writer, a hand edit, a new shape). */
function parseDraft(raw: string | null): AskDraft | null {
  if (raw === null) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const out: AskDraft = {}
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null || typeof entry !== 'object') return null
    const { selected, custom } = entry as { selected?: unknown; custom?: unknown }
    if (!Array.isArray(selected) || !selected.every((v) => typeof v === 'string')) return null
    if (custom !== undefined && typeof custom !== 'string') return null
    out[id] = custom === undefined ? { selected: [...selected] } : { selected: [...selected], custom }
  }
  return out
}

/** The customer's drafts by request (`takeKey`): page memory, mirrored to the tab's session storage. */
export interface Drafts {
  get(id: string): AskDraft
  set(id: string, draft: AskDraft): void
  clear(id: string): void
  /**
   * Called with the requests pending right now: a draft whose request was pending in this page and
   * no longer is (answered, aborted, replaced) goes, from memory and from storage. A stored draft
   * this page has not yet seen pending is kept — on a reload the sessions' requests arrive after
   * the first pass, and dropping it then is exactly the lost draft this storage is for.
   */
  retain(live: ReadonlySet<string>): void
  subscribe(listener: () => void): () => void
}

/**
 * The drafts. They survive a reload of the tab (`sessionStorage`, per browser tab, gone with it),
 * and every storage read and write is guarded: where storage is unavailable or full the drafts
 * simply live in page memory, as before.
 */
export function createDrafts(storage: DraftStorage | null = pageStorage()): Drafts {
  const drafts = new Map<string, AskDraft>()
  /** Requests seen pending in this page (or typed into, which only a pending one can be). */
  const seen = new Set<string>()
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) listener()
  }
  const read = (id: string): AskDraft | null => {
    try {
      return parseDraft(storage?.getItem(draftStorageKey(id)) ?? null)
    } catch {
      return null
    }
  }
  const write = (id: string, draft: AskDraft) => {
    try {
      storage?.setItem(draftStorageKey(id), JSON.stringify(draft))
    } catch {
      // Full or refused: the draft stays in page memory.
    }
  }
  const remove = (id: string) => {
    try {
      storage?.removeItem(draftStorageKey(id))
    } catch {
      // Nothing to do: an unreadable storage holds nothing this page can bring back.
    }
  }
  return {
    get(id) {
      const known = drafts.get(id)
      if (known !== undefined) return known
      // Cached, a miss included, so `useSyncExternalStore` reads one stable value.
      const stored = read(id) ?? EMPTY_DRAFT
      drafts.set(id, stored)
      return stored
    },
    set(id, draft) {
      drafts.set(id, draft)
      seen.add(id)
      write(id, draft)
      notify()
    },
    clear(id) {
      const had = drafts.get(id)
      drafts.delete(id)
      seen.delete(id)
      remove(id)
      if (had !== undefined && had !== EMPTY_DRAFT) notify()
    },
    retain(live) {
      let changed = false
      for (const id of live) seen.add(id)
      for (const id of seen) {
        if (live.has(id)) continue
        seen.delete(id)
        remove(id)
      }
      for (const [id, draft] of drafts) {
        if (live.has(id)) continue
        drafts.delete(id)
        if (draft !== EMPTY_DRAFT) changed = true
      }
      if (changed) notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

/** What the composer entry reads: whether the switch is on, and the requests the form holds. */
export interface AskSnapshot {
  readonly enabled: boolean
  readonly taken: ReadonlySet<string>
}

export interface AskController {
  getSnapshot(): AskSnapshot
  subscribe(listener: () => void): () => void
  readonly drafts: Drafts
  /** Start following the sources; returns the disposer. */
  start(): () => void
}

const NOTHING: ReadonlySet<string> = new Set()
const OFF: AskSnapshot = Object.freeze({ enabled: false, taken: NOTHING })

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

/**
 * Follow the sessions' pending requests, the side card's session and the operator's switch:
 * - nothing happens before the switches are read (`ready`), so a switch the operator turned off
 *   never flashes the tab open;
 * - switch on: a question pending on the session the side card shows opens the tab, once per
 *   request; it counts as `taken` only when the side card allowed the open;
 * - switch off: nothing is taken, and every Questions tab still open (restored from an earlier
 *   visit or from the address) is closed, in the side card and in dsh's own column — the tab policy
 *   only stops new opens; the open ledger is cleared, so turning the switch on again opens the
 *   tab for a question still pending;
 * - a request that is no longer pending leaves the ledger and its draft goes.
 */
export function createAskController({
  status,
  sidebar,
  switches,
  tabId,
  switchId,
  column = () => undefined,
  drafts = createDrafts()
}: {
  status: SessionStatusSource
  sidebar: SidebarFace
  switches: SwitchesFace
  tabId: string
  switchId: string
  /** dsh's right column, probed on every pass: the service can arrive after this plugin. */
  column?: () => NativeColumn | undefined
  drafts?: Drafts
}): AskController {
  const listeners = new Set<() => void>()
  const opened = new Set<string>()
  // Drafts survive a reload by question text; live calls still have separate dsh identities.
  const requests = new Map<string, string>()
  /** Per opened request: its session, and the tab that was active before the Questions tab opened. */
  const origins = new Map<string, { sessionId: string; returnTo: string | undefined }>()
  let snapshot: AskSnapshot = OFF
  let known = false
  let syncing = false
  let again = false

  const publish = (next: AskSnapshot) => {
    if (next.enabled === snapshot.enabled && sameSet(next.taken, snapshot.taken)) return
    snapshot = next
    for (const listener of listeners) listener()
  }

  const step = () => {
    const enabled = switches.isShown(switchId)
    const live = new Map<string, PendingAsk>()
    for (const entry of status.getSnapshot().values()) {
      const pending = questionOf(entry?.pendingInteraction)
      if (pending !== null) live.set(takeKey(pending), pending)
    }
    const liveIds = new Set(live.keys())
    const settled: { sessionId: string; returnTo: string | undefined }[] = []
    for (const [id, request] of requests) {
      const pending = live.get(id)
      if (pending?.key === request) continue
      requests.delete(id)
      if (pending === undefined) continue
      // An immediate replacement with the same questions must not keep the old busy form,
      // selected consent or open-once entry, even when no empty status was observed between calls.
      opened.delete(id)
      drafts.clear(id)
      const origin = origins.get(id)
      origins.delete(id)
      if (origin !== undefined) settled.push(origin)
    }
    for (const [id, pending] of live) requests.set(id, pending.key)
    for (const id of opened) {
      if (liveIds.has(id)) continue
      opened.delete(id)
      const origin = origins.get(id)
      origins.delete(id)
      if (origin !== undefined) settled.push(origin)
    }
    drafts.retain(liveIds)

    if (!enabled) {
      for (const tab of sidebar.openTabsOf(tabId)) sidebar.closeTab(tab.id)
      closeInColumn()
      opened.clear()
      origins.clear()
      publish(OFF)
      return
    }
    // An answered (or withdrawn) request takes its tab with it, and the person lands back on the
    // tab they were looking at before the question opened (Akemi, 21/10/2026).
    for (const origin of settled) closeAndReturn(origin)
    const sessionId = sidebar.getSnapshot().sessionId
    const entry = sessionId === undefined ? undefined : status.getSnapshot().get(sessionId)
    const pending = questionOf(entry?.pendingInteraction)
    if (pending !== null && !opened.has(takeKey(pending)) && sidebar.isTabEnabled(tabId)) {
      try {
        const before = activeTab()
        sidebar.openTab({ type: tabId }, { sessionId: pending.sessionId })
        opened.add(takeKey(pending))
        origins.set(takeKey(pending), {
          sessionId: pending.sessionId,
          returnTo: before === undefined || before.kind === tabId ? undefined : before.id
        })
      } catch {
        // Not opened: dsh's card keeps the request.
      }
    }
    publish({ enabled: true, taken: new Set(opened) })
  }

  /** The column's active tab, or undefined when the column (or its verb) is not there. */
  const activeTab = (): { id: string; kind: string } | undefined => {
    try {
      return column()?.active?.()
    } catch {
      return undefined
    }
  }

  /** Close one session's Questions tab and focus the tab that was active before it opened. */
  const closeAndReturn = ({ sessionId, returnTo }: { sessionId: string; returnTo: string | undefined }) => {
    const right = column()
    const tabs = right?.openTabs?.getSnapshot?.()
    try {
      if (tabs === undefined) {
        for (const tab of sidebar.openTabsOf(tabId)) sidebar.closeTab(tab.id)
      } else {
        for (const tab of tabs) {
          if (tab.kind !== tabId || tab.sessionId !== sessionId) continue
          if (right?.closeIn !== undefined) right.closeIn(tab.sessionId, tab.tabId)
          else if (right?.mounted?.getSnapshot() === sessionId) right?.close?.(tab.tabId)
        }
      }
      if (returnTo !== undefined && right?.mounted?.getSnapshot() === sessionId) right?.focus?.(returnTo)
    } catch {
      // Nothing to close or focus any more: the person closed it, or the seat went away.
    }
  }

  /** Close what dsh's column still holds of the type (see `NativeColumn`). */
  const closeInColumn = () => {
    const right = column()
    const tabs = right?.openTabs?.getSnapshot?.() ?? []
    for (const tab of tabs) {
      if (tab.kind !== tabId) continue
      try {
        if (right?.closeIn !== undefined) right.closeIn(tab.sessionId, tab.tabId)
        else if (right?.mounted?.getSnapshot() === tab.sessionId) right?.close?.(tab.tabId)
      } catch {
        // No seat for that session yet: its layout is closed when dsh adopts it (`openTabs` fires).
      }
    }
  }

  // Closing or opening a tab notifies the side card's state synchronously, which calls back in
  // here: run once more after the current pass instead of re-entering it.
  const sync = () => {
    if (!known) return
    if (syncing) {
      again = true
      return
    }
    syncing = true
    try {
      // Bounded: an open that throws after notifying must not spin the page.
      for (let pass = 0; pass < 3; pass++) {
        again = false
        step()
        if (!again) break
      }
    } finally {
      syncing = false
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    drafts,
    start() {
      let alive = true
      const stops = [status.subscribe(sync), sidebar.subscribeState(sync), switches.subscribe(sync)]
      // dsh's column inventory: a session's saved layout is adopted when its seat mounts, after this
      // plugin started. Followed from the first pass that finds the service.
      let columnFollowed = false
      const followColumn = () => {
        if (columnFollowed || !alive) return
        const tabs = column()?.openTabs
        if (tabs === undefined) return
        columnFollowed = true
        stops.push(tabs.subscribe(sync))
      }
      stops.push(sidebar.subscribeState(followColumn), status.subscribe(followColumn))
      // The switches answer once; an unreadable answer leaves their defaults, which count too.
      const onReady = () => {
        if (!alive) return
        known = true
        followColumn()
        sync()
      }
      void switches.ready.then(onReady, onReady)
      return () => {
        alive = false
        known = false
        for (const stop of stops) stop()
        publish(OFF)
      }
    }
  }
}
