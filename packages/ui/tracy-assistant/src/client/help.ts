/**
 * Help's per-session controller: the questions typed as `/help <text>` in an agent session, their
 * queue, the stream of each answer and the rows that show them in the transcript. It draws nothing
 * (`HelpNode.tsx` draws a row) and touches no browser global except through what it is given, so
 * Node tests drive it with a fake `fetch` and a fake row list.
 *
 * 🔒 NOTHING HERE REACHES THE AGENT. A question goes to tracy-web's `/api/assistant/turns` and the
 * answer comes back into a client-local transcript row; there is no call to the session, its inbox
 * or its composer. The agent's own queue is never read or written.
 *
 * ONE QUESTION AT A TIME, THREE WAITING. tracy-web answers one turn per conversation at a time, so
 * further questions wait here in order. A fourth is refused on screen, never dropped silently.
 */
import { errorKeyOf, type NavLink, takeFrames, type Turn } from './chat.ts'
import type { HelpFile } from './files.ts'
import { reportText, wantsReport, type ReportEnv } from './report.ts'
import type { AssistantKey, Translate } from './strings.ts'

/** The doors Help talks to; root-absolute, answered by tracy-web on every page of the app. */
const API = '/api/assistant'
/** Mirrors `MESSAGE_MAX` in `apps/tracy-web/src/assistant/route.js`. */
export const MESSAGE_MAX = 4000
/** Questions allowed to wait behind the one being answered. */
export const MAX_WAITING = 3
/** The command as typed; the question row shows it back exactly as the person wrote it. */
export const COMMAND = '/help'
/** The transcript row kind the renderer is registered under (`conversation.chat.node`). */
export const HELP_KIND = 'tracy-help'

export type HelpStatus = 'queued' | 'streaming' | 'done' | 'error' | 'stopped'

/** What one transcript row holds. */
export interface HelpData {
  /**
   * `turn`: a question and its answer; `greeting`: the suggested questions after a bare /help on the
   * start screen; `askBack`: the reply to a bare /help once the chat has a transcript (the person's
   * `/help` and one sentence asking what they need); `tip`: the one-time hint.
   */
  variant: 'turn' | 'greeting' | 'askBack' | 'tip'
  /** The session the row belongs to, so its buttons find the controller. */
  sessionId: string
  /** The row's id in the session's local rows. */
  rowId: string
  question: string
  answer: string
  status: HelpStatus
  error?: AssistantKey
  /** The server's id of the answer, once it has one: what a rating is attached to. */
  answerId?: string
  /** The stored question, reused when its answer stream is retried. */
  requestId?: string
  userTurnId?: string
  /** 1 up, -1 down, absent when not rated. */
  rating?: 1 | -1
  /** When the answer finished (epoch ms): the clock of its action row. */
  at?: number
  /** Text to copy onto Discord, built by code when the person asked to report a problem. */
  report?: string
  /** Addresses the answer may link to; anything else in it is drawn as text. */
  links: NavLink[]
  /** Files the question carried (the creation workspace's chat box), stored by tracy-web. */
  files?: HelpFile[]
}

/** The slice of dsh's `chatLocal.for(sessionId)` this file uses. */
export interface LocalRows {
  /**
   * `exchange`: the row is a question or its answer (fork tracy.42), so the answer above it gives up
   * its action row; the tip and the suggestions are not.
   */
  upsert(input: { id: string; kind: string; anchorSeq: number; data: HelpData; exchange?: boolean }): void
  remove(id: string): void
  /** Durable seq of the newest entry of the session's log, -1 when it has none. */
  tailSeq(): number
}

export interface HelpDeps {
  sessionId: string
  /** Suppress the one-time slash-command tip where Help is the default composer. */
  showTip?: () => boolean
  rows: LocalRows
  fetch: typeof fetch
  /** The site the page names, or null. */
  site: () => string | null
  /** The interface translator and the browser facts; both together let a problem report be built. */
  report?: { t: Translate; env: () => Omit<ReportEnv, 'site' | 'sessionId'> }
  /**
   * Whether the session already shows a transcript (the chat has begun). A bare /help then answers
   * like a chat reply instead of drawing the start screen's suggested questions. Absent: never.
   */
  transcriptShown?: () => boolean
  /** The clock, for when an answer finished. Absent: `Date.now`. */
  now?: () => number
  /**
   * The creation workspace (/new/): tracy-web then lists the start actions an answer may offer as
   * text to press (`tracy-action:` links). Absent: never.
   */
  start?: () => boolean
}

export interface HelpController {
  /**
   * `/help <text>`: a question; empty text without files is a bare `/help`. `files` are already
   * stored (`files.ts`); a question may be only files.
   */
  ask(text: string, files?: readonly HelpFile[]): void
  /** Take the suggested-questions row away: the person moved on (a question, or a message to the agent). */
  dropGreeting(): void
  /**
   * Stop everything Help is doing (the chat box's stop button): the answer being written keeps what
   * arrived, and every question still waiting is marked stopped and never sent. The agent is not touched.
   */
  stopAll(): void
  /** Drop a waiting or finished-with-error question. */
  remove(rowId: string): void
  /** Ask a question that failed again, first in line. */
  retry(rowId: string): void
  /**
   * Rate an answer (the row's thumbs, the same pair as an agent reply's); pressing the recorded
   * rating again clears it. Stored by tracy-web's `POST /api/assistant/turns/:id/rating`.
   */
  rate(rowId: string, value: 1 | -1): void
  /** Draw this session's earlier Help turns and, once per account, the tip. */
  restore(): Promise<void>
}

interface Row {
  id: string
  anchorSeq: number
  data: HelpData
}

const registry = new Map<string, HelpController>()

/** The controller of a session, for the buttons of its rows. */
export const controllerOf = (sessionId: string): HelpController | undefined => registry.get(sessionId)

/** The session's controller, created on first use. */
export function helpFor(deps: HelpDeps): HelpController {
  let controller = registry.get(deps.sessionId)
  if (!controller) {
    controller = createHelp(deps)
    registry.set(deps.sessionId, controller)
  }
  return controller
}

/** Forget a session's controller (the session went away). */
export const forgetHelp = (sessionId: string): void => {
  registry.delete(sessionId)
}

export function createHelp(deps: HelpDeps): HelpController {
  const { sessionId, rows } = deps
  const all = new Map<string, Row>()
  const queue: string[] = []
  let running: string | null = null
  let abort: AbortController | null = null
  let stopped = false
  /** After a 429 nothing more is sent until the person retries. */
  let paused = false
  let counter = 0
  let conversationId: string | null = null
  let links: NavLink[] = []
  let restored = false
  /** User turns this controller already knows (streamed here), so a late restore does not draw them twice. */
  const known = new Set<string>()
  let greetingIsLast = false
  const now = deps.now ?? Date.now

  const anchor = (): number => Math.max(0, rows.tailSeq())

  function draw(row: Row): void {
    rows.upsert({
      id: row.id,
      kind: HELP_KIND,
      anchorSeq: row.anchorSeq,
      data: { ...row.data },
      ...(isExchange(row.data) ? { exchange: true } : {})
    })
  }

  function create(
    variant: HelpData['variant'],
    question: string,
    status: HelpStatus,
    error?: AssistantKey
  ): Row {
    const prefix = { turn: 'q', greeting: 'g', askBack: 'a', tip: 'tip' }[variant]
    const id = `${prefix}${++counter}`
    const row: Row = {
      id,
      anchorSeq: anchor(),
      data: {
        variant,
        sessionId,
        rowId: id,
        question,
        answer: '',
        status,
        ...(error ? { error } : {}),
        links
      }
    }
    all.set(id, row)
    draw(row)
    return row
  }

  function patch(row: Row, change: Partial<HelpData>): void {
    row.data = { ...row.data, ...change }
    draw(row)
  }

  function clearRating(row: Row): void {
    const { rating: _gone, ...rest } = row.data
    row.data = rest
    draw(row)
  }

  /** The row's data without its `error` (a retry or a success clears it). */
  function clearError(row: Row, change: Partial<HelpData>): void {
    const { error: _gone, ...rest } = row.data
    row.data = { ...rest, ...change }
    draw(row)
  }

  function dropGreeting(): void {
    greetingIsLast = false
    for (const [id, row] of all) {
      if (row.data.variant !== 'greeting') continue
      all.delete(id)
      rows.remove(id)
    }
  }

  function pump(): void {
    if (running || paused) return
    const next = queue.shift()
    if (next === undefined) return
    void run(all.get(next)!)
  }

  async function run(row: Row, again = false): Promise<void> {
    running = row.id
    stopped = false
    const controller = new AbortController()
    abort = controller
    patch(row, { status: 'streaming', answer: again ? '' : row.data.answer })
    let status: HelpStatus = 'done'
    let error: AssistantKey | undefined
    try {
      const res = await deps.fetch(`${API}/turns`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({
          message: row.data.question,
          ...(conversationId ? { conversationId } : {}),
          ...(row.data.userTurnId ? { retryTurnId: row.data.userTurnId } : {}),
          ...(row.data.requestId ? { requestId: row.data.requestId } : {}),
          site: deps.site(),
          ...(deps.start?.() === true ? { start: true } : {}),
          ...(row.data.files?.length ? { attachments: row.data.files.map((f) => f.id) } : {}),
          session: { id: sessionId, anchorSeq: row.anchorSeq }
        }),
        signal: controller.signal
      })
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { code?: unknown; window?: unknown } | null
        // Another window made a newer conversation current: take its id and ask once more.
        if (res.status === 409 && !again) {
          conversationId = null
          await restoreTurns(true)
          return await run(row, true)
        }
        status = 'error'
        error = errorKeyOf(res.status, body?.code, body?.window) as AssistantKey
        if (res.status === 429) paused = true
      } else {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let finished = false
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const { frames, rest } = takeFrames(buffer)
          buffer = rest
          for (const frame of frames) {
            const data = (frame.data ?? {}) as {
              conversationId?: string
              turnId?: string
              links?: NavLink[]
              text?: string
            }
            if (frame.event === 'meta') {
              if (typeof data.conversationId === 'string') conversationId = data.conversationId
              if (data.turnId) {
                known.add(data.turnId)
                patch(row, { userTurnId: data.turnId })
              }
              if (Array.isArray(data.links) && data.links.length > 0) {
                links = data.links
                patch(row, { links })
              }
            } else if (frame.event === 'delta' && typeof data.text === 'string') {
              patch(row, { answer: row.data.answer + data.text })
            } else if (frame.event === 'done') {
              finished = true
              if (typeof data.turnId === 'string') patch(row, { answerId: data.turnId })
            } else if (frame.event === 'error') {
              status = 'error'
              error = 'error.cut'
            }
          }
        }
        if (!finished && status !== 'error') {
          status = 'error'
          error = 'error.cut'
        }
      }
    } catch {
      if (stopped) status = 'stopped'
      else {
        status = 'error'
        error = row.data.answer ? 'error.cut' : 'error.unavailable'
      }
    }
    if (stopped) {
      status = 'stopped'
      error = undefined
    }
    // The clock of the row's actions: when the answer stopped coming, however it ended.
    if (error) patch(row, { status, error, at: now() })
    else clearError(row, { status, at: now() })
    abort = null
    running = null
    pump()
  }

  async function restoreTurns(force: boolean): Promise<void> {
    if (restored && !force) return
    const res = await deps
      .fetch(
        `${API}/conversation?session=${encodeURIComponent(sessionId)}${deps.start?.() === true ? '&start=1' : ''}`,
        {
          credentials: 'same-origin',
          headers: { accept: 'application/json' }
        }
      )
      .catch(() => null)
    if (!res?.ok) return
    const body = (await res.json().catch(() => null)) as {
      conversationId?: string
      turns?: Turn[]
      links?: NavLink[]
      tipSeen?: boolean
    } | null
    if (!body) return
    restored = true
    if (typeof body.conversationId === 'string') conversationId = body.conversationId
    if (Array.isArray(body.links) && body.links.length > 0) links = body.links
    const turns = Array.isArray(body.turns) ? body.turns : []
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i]!
      if (turn.role !== 'user' || known.has(turn.id)) continue
      known.add(turn.id)
      const replies = turns.filter(
        (candidate) => candidate.role === 'assistant' && candidate.replyToId === turn.id
      )
      const next = turns[i + 1]
      const reply = replies.at(-1) ?? (next?.role === 'assistant' && !next.replyToId ? next : null)
      const id = `t${turn.id}`
      const row: Row = {
        id,
        anchorSeq: Math.max(0, turn.anchorSeq ?? anchor()),
        data: {
          variant: 'turn',
          sessionId,
          rowId: id,
          question: turn.text,
          userTurnId: turn.id,
          answer: reply?.text ?? '',
          ...(reply ? { answerId: reply.id } : {}),
          ...(reply?.rating === 1 || reply?.rating === -1 ? { rating: reply.rating } : {}),
          ...(atOf(reply?.at ?? turn.at) !== undefined ? { at: atOf(reply?.at ?? turn.at) } : {}),
          // A question the server stored without an answer was cut: the stream broke after it. An
          // answer it stored part of says how it ended: stopped, or cut — never read as finished (#206).
          status: !reply || reply.ended === 'cut' ? 'error' : reply.ended === 'stopped' ? 'stopped' : 'done',
          ...(!reply || reply.ended === 'cut' ? { error: 'error.cut' as const } : {}),
          ...(turn.files?.length ? { files: turn.files } : {}),
          links
        }
      }
      all.set(id, row)
      draw(row)
    }
    if (deps.showTip?.() !== false && body.tipSeen === false && turns.length === 0) {
      create('tip', '', 'done')
      void deps.fetch(`${API}/tip/seen`, { method: 'POST', credentials: 'same-origin' }).catch(() => {})
    }
  }

  return {
    ask(text, files = []) {
      const question = text.trim()
      if (question === '' && files.length === 0) {
        // Once the chat has begun, a bare /help is answered like any chat message: the person's
        // `/help`, then one sentence asking what they need. Every time, as a chat would.
        if (deps.transcriptShown?.() === true) {
          dropGreeting()
          const row = create('askBack', '', 'done')
          patch(row, { at: now() })
          return
        }
        // On the start screen: the suggested questions. A second bare /help straight after the first adds nothing.
        if (greetingIsLast) return
        greetingIsLast = true
        create('greeting', '', 'done')
        return
      }
      // A question (typed, or a suggestion pressed) takes the suggestions away.
      dropGreeting()
      // A new question is the person trying again: a limit (429) held the queue, and nothing else
      // would lift it. If the limit still stands the server answers 429 once more and says so.
      paused = false
      if (question.length > MESSAGE_MAX) {
        create('turn', question.slice(0, 200), 'error', 'error.tooLong')
        return
      }
      if (queue.length >= MAX_WAITING) {
        create('turn', question.slice(0, 200), 'error', 'error.queueFull')
        return
      }
      const row = create('turn', question, running === null && !paused ? 'streaming' : 'queued')
      if (files.length > 0) patch(row, { files: [...files], requestId: crypto.randomUUID() })
      if (deps.report && wantsReport(question)) {
        const text = reportText(
          { ...deps.report.env(), site: deps.site(), sessionId },
          question,
          deps.report.t
        )
        patch(row, { report: text })
      }
      queue.push(row.id)
      pump()
    },
    dropGreeting,
    stopAll() {
      // Waiting questions first: the aborted read below settles later and would send the next one.
      for (const id of queue.splice(0)) {
        const row = all.get(id)
        if (row) patch(row, { status: 'stopped' })
      }
      if (running) {
        stopped = true
        abort?.abort()
      }
    },
    remove(rowId) {
      const at = queue.indexOf(rowId)
      if (at >= 0) queue.splice(at, 1)
      if (running === rowId) return
      all.delete(rowId)
      rows.remove(rowId)
    },
    retry(rowId) {
      const row = all.get(rowId)
      if (
        !row ||
        row.data.status !== 'error' ||
        row.data.variant !== 'turn' ||
        (row.data.question === '' && !row.data.files?.length)
      )
        return
      paused = false
      clearError(row, { status: 'queued', answer: '' })
      queue.unshift(rowId)
      pump()
    },
    rate(rowId, value) {
      const row = all.get(rowId)
      const id = row?.data.answerId
      if (!row || !id) return
      const next = row.data.rating === value ? null : value
      const before = row.data.rating
      // Shown at once; put back when the server refuses (the person sees the thumb return).
      if (next === null) clearRating(row)
      else patch(row, { rating: next })
      const putBack = () => {
        if (before) patch(row, { rating: before })
        else clearRating(row)
      }
      void deps
        .fetch(`${API}/turns/${encodeURIComponent(id)}/rating`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rating: next })
        })
        .then((res) => {
          if (!res.ok) putBack()
        })
        .catch(putBack)
    },
    restore: () => restoreTurns(false)
  }
}

/** A stored turn's time as epoch ms, or undefined when the server sent none or a bad one. */
function atOf(at: string | null | undefined): number | undefined {
  if (typeof at !== 'string') return undefined
  const ms = Date.parse(at)
  return Number.isFinite(ms) ? ms : undefined
}

/** A question (answered or not) or the reply to a bare /help: a request of the person and its answer. */
export const isExchange = (d: Pick<HelpData, 'variant'>): boolean =>
  d.variant === 'turn' || d.variant === 'askBack'

/**
 * The text a Help row's action row copies, or null when the row shows no finished answer and so
 * no action row: a question still waiting or being written, a greeting, the tip, or an answer
 * that never got a word (a refusal, a stop before the first word). A stopped or cut answer keeps
 * the words that arrived, as an interrupted agent reply keeps its row.
 * @param t - the interface translator, for the bare /help reply.
 */
export function answerTextOf(d: HelpData, t: Translate): string | null {
  if (d.variant === 'askBack') return t('askBack.text')
  if (d.variant !== 'turn' || d.status === 'queued' || d.status === 'streaming') return null
  return d.answer.trim() === '' ? null : d.answer
}

/**
 * The Help row whose answer is being written, among a session's local rows: what the chat box's
 * stop button stops (`HelpStop.tsx`). One at a time (the queue runs one answer), so the first wins.
 * @param nodes - the session's client-local rows, as dsh's `chatLocal` lists them.
 * @returns the row's id, or undefined when no Help answer is being written.
 */
export function streamingRowOf(nodes: readonly { kind: string; data: unknown }[]): string | undefined {
  for (const node of nodes) {
    if (node.kind !== HELP_KIND) continue
    const data = node.data as Partial<HelpData> | undefined
    if (data?.status === 'streaming' && typeof data.rowId === 'string') return data.rowId
  }
  return undefined
}

/** A start action as a press of it: which step, and the platform it picked. */
export interface StartPress {
  action: 'create' | 'templates' | 'import' | 'business'
  platform?: 'joomla' | 'wordpress' | 'emdash'
}

/**
 * The step a `tracy-action:` address opens (`apps/tracy-web/src/assistant/prompt.js`, `startActions`),
 * or null for an address that is not one: such a link stays plain text.
 */
export function startPressOf(href: string): StartPress | null {
  const m = /^tracy-action:(create|templates|import|business)(?:\?platform=(joomla|wordpress|emdash))?$/.exec(
    href
  )
  if (!m) return null
  const action = m[1] as StartPress['action']
  return m[2] && action === 'create' ? { action, platform: m[2] as StartPress['platform'] } : { action }
}

/**
 * The files the person sent in a session's Help questions, oldest first: what the page offers to a
 * step opened from it (Add site's logo). A question still waiting, or refused before it was stored,
 * sent nothing.
 */
export function sentFilesOf(rows: readonly { kind: string; data: unknown }[], sessionId: string): HelpFile[] {
  const out: HelpFile[] = []
  for (const row of rows) {
    const d = row.data as HelpData | undefined
    if (row.kind !== HELP_KIND || !d || d.sessionId !== sessionId || d.variant !== 'turn' || !d.files)
      continue
    if (d.status === 'queued' || (d.status === 'error' && d.error !== 'error.cut')) continue
    out.push(...d.files)
  }
  return out
}
