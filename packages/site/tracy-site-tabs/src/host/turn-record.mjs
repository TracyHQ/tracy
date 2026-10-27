/**
 * The chat-turn record kept by the host's one dsh (plan `tasks/todo-site-changes.md` §6, Q2), kept
 * apart from `index.ts` so a test can hold it.
 *
 * A TURN, NOT AN IDLE. Before this, the moment was recorded when the agent went idle, titled with the
 * last thing typed. One idle can close several turns — a follow-up typed while the agent works runs
 * as the next turn before the agent idles (dsh `agent.ts`, `while (await this.turn())`) — so two
 * prompts became one moment under the second prompt's words (P0 `turn-id.md` §4.1). Now:
 *
 *   - OPEN (`agent/pre-step`): the first message in the turn that a person typed, stamped by the
 *     password gate with their address, opens `<session id>:<turn>` — `POST /turn`, so the host seals
 *     what was dirty BEFORE the turn before the agent's first edit. Since 09/10 the step does not wait
 *     for it: the agent's first call that may WRITE the site waits instead ({@link callMayWriteSite},
 *     `writeReady`), so the model's first step and its reads overlap the seal. Another person's message
 *     in the same turn (a steer) marks it `steered`, sent after the open; the key stays the turn. The
 *     close waits for both, so the doors still hear open → steer → close, in that order.
 *   - CLOSE (`agent/turn-stopping`, a serial hook that runs before the next turn starts): `POST
 *     /moment` with the turn id commits the turn's files under it. Bounded: at most `attempts` tries
 *     within `timeoutMs` — past that the turn ends anyway and the row goes stale on the server.
 *   - SWEEP (idle): a turn that ended aborted, errored or blocked never reaches `turn-stopping`; the
 *     session log's `turn/end` says it ended, and its close is sent then.
 *   - HOLD (option A, David 10/10/2026, ledger L31): a close the host is still committing when its door
 *     answers (202) goes on after the next turn starts, and that moment commits whatever is dirty when
 *     it runs — the next turn's first edit included, under the earlier turn's name (uiweekwp 09/10: a
 *     moment ended 20 s after the next turn opened). The open's answer names such moments
 *     (`momentsPending`); the next turn's first write then waits until tracy-web says each has ended
 *     (`POST /moment/wait`, asked in the background from the open's answer on, so a moment that ended
 *     meanwhile costs the write nothing), or until {@link MOMENT_HOLD_MS} — then it goes, and tracy-web
 *     is told so (`release`), so the turns that moment may mix are marked rather than silently wrong.
 *     Reads and the model's own steps never wait for it.
 *
 * A failure to open or close never fails the turn: the person's edit matters more than its label.
 *
 * THE ANSWER (plan `tasks/todo-open-conversation.md` §C). The close carries Tracy's answer for the
 * turn — `reply` + `replyState`, see {@link replyOf} — so every seat of the site can read what Tracy
 * said back in Site changes; the session itself opens only for the person who typed. Only the
 * `text` blocks of the turn's last assistant message that has any: tool calls, tool results and
 * reasoning never leave the host.
 */
import { contentRequest } from './moment.mjs'
import { tokenUsageOf } from './token-usage.mjs'
// The one grammar of a Browser-tab comment turn (contract H5 of plan "comment multi-pin").
import { parseCommentTurn } from '../../../../ui/tracy-chat-input/src/client/comment-turn.mjs'

/**
 * A comment turn in the NUMBERED form (Send to Tracy, several comments, a reply): its numbers are
 * the `site_request` numbers the Apply door checks `comment: n` against, so the Site changes tab can
 * link the turn to its comment by `(session, n)`. The one-comment form carries a placeholder `n: 1`
 * and names no request — nothing is sent for it. Same heads as `comment-turn.mjs` (`NUMBERED_HEAD`,
 * `PAGE_HEAD`).
 */
const NUMBERED = /(?:^|\n)```tracy-(?:element\n<mentioned-element|page\n<page) n="/

/**
 * What opens a turn: the first message in `messages` that a PERSON typed (`source.kind: 'user'`)
 * and the gate stamped with an address. Machine notices, injected context and a gate master account
 * with no address open nothing. Null when there is none.
 * @param {readonly unknown[] | undefined} messages - the messages a step claimed.
 * `requestCut`: the title is the person's words cut at the cap (the turn door cannot tell: what it
 * receives is already within its own cap).
 * @returns {{ email: string, title: string, source: 'panel' | 'comment', promptMessageId: string | null,
 *   rpcId: string | null, commentNs?: number[], requestCut?: true } | null}
 */
export function openingOf(messages) {
  for (const message of Array.isArray(messages) ? messages : []) {
    const m = /** @type {{ id?: unknown, content?: unknown, source?: any } | null} */ (message)
    const source = m?.source
    if (source?.kind !== 'user') continue
    const email = source?.prompter?.email
    if (typeof email !== 'string' || email === '') continue
    const { title, cut } = contentRequest(m?.content)
    if (title === '') continue
    const text = textOf(m?.content)
    const comment = parseCommentTurn(text)
    const commentNs = comment && NUMBERED.test(text) ? [...new Set(comment.items.map((item) => item.n))] : []
    return {
      email,
      title,
      source: comment ? 'comment' : 'panel',
      promptMessageId: typeof m?.id === 'string' ? m.id : null,
      rpcId: typeof source.rpcId === 'string' ? source.rpcId : null,
      ...(commentNs.length > 0 ? { commentNs } : {}),
      ...(cut ? { requestCut: /** @type {const} */ (true) } : {})
    }
  }
  return null
}

/** The most of an answer one close sends; tracy-web cuts again and keeps at most this much. */
export const REPLY_MAX = 2000

/**
 * A fenced code block (``` or ~~~, to its closing fence or the end of the text) — a file or a
 * dump pasted into an answer is not what a teammate reads the history for, and not what should be
 * copied out of the session.
 */
const CODE_FENCE = /(^|\n)[ \t]*(```|~~~)[^\n]*\n[\s\S]*?(?:\n[ \t]*\2[ \t]*(?=\n|$)|$)/g

/**
 * Tracy's answer for `turn`, from the session's events: the `text` blocks of the LAST
 * `assistant/message` of that turn that has any text (the answer — the narration between tool
 * steps before it is left out), code blocks replaced by "[code]", cut at {@link REPLY_MAX}
 * characters between words with "…". `replyState`: `truncated` when cut, `interrupted` when the
 * turn was cancelled mid-answer (the words delivered so far), else `full`. Null when the turn has
 * no text at all.
 * @param {readonly { type?: string, data?: any }[] | undefined} events
 * @param {number} turn
 * @returns {{ reply: string, replyState: 'full' | 'truncated' | 'interrupted' } | null}
 */
export function replyOf(events, turn) {
  let last = null
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type !== 'assistant/message' || event.data?.turn !== turn) continue
    const content = event.data?.message?.content
    const text = (Array.isArray(content) ? content : [])
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n\n')
      .trim()
    if (text !== '') last = { text, interrupted: event.data?.interrupted === true }
  }
  if (last === null) return null
  const plain = last.text
    .replace(CODE_FENCE, (_, lead) => `${lead}[code]`)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (plain === '') return null
  const chars = [...plain]
  if (chars.length <= REPLY_MAX)
    return { reply: plain, replyState: last.interrupted ? 'interrupted' : 'full' }
  const room = chars.slice(0, REPLY_MAX).join('')
  const space = room.search(/\s\S*$/)
  const kept = (space > 0 ? room.slice(0, space) : chars.slice(0, REPLY_MAX - 1).join('')).replace(
    /[\s,.;:]+$/,
    ''
  )
  return { reply: `${kept}…`, replyState: 'truncated' }
}

/** The `turn/end` reason kinds dsh writes (`@deepseek-ai/dsh-session` `TurnEndReasonMap`). */
export const END_REASONS = Object.freeze([
  'completed',
  'aborted',
  'blocked',
  'error',
  'max-tokens',
  'interrupted'
])

/**
 * HOW the turn ended, read off its own `turn/end` in the session's events (ADR 0025 § Failed turns): the
 * reason's `kind` (`error` is a model failure such as "DeepSeek Messages transport failed"; `aborted` a
 * cancel; `blocked`), or a bare reason word an older log wrote. Null when the log holds no `turn/end`
 * for `turn` yet, or names a kind dsh does not write — then the close sends none and tracy-web keeps
 * what it knew. The comment picker counts a send into an `error`/`aborted`/`blocked` turn as not sent.
 * @param {readonly { type?: string, data?: any }[] | undefined} events
 * @param {number} turn
 * @returns {string | null}
 */
export function endReasonOf(events, turn) {
  let reason = null
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type !== 'turn/end' || event.data?.turn !== turn) continue
    const raw = event.data?.reason
    const kind = typeof raw === 'string' ? raw : raw?.kind
    reason = typeof kind === 'string' && END_REASONS.includes(kind) ? kind : null
  }
  return reason
}

/**
 * Whether a `tool/result` answered a failure: the error flag, or — the common case — an ordinary answer
 * whose JSON says `ok: false`. 🔒 The flag alone answers zero: a site door's refusal comes back with
 * `isError: false` (measured 17/09, `scripts/measure/session-metrics.mjs`). Only the TOP level of the
 * answer counts: a list of items, one of them `ok: false`, is a successful read.
 * @param {{ data?: any }} event
 */
function resultFailed(event) {
  const message = event?.data?.message ?? {}
  if (message.isError === true) return true
  const content = Array.isArray(message.content) ? message.content : []
  const text = content
    .map((/** @type {any} */ part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
  if (!text.trimStart().startsWith('{')) return false
  try {
    return JSON.parse(text)?.ok === false
  } catch {
    return false
  }
}

/**
 * What `turn` took, read off the session's events (plan `tasks/todo-do-dung-that.md` U1): its steps
 * (`step/start`), its tool calls (`tool/call`), and the calls whose answer was a failure. Null when the
 * log holds none of the turn's steps yet — then the close sends none and tracy-web keeps what it knew.
 * @param {readonly { type?: string, data?: any }[] | undefined} events
 * @param {number} turn
 * @returns {{ steps: number, calls: number, failedCalls: number } | null}
 */
export function workOf(events, turn) {
  let steps = 0
  let calls = 0
  let failedCalls = 0
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.data?.turn !== turn) continue
    if (event.type === 'step/start') steps += 1
    else if (event.type === 'tool/call') calls += 1
    else if (event.type === 'tool/result' && resultFailed(event)) failedCalls += 1
  }
  if (steps === 0) return null
  return { steps, calls, failedCalls: Math.min(failedCalls, calls) }
}

/**
 * HOW a turn is ending, at `agent/turn-stopping` — where `endReasonOf` can never answer.
 *
 * 🔒 dsh runs that hook BEFORE it appends the turn's `turn/end` (`agent-loop` `agent.ts`), so the log
 * the hook reads holds no reason yet, and a close sent from it carried none: `site_turn.end_reason`
 * stayed NULL for every finished turn and every `max-tokens` one (review 09/10/2026). The hook only
 * fires for the two endings a step can give, `completed` and `max-tokens`, and dsh keeps
 * `max-tokens` sticky across the turn's steps — so this reads the `finish` chunk of each of the
 * turn's `assistant/message` streams and answers `max-tokens` if any step stopped on the ceiling.
 * A `turn/end` already in the log (an older caller, a test) still wins.
 * @param {readonly { type?: string, data?: any }[] | undefined} events
 * @param {number} turn
 * @returns {'completed' | 'max-tokens' | string}
 */
export function stoppingReasonOf(events, turn) {
  const logged = endReasonOf(events, turn)
  if (logged !== null) return logged
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type !== 'assistant/message' || event.data?.turn !== turn) continue
    for (const record of Array.isArray(event.data?.stream) ? event.data.stream : []) {
      const chunk = record?.chunk ?? record
      if (chunk?.type === 'finish' && chunk.reason?.kind === 'max-tokens') return 'max-tokens'
    }
  }
  return 'completed'
}

/** What turns of this conversation the person undid from the chat, as `POST /turn` names them. */
/** @typedef {{ turn: number, title: string, complete: boolean }} UndoneTurn */

/** The most undone turns one notice names (tracy-web sends no more). */
export const UNDONE_MAX = 5

/**
 * Whether the open of `turn` may answer any undone turn, i.e. whether the step must wait for it.
 *
 * `undone` names turns of THIS conversation on this site, older than the one opening, stamped since
 * the previous one opened (tracy-web `undoneSince`: `turn < $3`). dsh numbers a session's turns from
 * 1 and the number survives a restart (`turnBoundary.lastTurn`), so turn 1 has no older turn and its
 * answer is empty by construction: nothing in it can reach the agent, and the step need not wait. Any
 * later turn may carry the notice, so its step waits for the open exactly as before — the agent reads
 * the same messages either way. A turn number that is not a positive integer is treated as "may".
 * @param {unknown} turn
 * @returns {boolean}
 */
export function openMayNameUndone(turn) {
  return !(Number.isInteger(turn) && /** @type {number} */ (turn) <= 1)
}

/**
 * The `undone` list of a `POST /turn` answer, read defensively: an older tracy-web sends none, and
 * anything that is not a list of `{turn, title, complete}` is dropped, never trusted.
 * @param {unknown} body
 * @returns {UndoneTurn[]}
 */
export function undoneOf(body) {
  const list = /** @type {{ undone?: unknown } | null} */ (body)?.undone
  if (!Array.isArray(list)) return []
  const out = []
  for (const item of list) {
    const t = /** @type {{ turn?: unknown, title?: unknown, complete?: unknown } | null} */ (item)
    if (!Number.isInteger(t?.turn) || typeof t?.title !== 'string') continue
    out.push({
      turn: /** @type {number} */ (t.turn),
      title: t.title.slice(0, 200),
      complete: t.complete === true
    })
    if (out.length === UNDONE_MAX) break
  }
  return out
}

/** Which notice this is, on the message source (`producer`, as tracy-site-tools' `noticeSource`). */
export const TURN_UNDONE_PRODUCER = 'tracy-site-tabs:turn-undone'
/** The notice source kind every Tracy notice carries (tracy-site-tools `SITE_NOTICE_KIND`). */
const SITE_NOTICE_KIND = 'tracy-site'

/**
 * The agent-only notice that the person undid earlier requests of this conversation from the chat.
 * The undo ran as this conversation, so the site-changed notice stays silent, and without this the
 * agent read the reverted site as changed by nobody (06/10/2026: "something on your side may be
 * putting it back"). Null when nothing was undone.
 * @param {readonly UndoneTurn[]} undone
 * @param {string} id - the message id.
 * @returns {{ id: string, role: 'user', content: { type: 'text', text: string }[],
 *   source: { kind: string, producer: string, form: 'notice', summary: string } } | null}
 */
export function undoneNotice(undone, id) {
  if (undone.length === 0) return null
  const named = undone
    .map(
      (t) => `request ${t.turn} ${JSON.stringify(t.title)} (${t.complete ? 'fully undone' : 'partly undone'})`
    )
    .join('; ')
  const text =
    `Since your last reply, the person undid ${undone.length} of your earlier requests from the chat: ${named}. ` +
    'The site is back to how it was before those requests. Do not say the site changed on its own; ' +
    'read the site again before you describe it.'
  return {
    id,
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: SITE_NOTICE_KIND,
      producer: TURN_UNDONE_PRODUCER,
      form: 'notice',
      summary: 'Earlier request undone'
    }
  }
}

/**
 * The step's messages with the undone notice right after the message that opened the turn (the
 * person's, {@link openingOf}); the same array when there is nothing to say or no such message.
 * @param {readonly unknown[]} messages
 * @param {readonly UndoneTurn[]} undone
 * @param {string} id - the notice's message id.
 * @returns {readonly unknown[]}
 */
export function withUndoneNotice(messages, undone, id) {
  const notice = undoneNotice(undone, id)
  if (notice === null) return messages
  const at = openingIndex(messages)
  if (at === -1) return messages
  return [...messages.slice(0, at + 1), notice, ...messages.slice(at + 1)]
}

/**
 * Where in `messages` the message {@link openingOf} reads sits, or -1.
 * @param {readonly unknown[]} messages
 */
function openingIndex(messages) {
  const list = Array.isArray(messages) ? messages : []
  for (let i = 0; i < list.length; i++) if (openingOf([list[i]]) !== null) return i
  return -1
}

/**
 * A message's content as one text.
 * @param {unknown} content
 * @returns {string}
 */
function textOf(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((part) => (part && typeof part.text === 'string' ? part.text : '')).join('\n')
}

/**
 * The longest a turn's first write waits for an earlier turn's moment to end (option A): the host's own
 * wait for a site's lock (`webroot-git.sh` `locked`, 120 s). A moment that has not even begun in that
 * time fails as busy on the host and is asked for again later; holding the agent through that would
 * hold it for minutes, so the write goes and the turns are marked instead.
 */
export const MOMENT_HOLD_MS = 120_000

/**
 * The turn ids an open's answer names as still committing their moment (`momentsPending`), of this
 * conversation only; anything else is dropped. An older tracy-web names none.
 * @param {unknown} body
 * @param {string} sessionId
 * @returns {string[]}
 */
export function momentsPendingOf(body, sessionId) {
  const list = /** @type {{ momentsPending?: unknown } | null} */ (body)?.momentsPending
  if (!Array.isArray(list)) return []
  /** @type {string[]} */
  const out = []
  for (const id of list) {
    if (typeof id !== 'string' || !id.startsWith(`${sessionId}:`) || !/:[0-9]{1,9}$/.test(id)) continue
    if (!out.includes(id)) out.push(id)
    if (out.length === 20) break
  }
  return out
}

/**
 * @typedef {{ email: string, cwd: unknown }} Who - whom a door call is signed as, and from which folder.
 * @typedef {(door: 'turn' | 'turn/undone' | 'moment' | 'moment/wait', body: Record<string, unknown>, who: Who, signal: AbortSignal)
 *   => Promise<{ ok: boolean, status: number, body?: unknown }>} Send - `body`: the parsed answer, when
 *   there is one (the open's `undone` and `momentsPending`, the wait's `ended`).
 */

/**
 * @param {object} options
 * @param {Send} options.send - one call to a tracy-web door; throws on a network failure.
 * @param {number} [options.timeoutMs] - the most one open or one close may hold the agent up.
 * @param {number} [options.attempts] - tries per close, all of them inside `timeoutMs`.
 * @param {number} [options.retryDelayMs]
 * @param {(line: string) => void} [options.warn]
 * @param {(line: string) => void} [options.info] - one line when a write waited for its turn's open.
 * @param {number} [options.momentHoldMs] - {@link MOMENT_HOLD_MS}.
 * @param {number} [options.askAgainMs] - the least time between two asks of `moment/wait` (a door that
 *   answers at once, refusing or failing, is not asked in a loop).
 */
export function createTurnBook({
  send,
  timeoutMs = 15_000,
  attempts = 3,
  retryDelayMs = 500,
  warn = console.warn,
  info = console.info,
  momentHoldMs = MOMENT_HOLD_MS,
  askAgainMs = 1_000
}) {
  /**
   * `chain`: the open and any steer of the turn, in the order they are sent; never rejects. The close
   * waits for it, so a door never hears a turn's steer or close before its open.
   * @type {Map<string, { sessionId: string, turn: number, title: string, source?: string, who: Who, closed: boolean, tries: number, steered: boolean, chain: Promise<void>, reply?: { reply: string, replyState: string } | null, endReason?: string | null, usage?: ReturnType<typeof tokenUsageOf>, work?: { steps: number, calls: number, failedCalls: number } | null }>}
   */
  const turns = new Map()
  /**
   * The open still in flight for each conversation: what its next write waits for (`writeReady`).
   * Dropped once it settles, so a settled open holds nothing.
   * @type {Map<string, { id: string, settled: Promise<void> }>}
   */
  const openInFlight = new Map()
  /**
   * The idle sweep still running for a session. 🔒 The host fires `idle` without waiting (`void`), so
   * an errored or stopped turn's `/moment` could still be in flight when the person's next message
   * opened a turn: the seal ran first, and the late moment committed the new turn's first edits under
   * the old turn's trailer — undoing the old turn then undid the new one's work (review 09/10/2026).
   * The turn's open waits for it (`enter`), and so does its first write; each close it makes is cut
   * at `timeoutMs`, so the wait is bounded.
   * @type {Map<string, Promise<void>>}
   */
  const sweeps = new Map()
  /**
   * The earlier moments a conversation's next write waits for (option A, see the head of this file):
   * `ended` settles `'ended'` once tracy-web said each has ended, or `'bound'` at {@link MOMENT_HOLD_MS};
   * `release` tells tracy-web the write goes before they ended (once, whichever write gets there first).
   * Dropped once ended or released, so a settled hold holds nothing.
   * @type {Map<string, { id: string, pending: Set<string>, who: Who, ended: Promise<'ended' | 'bound'>, release?: Promise<void> }>}
   */
  const holds = new Map()

  /**
   * Hold this conversation's next write behind `ids` (earlier turns whose moment the host still commits),
   * asking tracy-web in the background — one ask per moment at a time, each waiting up to ~10 s there —
   * from now until each has ended or `momentHoldMs` has passed.
   * @param {string} sessionId
   * @param {string} id - the turn whose write is held, for the logs
   * @param {string[]} ids
   * @param {Who} who
   */
  function holdBehind(sessionId, id, ids, who) {
    const deadline = Date.now() + momentHoldMs
    const pending = new Set(ids)
    /** @type {{ id: string, pending: Set<string>, who: Who, ended: Promise<'ended' | 'bound'>, release?: Promise<void> }} */
    const hold = { id, pending, who, ended: Promise.resolve('ended') }
    const one = async (/** @type {string} */ earlier) => {
      while (Date.now() < deadline) {
        const asked = Date.now()
        const answer = await once(
          'moment/wait',
          { turnId: earlier },
          who,
          Math.min(deadline, asked + timeoutMs)
        )
        if (answer.ok && /** @type {any} */ (answer.body)?.ended === true) {
          pending.delete(earlier)
          return
        }
        const left = askAgainMs - (Date.now() - asked)
        if (left > 0)
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(left, Math.max(0, deadline - Date.now())))
          )
      }
    }
    hold.ended = Promise.all(ids.map((earlier) => one(earlier).catch(() => {}))).then(() => {
      const outcome = pending.size === 0 ? 'ended' : 'bound'
      // Ended: nothing to tell, nothing held any more — a write after this does not wait at all.
      if (outcome === 'ended' && holds.get(sessionId) === hold) holds.delete(sessionId)
      return outcome
    })
    holds.set(sessionId, hold)
  }

  /**
   * The hold ran out with moments still committing: the write goes now, and tracy-web hears it first,
   * so it can mark the turns that moment may mix should it commit (`POST /moment/wait` `release`).
   * @param {string} sessionId
   * @param {{ id: string, pending: Set<string>, who: Who, release?: Promise<void> }} hold
   */
  function releaseHold(sessionId, hold) {
    hold.release ??= (async () => {
      for (const earlier of hold.pending) {
        const answer = await once(
          'moment/wait',
          { turnId: earlier, release: true },
          hold.who,
          Date.now() + timeoutMs
        )
        const body = /** @type {any} */ (answer.ok ? answer.body : null)
        if (body?.ended === true) continue
        warn(
          body?.released === true
            ? `[tracy-site-tabs] turn ${hold.id}: writes before turn ${earlier}'s moment ended (${momentHoldMs} ms); both turns are marked if that moment commits`
            : `[tracy-site-tabs] turn ${hold.id}: writes before turn ${earlier}'s moment ended, and tracy-web could not be told (${answer.ok ? 'unreadable answer' : answer.why})`
        )
      }
      if (holds.get(sessionId) === hold) holds.delete(sessionId)
    })()
    return hold.release
  }

  /**
   * One call, cut at `deadline` (epoch ms). Resolves to the answer, or to the reason it failed.
   * @param {'turn' | 'turn/undone' | 'moment' | 'moment/wait'} door
   * @param {Record<string, unknown>} body
   * @param {Who} who
   * @param {number} deadline
   * @returns {Promise<{ ok: true, body?: unknown } | { ok: false, why: string }>}
   */
  async function once(door, body, who, deadline) {
    const left = deadline - Date.now()
    if (left <= 0) return { ok: false, why: 'out of time' }
    const controller = new AbortController()
    let timer
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort()
        resolve({ ok: false, why: `no answer within ${timeoutMs} ms` })
      }, left)
    })
    try {
      const answer = await Promise.race([
        send(door, body, who, controller.signal).then(
          (res) => (res.ok ? { ok: true, body: res.body } : { ok: false, why: `refused: ${res.status}` }),
          (error) => ({ ok: false, why: error instanceof Error ? error.message : String(error) })
        ),
        timeout
      ])
      return answer
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * @param {string} id
   * @param {{ title: string, who: Who, closed: boolean, tries: number, chain: Promise<void>, reply?: { reply: string, replyState: string } | null, endReason?: string | null, usage?: ReturnType<typeof tokenUsageOf>, work?: { steps: number, calls: number, failedCalls: number } | null }} record
   */
  async function close(id, record) {
    // The open (and a steer) first: the step no longer waits for it, so a short turn can stop while
    // its seal still runs. The close's own budget starts once they have settled.
    await record.chain
    const deadline = Date.now() + timeoutMs
    // An older tracy-web ignores these fields; a turn with no text sends no reply, one whose
    // turn/end is not in the log yet sends no endReason, and one with no step logged sends no work.
    const body = {
      title: record.title,
      turnId: id,
      ...(record.reply ? record.reply : {}),
      ...(record.endReason ? { endReason: record.endReason } : {}),
      ...(record.work ? { work: record.work } : {}),
      ...(record.usage ? { usage: record.usage } : {})
    }
    while (record.tries < attempts && Date.now() < deadline) {
      record.tries += 1
      const answer = await once('moment', body, record.who, deadline)
      if (answer.ok) {
        record.closed = true
        record.tries = 0
        return
      }
      warn(
        `[tracy-site-tabs] turn ${id}: moment not recorded (${answer.why}), try ${record.tries} of ${attempts}`
      )
      if (record.tries < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }

  /** @type {Promise<UndoneTurn[]>} */
  const NOTHING = Promise.resolve([])

  /**
   * 🔒 A STEP STEERED INTO A TURN ALREADY CLOSED OPENS IT AGAIN. The close runs in `agent/turn-stopping`, and another
   * listener of the same hook may steer one more step after it (a check's notice, dsh's todo reminder): the turn runs
   * on, its row read closed, and a build's every write in that step was refused AGENT_DEMO_TURN_NOT_BOUND (local
   * stand 24/10/2026). The door is told the turn goes on (`steered`, tracy-web `openTurn` opens a closed row again);
   * the step's writes wait for that answer as a first write waits for the open (`writeReady`); the turn's next
   * `turn-stopping` closes it again.
   * @param {string} sessionId @param {number} turn
   */
  function reopen(sessionId, turn) {
    const id = `${sessionId}:${turn}`
    const known = turns.get(id)
    if (!known?.closed) return
    known.closed = false
    known.steered = true
    const again = known.chain.then(async () => {
      const answer = await once(
        'turn',
        { turnId: id, title: known.title, source: known.source ?? 'panel', steered: true },
        known.who,
        Date.now() + timeoutMs
      )
      if (!answer.ok)
        warn(`[tracy-site-tabs] turn ${id}: going on after its close not recorded (${answer.why})`)
    })
    known.chain = again.catch(() => {})
    const inFlight = { id, settled: known.chain }
    openInFlight.set(sessionId, inFlight)
    void known.chain.then(() => {
      if (openInFlight.get(sessionId) === inFlight) openInFlight.delete(sessionId)
    })
  }

  /**
   * A step is about to run. Opens its turn when a person's message is in it, and answers at once:
   * `opens` — this call opened a NEW turn (its seal is now running); `undone` — settles with the turns
   * of this conversation the person undid from the chat since its last turn (`POST /turn` `undone`),
   * or [] — on a steer, a failed or slow open, an older tracy-web. Neither ever rejects.
   * @param {{ sessionId: string, turn: number, messages: readonly unknown[] | undefined, cwd: unknown }} step
   * @returns {{ opens: boolean, undone: Promise<UndoneTurn[]> }}
   */
  function enter({ sessionId, turn, messages, cwd }) {
    const opening = openingOf(messages)
    if (opening === null) {
      reopen(sessionId, turn)
      return { opens: false, undone: NOTHING }
    }
    const id = `${sessionId}:${turn}`
    const known = turns.get(id)
    const who = { email: opening.email, cwd }
    if (known) {
      if (known.closed) known.closed = false
      // Somebody typed again while it ran: the same turn, now steered. Its name stays the first's.
      // Sent after the open, never before it: a steer the door saw first would open the turn itself.
      if (known.steered) return { opens: false, undone: NOTHING }
      known.steered = true
      const steer = known.chain.then(async () => {
        const answer = await once(
          'turn',
          { turnId: id, title: known.title, source: opening.source, steered: true },
          who,
          Date.now() + timeoutMs
        )
        if (!answer.ok) warn(`[tracy-site-tabs] turn ${id}: steer not recorded (${answer.why})`)
      })
      known.chain = steer.catch(() => {})
      return { opens: false, undone: known.chain.then(() => []) }
    }
    /** @type {{ sessionId: string, turn: number, title: string, source?: string, who: Who, closed: boolean, tries: number, steered: boolean, chain: Promise<void> }} */
    const record = {
      sessionId,
      turn,
      title: opening.title,
      source: opening.source,
      who,
      closed: false,
      tries: 0,
      steered: false,
      chain: Promise.resolve()
    }
    turns.set(id, record)
    // 🔒 #1066: the previous turn's files are committed before this one's can mix in (see `sweeps`).
    // The open is SENT once that sweep has settled — the step itself does not wait, but the open,
    // and so the first write (`writeReady`), does. Each close the sweep makes is cut at `timeoutMs`.
    const prior = sweeps.get(sessionId)?.catch(() => {}) ?? Promise.resolve()
    const opened = prior
      .then(() =>
        once(
          'turn',
          {
            turnId: id,
            title: opening.title,
            source: opening.source,
            promptMessageId: opening.promptMessageId,
            rpcId: opening.rpcId,
            // This dsh holds the turn's first write behind the conversation's moments still committing
            // (`momentsPending`), so tracy-web may take those moments as harmless to this turn's seal.
            waitsForMoments: true,
            ...(opening.commentNs ? { commentNs: opening.commentNs } : {}),
            // An older tracy-web ignores it and stores the cut title as `full`, as before.
            ...(opening.requestCut ? { requestState: 'truncated' } : {})
          },
          who,
          Date.now() + timeoutMs
        )
      )
      .then(
        (answer) => {
          if (!answer.ok) {
            warn(`[tracy-site-tabs] turn ${id}: not opened (${answer.why}); its moment is still recorded`)
            return []
          }
          // Registered before the open settles: a write waiting for the open finds the hold at once.
          const earlier = momentsPendingOf(answer.body, sessionId)
          if (earlier.length > 0) holdBehind(sessionId, id, earlier, who)
          return undoneOf(answer.body)
        },
        () => []
      )
    // 🔒 THE STEP WAITS FOR THE UNDONE LIST, NOT FOR THE SEAL (16/10/2026). The open answers it only
    // after the previous turn's sweep and the seal's wait; `turn/undone` reads the same list (tracy-web
    // `undoneSince` reads the PREVIOUS turn's row alone) at once, with no host job. A tracy-web without
    // that door, or a read that fails, falls back to the open's answer — the wait of before. The first
    // write still waits for the open itself (`writeReady`): the seal's guarantee does not move.
    // A first turn names no undone turn by construction (`openMayNameUndone`): nothing to ask early.
    const quick = openMayNameUndone(turn)
      ? once('turn/undone', { turnId: id }, who, Date.now() + timeoutMs).then(
          // a list or nothing: an answer without one (another door's 200) never stands in for the open's
          (answer) =>
            answer.ok && Array.isArray(/** @type {{ undone?: unknown }} */ (answer.body)?.undone)
              ? undoneOf(answer.body)
              : null,
          () => null
        )
      : Promise.resolve(null)
    const undone = quick.then((list) => list ?? opened)
    const settled = opened.then(() => {})
    record.chain = settled
    const inFlight = { id, settled }
    openInFlight.set(sessionId, inFlight)
    void settled.then(() => {
      if (openInFlight.get(sessionId) === inFlight) openInFlight.delete(sessionId)
    })
    return { opens: true, undone }
  }

  return {
    enter,

    /**
     * {@link enter}, awaited: the undone turns once the open (or the steer) has been answered.
     * @param {{ sessionId: string, turn: number, messages: readonly unknown[] | undefined, cwd: unknown }} step
     * @returns {Promise<UndoneTurn[]>}
     */
    stepEntered(step) {
      return enter(step).undone
    },

    /**
     * 🔒 A CALL THAT MAY WRITE THE SITE WAITS HERE for its conversation's open, so the seal of what
     * was dirty before the turn lands before the agent's first edit — the guarantee the step itself
     * used to wait for. Bounded by the open's own budget (`timeoutMs`): an open with no answer in time
     * lets the write go, exactly as the step went before (tracy-web has marked the turn
     * `unsealedStart`). Then, when the open named earlier turns of the conversation whose moment the
     * host still commits, it waits for those to end (option A, `holds`): at most until
     * {@link MOMENT_HOLD_MS} after the open's answer, and tracy-web is told when it lets go before they
     * ended. Resolves at once when nothing is in flight or held — a moment that ended before the write
     * holds nothing — and when `signal` aborts.
     * @param {{ sessionId: string, signal?: AbortSignal }} call
     * @returns {Promise<boolean>} whether the call had to wait.
     */
    async writeReady({ sessionId, signal }) {
      /** Resolves with `promise`'s value, or with `undefined` when the call is cancelled first. */
      const untilOrCancelled = (/** @type {Promise<any>} */ promise) =>
        new Promise((resolve) => {
          const done = (/** @type {any} */ value) => {
            signal?.removeEventListener('abort', cancelled)
            resolve(value)
          }
          const cancelled = () => done(undefined)
          void promise.then(done)
          signal?.addEventListener('abort', cancelled, { once: true })
        })
      let waited = false
      const inFlight = openInFlight.get(sessionId)
      if (inFlight !== undefined && !signal?.aborted) {
        const started = Date.now()
        await untilOrCancelled(inFlight.settled)
        info(`[tracy-site-tabs] turn ${inFlight.id}: a write waited ${Date.now() - started} ms for the open`)
        waited = true
      }
      // 🔒 Option A: an earlier turn's moment still committing would take this write under its name.
      const hold = holds.get(sessionId)
      if (hold !== undefined && !signal?.aborted) {
        const started = Date.now()
        const outcome = await untilOrCancelled(hold.ended)
        if (outcome === 'bound') await untilOrCancelled(releaseHold(sessionId, hold))
        info(
          `[tracy-site-tabs] turn ${hold.id}: a write waited ${Date.now() - started} ms for an earlier turn's moment (${outcome ?? 'cancelled'})`
        )
        waited = true
      }
      return waited
    },

    /**
     * The turn is stopping (`agent/turn-stopping`, before the next one starts): record its moment,
     * with Tracy's answer read off the session's events (`events`; none from an older caller).
     * @param {{ sessionId: string, turn: number, events?: readonly { type?: string, data?: any }[] }} stop
     */
    async turnStopping({ sessionId, turn, events }) {
      const id = `${sessionId}:${turn}`
      const record = turns.get(id)
      if (record === undefined) return
      if (events !== undefined) {
        record.reply = replyOf(events, turn)
        record.endReason = stoppingReasonOf(events, turn)
        record.work = workOf(events, turn)
        record.usage = tokenUsageOf(events, turn)
      }
      if (record.closed) record.tries = 0
      await close(id, record)
    },

    /**
     * The conversation went idle: close every turn of it the log says has ENDED but that never
     * closed (aborted, errored, blocked — none of them reaches `turn-stopping`). Then forget what is
     * closed, so the book never grows with the conversation.
     * @param {{ sessionId: string, events: readonly { type?: string, data?: any }[] }} idle
     */
    async idle({ sessionId, events }) {
      const before = sweeps.get(sessionId)
      const sweep = (async () => {
        // Two idles in a row sweep one after the other, never the same record at once.
        await before?.catch(() => {})
        const ended = new Set()
        for (const event of events ?? []) {
          if (event?.type === 'turn/end' && Number.isInteger(event.data?.turn)) ended.add(event.data.turn)
        }
        for (const [id, record] of turns) {
          if (record.sessionId !== sessionId || record.closed || !ended.has(record.turn)) continue
          if (record.tries >= attempts) continue
          if (record.reply === undefined) record.reply = replyOf(events, record.turn)
          if (!record.endReason) record.endReason = endReasonOf(events, record.turn)
          if (!record.work) record.work = workOf(events, record.turn)
          record.usage = tokenUsageOf(events, record.turn)
          await close(id, record)
        }
        for (const [id, record] of turns) {
          if (record.sessionId === sessionId && (record.closed || record.tries >= attempts)) turns.delete(id)
        }
      })()
      sweeps.set(sessionId, sweep)
      try {
        await sweep
      } finally {
        if (sweeps.get(sessionId) === sweep) sweeps.delete(sessionId)
      }
    }
  }
}
