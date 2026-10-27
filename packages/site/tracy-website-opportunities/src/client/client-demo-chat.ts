/** A template press opens its claimed site's chat; only the browser submits the user brief. */
import type { Api } from './api.ts'
import type { DemoAction, DemoChatPreparation } from './outreach-model.ts'

export const CLIENT_CHAT_MODE = 'client-send/1'
export const CLIENT_CHAT_PARAM = 'wo-demo-chat'
const CARRY_KEY = 'tracy:wo-client-chat:v1'
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export interface ChatCarry {
  version: 1
  actions: string[]
  sent: string[]
  firstHref: string | null
}
export interface StorageFace {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
export interface ChatSession {
  getSnapshot(): { removed?: boolean; subagent?: unknown }
  beginSubmission(input: { mode: 'queue'; text: string; attachments: never[] }): {
    requestId: string
    abandon(): void
  }
  prompt(
    content: { type: 'text'; text: string }[],
    mode: 'queue',
    signal?: AbortSignal,
    requestId?: string
  ): Promise<{ ok: boolean }>
}
export interface ChatServices {
  sessions?: {
    list: {
      getSnapshot(): {
        phase?: string
        byId: Record<string, { retainedBy?: Record<string, number> } | undefined>
      }
    }
    binding?(id: string): { session?: ChatSession } | undefined
  }
  get?(name: string): unknown
}

const fail = (code: string): Error => new Error(code)

/** `prepare`'s refusal while the demo's logo research may still answer (tracy-web `logo-research.js`). */
export const LOGO_RESEARCH_PENDING = 'DEMO_LOGO_RESEARCH_PENDING'
const PENDING_POLL_MS = 3_000
// A `retryAt` is trusted inside these bounds only: a skewed clock never spins the loop or parks it for long.
const RETRY_AT_MIN_MS = 500
// Past the server's minute for the research plus a runner poll: a longer wait is a fault, answered as it is.
const PENDING_TRIES = 40

/**
 * 🔒 THE SERVER NEVER HOLDS A REQUEST FOR THE LOGO RESEARCH (product owner, 24/10/2026): a demo whose brief waits
 * for it answers `DEMO_LOGO_RESEARCH_PENDING` at once, so the page asks again until the brief is made. While it
 * asks again, `onLogoWait(true)` lets the page say why it waits; `onLogoWait(false)` once the answer is final.
 * The answer's `retryAt` says when to ask again; without one the page asks every `PENDING_POLL_MS`.
 */
export async function prepareWhenReady(
  api: Pick<Api, 'prepareDemoChat'>,
  actionId: string,
  {
    current,
    wait,
    now = Date.now,
    onLogoWait
  }: {
    current(): boolean
    wait?: (ms: number) => Promise<void>
    now?: () => number
    onLogoWait?: (waiting: boolean) => void
  }
): Promise<Awaited<ReturnType<Api['prepareDemoChat']>>> {
  const pause = wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  let waiting = false
  try {
    for (let tries = 1; ; tries++) {
      const answer = await api.prepareDemoChat(actionId)
      if (answer.ok || answer.code !== LOGO_RESEARCH_PENDING || tries >= PENDING_TRIES || !current())
        return answer
      if (!waiting) onLogoWait?.((waiting = true))
      await pause(pendingDelay(answer.retryAt, now()))
    }
  } finally {
    if (waiting) onLogoWait?.(false)
  }
}
/** Milliseconds before asking again: `PENDING_POLL_MS`, or less when the `retryAt` deadline comes sooner (never under `RETRY_AT_MIN_MS`). */
export function pendingDelay(retryAt: string | undefined, at: number): number {
  const until = retryAt === undefined ? Number.NaN : Date.parse(retryAt)
  if (!Number.isFinite(until)) return PENDING_POLL_MS
  return Math.min(PENDING_POLL_MS, Math.max(RETRY_AT_MIN_MS, until - at))
}
export function readChatCarry(storage?: StorageFace | null): ChatCarry | null {
  try {
    const value = JSON.parse(storage?.getItem(CARRY_KEY) ?? 'null') as ChatCarry | null
    return value?.version === 1 &&
      Array.isArray(value.actions) &&
      value.actions.length <= 100 &&
      value.actions.every((id) => typeof id === 'string' && UUID.test(id)) &&
      Array.isArray(value.sent) &&
      value.sent.every((id) => value.actions.includes(id)) &&
      (value.firstHref === null ||
        (typeof value.firstHref === 'string' &&
          value.firstHref.startsWith('/') &&
          !value.firstHref.startsWith('//')))
      ? value
      : null
  } catch {
    return null
  }
}
function saveCarry(storage: StorageFace | null | undefined, carry: ChatCarry): void {
  // Do not leave a charged batch with no way to continue after its first page load.
  if (!storage) throw fail('CLIENT_CHAT_STORAGE_UNAVAILABLE')
  storage.setItem(CARRY_KEY, JSON.stringify(carry))
}

export function preparedChatHref(prepared: DemoChatPreparation): string {
  const chat = prepared.chat
  if (!chat?.siteKey || !chat.sessionId || prepared.action.chatMode !== CLIENT_CHAT_MODE)
    throw fail('CLIENT_CHAT_INVALID')
  const path = `/${encodeURIComponent(chat.siteKey)}/s/${encodeURIComponent(chat.sessionId)}`
  const url = new URL(chat.href, 'https://workspace.invalid')
  if (url.origin !== 'https://workspace.invalid' || url.pathname !== path) throw fail('CLIENT_CHAT_INVALID')
  return path
}
export function clientChatEntry(prepared: DemoChatPreparation): string {
  const params = new URLSearchParams({
    [CLIENT_CHAT_PARAM]: prepared.action.id,
    'wo-view': 'mine',
    tab: 'tracy:website-opportunities'
  })
  if (prepared.action.opportunityId) params.set('wo-opp', prepared.action.opportunityId)
  return `${preparedChatHref(prepared)}?${params}`
}

export async function startClientDemoChat(
  actions: DemoAction[],
  deps: {
    api: Pick<Api, 'prepareDemoChat'>
    storage: StorageFace | null
    current(): boolean
    open(href: string): void
    wait?: (ms: number) => Promise<void>
    onLogoWait?: (waiting: boolean) => void
  }
): Promise<boolean> {
  const selected = actions.filter((action) => action.chatMode === CLIENT_CHAT_MODE)
  if (!selected.length || selected.some((action) => !UUID.test(action.id))) return false
  const answer = await prepareWhenReady(deps.api, selected[0].id, deps)
  if (!answer.ok) throw fail(answer.code)
  if (!deps.current()) return false
  const prepared = answer.body
  if (prepared.action.id !== selected[0].id) throw fail('CLIENT_CHAT_INVALID')
  const href = clientChatEntry(prepared)
  saveCarry(deps.storage, {
    version: 1,
    actions: selected.map((a) => a.id),
    sent: [],
    firstHref: preparedChatHref(prepared)
  })
  deps.open(href)
  return true
}

export async function waitForChat(
  services: ChatServices,
  sessionId: string,
  deps: {
    current(): boolean
    wait?: () => Promise<void>
    tries?: number
  }
): Promise<ChatSession> {
  const wait = deps.wait ?? (() => new Promise((resolve) => setTimeout(resolve, 100)))
  let opened = false
  for (let attempt = 0; attempt < (deps.tries ?? 300); attempt++) {
    if (!deps.current()) throw fail('CLIENT_CHAT_LEFT')
    const list = services.sessions?.list.getSnapshot()
    const face = services.sessions?.binding?.(sessionId)?.session
    if (list?.phase !== 'pending' && list?.byId[sessionId]) {
      const workspace = services.get?.('uiWorkspace') as { openSession?(id: string): void } | undefined
      if (!opened && (list.byId[sessionId]?.retainedBy?.mainView ?? 0) === 0 && workspace?.openSession) {
        workspace.openSession(sessionId)
        opened = true
      }
      if (face && (list.byId[sessionId]?.retainedBy?.mainView ?? 0) > 0) {
        const snapshot = face.getSnapshot()
        if (snapshot.removed || snapshot.subagent != null) throw fail('CLIENT_CHAT_READ_ONLY')
        if (typeof face.beginSubmission !== 'function' || typeof face.prompt !== 'function')
          throw fail('CLIENT_CHAT_UNAVAILABLE')
        return face
      }
    }
    await wait()
  }
  throw fail('CLIENT_CHAT_UNAVAILABLE')
}

export async function sendClientDemoBrief(
  prepared: DemoChatPreparation,
  deps: {
    api: Pick<Api, 'reserveDemoChatSend'>
    session: ChatSession
    current(): boolean
    signal?: AbortSignal
    hash?: (text: string) => Promise<string>
  }
): Promise<void> {
  preparedChatHref(prepared)
  if (!deps.current() || deps.signal?.aborted) throw fail('CLIENT_CHAT_LEFT')
  if (
    typeof prepared.brief?.text !== 'string' ||
    !prepared.brief.text ||
    !/^[a-f0-9]{64}$/.test(prepared.brief.hash)
  )
    throw fail('CLIENT_CHAT_INVALID_BRIEF')
  // `crypto.subtle` exists only on a secure origin; a laptop stand on plain http has none. There the brief is not
  // re-hashed here: the text sent is this answer's own, and the send door still holds it to the server's hash.
  const subtle = globalThis.crypto?.subtle
  const hash =
    deps.hash ??
    (subtle
      ? async (text: string) =>
          Array.from(new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(text))), (b) =>
            b.toString(16).padStart(2, '0')
          ).join('')
      : null)
  if (hash && (await hash(prepared.brief.text)) !== prepared.brief.hash)
    throw fail('CLIENT_CHAT_CHANGED_BRIEF')
  if (!deps.current() || deps.signal?.aborted) throw fail('CLIENT_CHAT_LEFT')
  // A replay adopts the held native ID without minting another local pending bubble.
  const submission = prepared.submission?.nativeRequestId
    ? { requestId: prepared.submission.nativeRequestId, abandon() {} }
    : deps.session.beginSubmission({ mode: 'queue', text: prepared.brief.text, attachments: [] })
  let dispatched = false
  try {
    const held = await deps.api.reserveDemoChatSend(prepared.action.id, {
      sessionId: prepared.chat.sessionId,
      briefHash: prepared.brief.hash,
      nativeRequestId: submission.requestId
    })
    if (!held.ok) throw fail(held.code)
    const receipt = held.body
    if (
      receipt.action.id !== prepared.action.id ||
      receipt.chat.sessionId !== prepared.chat.sessionId ||
      receipt.chat.siteKey !== prepared.chat.siteKey ||
      receipt.brief.hash !== prepared.brief.hash ||
      receipt.brief.text !== prepared.brief.text ||
      !receipt.submission?.nativeRequestId
    )
      throw fail('CLIENT_CHAT_INVALID_RECEIPT')
    if (!deps.current() || deps.signal?.aborted) throw fail('CLIENT_CHAT_LEFT')
    if (receipt.submission.state === 'observed') {
      submission.abandon()
      return
    }
    const requestId = receipt.submission.nativeRequestId
    if (requestId !== submission.requestId) submission.abandon()
    // These are the same public session methods used by the composer. No server dispatch,
    // synthetic assistant bubble, DOM typing or source-session draft changes are involved.
    dispatched = true
    const answer = await deps.session.prompt(
      [{ type: 'text', text: prepared.brief.text }],
      'queue',
      deps.signal,
      requestId
    )
    if (!answer.ok) throw fail('CLIENT_CHAT_SEND_FAILED')
  } catch (error) {
    // Once dispatch started, the native session owns its pending echo and uncertain receipt.
    if (!dispatched) submission.abandon()
    throw error
  }
}

export interface ClientChatState {
  phase: 'idle' | 'sending' | 'failed' | 'sent'
  actionId?: string
  /** Sending, and its brief still waits for the demo's logo research. */
  logo?: true
  code?: string
  retry?: () => void
}
let state: ClientChatState = { phase: 'idle' }
const listeners = new Set<() => void>()
export const clientChatState = {
  getSnapshot: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }
}
function publish(next: ClientChatState): void {
  state = next
  for (const listener of listeners) listener()
}

export function receiveClientDemoChat(deps: {
  api: Pick<Api, 'prepareDemoChat' | 'reserveDemoChatSend'>
  services: ChatServices
  location: { pathname: string; search: string; hash?: string }
  storage: StorageFace | null
  replaceUrl(url: string): void
  open(href: string): void
  signal?: AbortSignal
  wait?: (ms: number) => Promise<void>
}): (() => void) | void {
  const params = new URLSearchParams(deps.location.search)
  const actionId = params.get(CLIENT_CHAT_PARAM)
  if (!actionId || !UUID.test(actionId)) return
  let active = true
  let busy = false
  const controller = new AbortController()
  const entryPath = deps.location.pathname
  const current = () =>
    active && deps.location.pathname === entryPath && !controller.signal.aborted && !deps.signal?.aborted
  const run = async () => {
    if (busy || !current()) return
    busy = true
    publish({ phase: 'sending', actionId })
    try {
      const answer = await prepareWhenReady(deps.api, actionId, {
        current,
        wait: deps.wait,
        onLogoWait: (waiting) => {
          if (current()) publish({ phase: 'sending', actionId, ...(waiting ? { logo: true as const } : {}) })
        }
      })
      if (!answer.ok) throw fail(answer.code)
      const prepared = answer.body
      if (prepared.action.id !== actionId || preparedChatHref(prepared) !== deps.location.pathname)
        throw fail('CLIENT_CHAT_WRONG_SESSION')
      const session = await waitForChat(deps.services, prepared.chat.sessionId, { current })
      await sendClientDemoBrief(prepared, { api: deps.api, session, current, signal: controller.signal })
      if (!current()) return
      publish({ phase: 'sent', actionId })
      const saved = readChatCarry(deps.storage)
      if (saved?.actions.includes(actionId)) {
        const carry = { ...saved, sent: [...new Set([...saved.sent, actionId])] }
        saveCarry(deps.storage, carry)
        const nextId = carry.actions.find((id) => !carry.sent.includes(id))
        if (nextId) {
          const next = await prepareWhenReady(deps.api, nextId, { current, wait: deps.wait })
          if (!next.ok) throw fail(next.code)
          if (current()) deps.open(clientChatEntry(next.body))
          return
        }
        deps.storage?.removeItem(CARRY_KEY)
        if (carry.firstHref && carry.firstHref !== deps.location.pathname && current()) {
          deps.open(carry.firstHref)
          return
        }
      }
      const rest = new URLSearchParams(deps.location.search)
      rest.delete(CLIENT_CHAT_PARAM)
      deps.replaceUrl(`${deps.location.pathname}${rest.size ? `?${rest}` : ''}${deps.location.hash ?? ''}`)
    } catch (error) {
      if (current())
        publish({
          phase: 'failed',
          actionId,
          code: error instanceof Error ? error.message : 'CLIENT_CHAT_FAILED',
          retry: () => {
            void run()
          }
        })
    } finally {
      busy = false
    }
  }
  void run()
  return () => {
    active = false
    controller.abort()
  }
}
