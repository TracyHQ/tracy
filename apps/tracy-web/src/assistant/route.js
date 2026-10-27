/**
 * The AI Assistant's doors (05/10/2026): the chat with Tracy that `@tracy/dsh-assistant`
 * draws in the corner of the customer's page, and its handoff to the Customer Service team.
 *
 *   GET  /api/assistant/conversation?after=<turn id>&session=<agent session id>  the account's
 *        current conversation IN THAT AGENT SESSION (Help, `/help <question>`; no `session` = the
 *        account-level one the Telegram handoff uses): state, turns (the latest 50, or those after
 *        `after`, each Help turn with its `anchorSeq`), unread staff turns, whether a person can
 *        be asked for; `links` and `tipSeen` only on a restore (no `after`)
 *   POST /api/assistant/turns   {message, conversationId?, site?, start?, attachments?: [file id],
 *        session?: {id, anchorSeq, title?, state?}} → text/event-stream. `start: true` is the creation
 *        workspace (/new/): its answers may offer the start actions (`prompt.js`, `navigationFor`).
 *        `attachments` are files uploaded loose into the same conversation (`files.js`); a question may
 *        be only files.
 *   POST /api/assistant/attachments   multipart `file`, `session` → 201 {file}: a file the customer
 *        picks in the chat box, stored loose until a question carries it
 *   POST /api/assistant/turns/:id/rating   {rating: 1 | -1 | null} on one of the asker's own answers → 204
 *   POST /api/assistant/tip/seen   the "type /help" tip was shown → 204
 *     event: meta    {conversationId, state, turnId?, links, suggestHandoff}   first, always
 *     event: delta   {text}                    the AI's answer; none while a person holds it
 *     event: done    {turnId?}
 *     event: error   {code}                    instead of done, once streaming began
 *   POST /api/assistant/handoff         {conversationId, site?}            → {state}
 *   POST /api/assistant/handoff/end     {conversationId, reason: resolved | back_to_ai} → {state}
 *   POST /api/assistant/conversation/read   {conversationId, through}      → 204
 *   POST /api/assistant/conversation/clear  {conversationId}               → {conversationId}
 *   GET  /api/assistant/attachments/:id     a staff member's photo or the customer's own file, to its
 *        own account only (pictures inline, every other file downloads)
 *   POST /api/assistant/telegram/webhook    Telegram's update; `X-Telegram-Bot-Api-Secret-Token`
 *        is the whole authority (a session-free door in `lib/csrf.js`)
 *
 * Refusals known before anything streams answer JSON with a status: 401 NOT_SIGNED_IN,
 * 400 BAD_MESSAGE, 409 CONVERSATION_CHANGED (cleared in another tab: restore and go on),
 * 429 RATE_LIMITED, 503 NOT_CONFIGURED / ASSISTANT_UNAVAILABLE / SUPPORT_UNAVAILABLE.
 *
 * 🔒 WHAT THE MODEL CAN REACH IS DECIDED HERE, NOT IN THE PROMPT. The asker is the session's email;
 * the body cannot name an account. `site` is the page's hint for "the site on screen", honoured
 * only when it is one of the asker's accepted seats (`context.js`). The model has no tools.
 *
 * 🔒 THE BODY CARRIES NO HISTORY, and no conversation of its own choosing: the server keeps one
 * current conversation per (account, agent session) and a stale id is refused, never adopted. A
 * session id only picks WHICH of the asker's own conversations; it never opens anyone else's.
 *
 * Module graph: imports `lib/` and its own files; the seat and site readers arrive from `app.js`.
 */
import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { json, viewer } from '../lib/http.js'
import { overLimitOrClosed, refundOne } from '../lib/rate.js'
import { readAskerContext } from './context.js'
import {
  claimFiles,
  cleanName,
  disposition,
  filesNote,
  filesOfTurns,
  isPicture,
  kindOf,
  looseFiles,
  matchesPicture,
  MAX_FILE_BYTES,
  MAX_FILES_PER_QUESTION,
  ownFile,
  saveFile,
  sweepLoose,
  UPLOADS_PER_HOUR
} from './files.js'
import { assistantModel, TURN_DEADLINE_MS } from './model.js'
import { draftPrompt, DRAFT_CHARS, DRAFT_TURNS, parseDraft } from './onboarding-draft.js'
import { navigationFor, systemPrompt } from './prompt.js'
import { readUiHidden } from '../lib/ui-setting.js'
import {
  currentConversation,
  historyOf,
  lockCurrent,
  markRead,
  markTipSeen,
  rateTurn,
  saveTurn,
  tipSeen,
  turnsOf,
  tx,
  unreadOf
} from './store.js'

/** A question, not a document: long pastes cost the asker's quota and crowd out the context. */
export const MESSAGE_MAX = 4000
/** Turns one account may start per minute and per day. Beta numbers, approved 05/10/2026. */
export const TURNS_PER_MINUTE = 6
export const TURNS_PER_DAY = 50
/** Messages to a person cost no model, so they get their own, looser brake. */
export const HUMAN_PER_MINUTE = 20
export const HUMAN_PER_DAY = 400
/** Answers one account may have streaming at once (this process): a second tab is fine, a script is not. */
export const MAX_STREAMS_PER_ACCOUNT = 2
/** Requests for a person: each one is a topic a team member has to look at. */
export const HANDOFFS_PER_HOUR = 3
export const HANDOFFS_PER_DAY = 10

/** An agent session id as dsh names it: a token, never a path or free text. */
const SESSION_ID = /^[A-Za-z0-9_.:-]{1,128}$/
/** Largest durable seq a session log can reach before it is not a seq at all. */
const SEQ_MAX = Number.MAX_SAFE_INTEGER

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TURN_ID = /^\d{1,18}$/
/** A Telegram update is a few kilobytes; anything far larger is not one. */
const WEBHOOK_MAX_BYTES = 256 * 1024

/**
 * Words that ask for a person, in the eight interface languages. A match only SUGGESTS a handoff:
 * the panel asks the person to confirm, so a pasted text that happens to say "human" opens nothing.
 */
const WANTS_HUMAN =
  /\b(human|real person|talk to (a |an )?(person|agent|someone|support)|customer (service|support)|live (agent|chat)|operator)\b|nhân viên|người thật|gặp người|hỗ trợ viên|tư vấn viên|chăm sóc khách hàng|mitarbeiter|menschen|kundendienst|humain|conseiller|service client|operatore|persona reale|assistenza clienti|medewerker|klantenservice|echte persoon|人工|真人|客服|persona real|agente humano|atención al cliente/i

/** @param {string} text */
export const wantsHuman = (text) => WANTS_HUMAN.test(text)

/** @param {string} event @param {unknown} data */
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

const sse = (body) =>
  new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'private, no-store, no-transform',
      // A proxy that buffers would hold the whole answer until the end.
      'x-accel-buffering': 'no'
    }
  })

/** @param {string | null | undefined} a @param {string} b */
function sameSecret(a, b) {
  if (typeof a !== 'string') return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * @param {{
 *   pool: import('pg').Pool | null,
 *   config: { sessionSecret: string, csTelegram?: { webhookSecret: string | null } | null },
 *   readers: Parameters<typeof readAskerContext>[1],
 *   ensureAccount?: (pool: any, email: string) => Promise<{id: string}>,
 *   model?: ReturnType<typeof assistantModel>,
 *   support?: ReturnType<typeof import('./support.js').createSupport> | null,
 *   objects?: ReturnType<typeof import('../app.js').storeObjects> | null,
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 *   log?: { warn: (...args: unknown[]) => void }
 * }} deps
 */
export function assistantRoutes({
  pool,
  config,
  readers,
  ensureAccount,
  model,
  support = null,
  objects = null,
  fetchImpl,
  now = Date.now,
  log = console
}) {
  const app = new Hono()
  const llm = model ?? assistantModel({ pool, config, ...(fetchImpl ? { fetchImpl } : {}) })
  const supportOn = Boolean(support?.available)
  /** Answers streaming right now, per account, in this process (see `MAX_STREAMS_PER_ACCOUNT`). */
  const streaming = new Map()
  // Without a staff list, anyone in the Telegram group can answer a customer as "staff". The group is
  // the team's own, so this stays allowed (a deployment must not break on upgrade), but it is said.
  if (supportOn && (config.csTelegram?.staffIds?.length ?? 0) === 0)
    log.warn(
      '[assistant] CS_TELEGRAM_STAFF_IDS is empty: every member of the support group can reply to customers'
    )

  /**
   * The signed-in account, or the Response to send. `unknownAccount: 'empty'` is for reads: a
   * signed session whose email has no `account` row yet is still signed in, and has nothing stored,
   * so the caller answers it empty (same as `GET /api/sites`) instead of a 401 that is not true.
   */
  async function signedIn(c, { unknownAccount = 'refuse' } = {}) {
    c.header('cache-control', 'no-store')
    const email = await viewer(c, config)
    if (!email) return { error: json(c, { code: 'NOT_SIGNED_IN' }, 401) }
    if (!pool) return { error: json(c, { code: 'ASSISTANT_UNAVAILABLE' }, 503) }
    let account = await readers.accountByEmail(pool, email)
    if (!account && unknownAccount !== 'empty' && c.req.method === 'POST' && ensureAccount) {
      await ensureAccount(pool, email)
      account = await readers.accountByEmail(pool, email)
    }
    if (!account && unknownAccount !== 'empty') return { error: json(c, { code: 'NOT_SIGNED_IN' }, 401) }
    return { email, account }
  }

  async function body(c) {
    try {
      const b = await c.req.json()
      return b && typeof b === 'object' ? b : {}
    } catch {
      return null
    }
  }

  /** The agent session a request names (`?session=` or `body.session.id`), or '' for the account-level chat. */
  const sessionIdOf = (raw) => (typeof raw === 'string' && SESSION_ID.test(raw) ? raw : '')

  /**
   * What the composer sends about the session it was typed in: the id, the seq the answer sits
   * after, and the title and state as facts for the model. Anything malformed is dropped, not guessed.
   */
  function sessionOf(b) {
    const raw = b?.session
    if (!raw || typeof raw !== 'object') return { id: '', anchorSeq: null, title: null, state: null }
    const anchor = Number(raw.anchorSeq)
    const oneLine = (v, max) =>
      typeof v === 'string' && v.trim() !== '' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null
    return {
      id: sessionIdOf(raw.id),
      anchorSeq: Number.isFinite(anchor) && anchor >= 0 && anchor <= SEQ_MAX ? anchor : null,
      title: oneLine(raw.title, 120),
      state: typeof raw.state === 'string' && /^[a-z_-]{1,24}$/.test(raw.state) ? raw.state : null
    }
  }

  const conversationIdOf = (b) =>
    typeof b?.conversationId === 'string' && UUID.test(b.conversationId)
      ? b.conversationId.toLowerCase()
      : null

  /** The file ids a question names: none when absent, null when malformed, too many or repeated. */
  function fileIdsOf(raw) {
    if (raw === undefined || raw === null) return []
    if (!Array.isArray(raw) || raw.length > MAX_FILES_PER_QUESTION) return null
    if (!raw.every((id) => typeof id === 'string' && UUID.test(id))) return null
    const ids = raw.map((id) => id.toLowerCase())
    return new Set(ids).size === ids.length ? ids : null
  }

  app.get('/api/assistant/conversation', async (c) => {
    const who = await signedIn(c, { unknownAccount: 'empty' })
    if (who.error) return who.error
    const afterRaw = c.req.query('after')
    if (afterRaw !== undefined && !TURN_ID.test(afterRaw)) return json(c, { code: 'BAD_CURSOR' }, 400)
    const after = afterRaw ?? null
    const sessionId = sessionIdOf(c.req.query('session'))
    const start = c.req.query('start') === '1'
    // Nothing is stored for an account that does not exist yet, and a read creates none. No
    // `tipSeen`: there is nowhere to record the tip, so the page is told nothing about it.
    if (!who.account) {
      const out = {
        conversationId: null,
        state: 'ai',
        turns: [],
        unread: 0,
        lastRead: '0',
        supportAvailable: supportOn,
        sessionId
      }
      if (after === null) out.links = navigationFor(null, { start, hidden: await readUiHidden(pool) })
      return json(c, out)
    }
    const conversation = await currentConversation(pool, who.account.id, sessionId)
    const turns = await turnsOf(pool, who.account.id, conversation.id, after)
    // A question's files come back with it, so a reload shows what was sent.
    const files = await filesOfTurns(
      pool,
      who.account.id,
      turns.filter((t) => t.role === 'user').map((t) => t.id)
    )
    for (const turn of turns) if (files.has(turn.id)) turn.files = files.get(turn.id)
    const out = {
      conversationId: conversation.id,
      state: conversation.state,
      turns,
      unread: await unreadOf(pool, conversation),
      lastRead: String(conversation.last_read_turn_id),
      supportAvailable: supportOn,
      sessionId
    }
    // The one-time "type /help" tip is shown once per account; the page reads it with the restore.
    if (after === null) out.tipSeen = await tipSeen(pool, who.account.id)
    if (after === null) {
      // Links are drawn from the asker's seats, so they are rebuilt here rather than replayed.
      const ctx = await readAskerContext(pool, readers, { email: who.email })
      out.links = navigationFor(ctx, { start, hidden: await readUiHidden(pool) })
    }
    return json(c, out)
  })

  app.post('/api/assistant/attachments', async (c) => {
    const who = await signedIn(c)
    if (who.error) return who.error
    if (!objects) return json(c, { code: 'FILE_STORE_UNAVAILABLE' }, 503)
    // Refused on the announced length before reading, as a comment's file is.
    const announced = Number(c.req.header('content-length') ?? '0')
    if (announced > MAX_FILE_BYTES + 64 * 1024)
      return json(c, { code: 'FILE_TOO_LARGE', limit: MAX_FILE_BYTES }, 413)
    const form = await c.req.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function')
      return json(c, { code: 'BAD_FILE' }, 400)
    if (file.size > MAX_FILE_BYTES) return json(c, { code: 'FILE_TOO_LARGE', limit: MAX_FILE_BYTES }, 413)
    if (file.size === 0) return json(c, { code: 'BAD_FILE' }, 400)
    const name = cleanName(file.name)
    const kind = kindOf(name)
    if (!kind) return json(c, { code: 'FILE_TYPE' }, 415)
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!matchesPicture(kind.type, bytes)) return json(c, { code: 'FILE_TYPE' }, 415)
    const accountId = who.account.id
    const at = now()
    if (await overLimitOrClosed(pool, `assistant:files:${accountId}`, UPLOADS_PER_HOUR, at, 3_600_000))
      return json(c, { code: 'RATE_LIMITED', window: 'hour' }, 429)
    const sessionId = sessionIdOf(form.get('session'))
    const conversation = await currentConversation(pool, accountId, sessionId)
    await sweepLoose(pool, objects, accountId, at).catch(() => {})
    const saved = await saveFile(pool, objects, {
      accountId,
      conversationId: conversation.id,
      name,
      type: kind.type,
      bytes
    })
    if (!saved) return json(c, { code: 'FILE_STORE_FAILED' }, 502)
    return json(c, { file: saved }, 201)
  })

  app.post('/api/assistant/onboarding-draft', async (c) => {
    const who = await signedIn(c)
    if (who.error) return who.error
    const b = await body(c)
    if (
      !b ||
      !['create', 'import', 'business'].includes(b.intent) ||
      !TURN_ID.test(b.sourceRevision ?? '') ||
      !SESSION_ID.test(b.session ?? '')
    )
      return json(c, { code: 'BAD_DRAFT' }, 400)
    if (b.platform != null && !['wordpress', 'joomla', 'emdash'].includes(b.platform))
      return json(c, { code: 'BAD_DRAFT' }, 400)
    const hidden = await readUiHidden(pool)
    if (!navigationFor(null, { start: true, hidden }).some((l) => l.href === `tracy-action:${b.intent}`))
      return json(c, { code: 'DRAFT_UNAVAILABLE' }, 409)
    const accountId = who.account.id
    const { rows: conversations } = await pool.query(
      'select id from assistant_conversation where account_id = $1 and session_id = $2 and cleared_at is null',
      [accountId, b.session]
    )
    const conversationId = conversations[0]?.id
    if (!conversationId) return json(c, { code: 'DRAFT_CHANGED' }, 409)
    const readRevision = async () => {
      const { rows } = await pool.query(
        `select max(t.id)::text as revision from assistant_turn t join assistant_conversation c on c.id = t.conversation_id
         where t.account_id = $1 and t.conversation_id = $2 and t.role = 'user' and c.cleared_at is null`,
        [accountId, conversationId]
      )
      return rows[0]?.revision
    }
    if ((await readRevision()) !== b.sourceRevision) return json(c, { code: 'DRAFT_CHANGED' }, 409)
    const { rows: turns } = await pool.query(
      `select role, content from assistant_turn where account_id = $1 and conversation_id = $2 order by id limit $3`,
      [accountId, conversationId, DRAFT_TURNS + 1]
    )
    if (turns.length > DRAFT_TURNS || turns.reduce((n, t) => n + t.content.length, 0) > DRAFT_CHARS)
      return json(c, { code: 'DRAFT_TOO_LONG' }, 413)
    if ((streaming.get(accountId) ?? 0) >= MAX_STREAMS_PER_ACCOUNT)
      return json(c, { code: 'RATE_LIMITED' }, 429)
    if (await overLimitOrClosed(pool, `assistant:draft:${accountId}`, 12, now(), 60_000))
      return json(c, { code: 'RATE_LIMITED' }, 429)
    if (await overLimitOrClosed(pool, `assistant:draft-day:${accountId}`, TURNS_PER_DAY, now(), 86_400_000))
      return json(c, { code: 'RATE_LIMITED', window: 'day' }, 429)
    streaming.set(accountId, (streaming.get(accountId) ?? 0) + 1)
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), TURN_DEADLINE_MS)
    const cancel = () => abort.abort()
    c.req.raw.signal.addEventListener('abort', cancel, { once: true })
    try {
      let output = ''
      let usage = null
      let modelName = null
      for await (const part of llm.stream({
        messages: draftPrompt(b.intent, turns),
        signal: abort.signal,
        maxOutputTokens: 4096
      })) {
        if (part.usage) usage = part.usage
        if (part.model) modelName = part.model
        output += part.text ?? ''
        if (output.length > 8000) {
          abort.abort()
          return json(c, { code: 'DRAFT_FAILED' }, 502)
        }
      }
      log.info?.(
        `[assistant] draft account=${accountId} out_chars=${output.length} in_tokens=${usage?.inputTokens ?? 'unknown'} out_tokens=${usage?.outputTokens ?? 'unknown'} model=${modelName ?? '-'}`
      )
      const draft = parseDraft(output, b.intent, b.platform)
      if (!draft) return json(c, { code: 'DRAFT_FAILED' }, 502)
      if ((await readRevision()) !== b.sourceRevision) return json(c, { code: 'DRAFT_CHANGED' }, 409)
      if (b.platform && draft.platform && b.platform !== draft.platform)
        return json(c, { code: 'DRAFT_CHANGED' }, 409)
      if (draft.needsClarification) return json(c, { code: 'DRAFT_AMBIGUOUS' }, 409)
      return json(c, { draft: { ...draft, version: 1, sourceRevision: b.sourceRevision, intent: b.intent } })
    } catch (error) {
      log.warn(`[assistant] draft ${abort.signal.aborted ? 'TIMEOUT' : String(error?.code ?? 'FAILED')}`)
      return json(c, { code: 'DRAFT_FAILED' }, 502)
    } finally {
      clearTimeout(timeout)
      c.req.raw.signal.removeEventListener('abort', cancel)
      streaming.set(accountId, Math.max(0, (streaming.get(accountId) ?? 1) - 1))
    }
  })

  app.post('/api/assistant/turns', async (c) => {
    const who = await signedIn(c)
    if (who.error) return who.error
    const b = await body(c)
    if (b === null) return json(c, { code: 'BAD_MESSAGE' }, 400)
    const message = typeof b.message === 'string' ? b.message.trim() : ''
    const fileIds = fileIdsOf(b.attachments)
    if (fileIds === null) return json(c, { code: 'BAD_ATTACHMENTS', max: MAX_FILES_PER_QUESTION }, 400)
    if ((message === '' && fileIds.length === 0) || message.length > MESSAGE_MAX)
      return json(c, { code: 'BAD_MESSAGE', max: MESSAGE_MAX }, 400)
    const site = typeof b.site === 'string' ? b.site.slice(0, 253) : null
    const start = b.start === true
    const accountId = who.account.id
    const session = sessionOf(b)
    const conversation = await currentConversation(pool, accountId, session.id)
    const asked = conversationIdOf(b)
    if (asked && asked !== conversation.id) return json(c, { code: 'CONVERSATION_CHANGED' }, 409)
    // Retrying a cut stream reuses the owner's stored question and its files.
    let retryTurnId =
      typeof b.retryTurnId === 'string' && /^[1-9][0-9]{0,18}$/.test(b.retryTurnId) ? b.retryTurnId : null
    const requestId = typeof b.requestId === 'string' && UUID.test(b.requestId) ? b.requestId : null
    if (b.requestId !== undefined && !requestId) return json(c, { code: 'BAD_MESSAGE' }, 400)
    if (!retryTurnId && requestId) {
      const { rows } = await pool.query(
        "select id from assistant_turn where conversation_id = $1 and account_id = $2 and request_id = $3 and role = 'user'",
        [conversation.id, accountId, requestId]
      )
      if (rows[0]) retryTurnId = String(rows[0].id)
    }
    if (b.retryTurnId !== undefined && !retryTurnId) return json(c, { code: 'BAD_MESSAGE' }, 400)
    if (retryTurnId) {
      const { rows } = await pool.query(
        `select id from assistant_turn where id = $1 and account_id = $2 and conversation_id = $3
          and role = 'user' and content = $4`,
        [retryTurnId, accountId, conversation.id, message]
      )
      const stored = await filesOfTurns(pool, accountId, [retryTurnId])
      const previous = stored.get(retryTurnId) ?? []
      if (
        !rows.length ||
        previous.length !== fileIds.length ||
        !previous.every((file) => fileIds.includes(file.id))
      )
        return json(c, { code: 'ATTACHMENT_NOT_FOUND' }, 409)
    }
    // Each file must be the asker's own, uploaded into this conversation and not sent yet.
    const files = await looseFiles(pool, accountId, conversation.id, fileIds, retryTurnId)
    if (files === null) return json(c, { code: 'ATTACHMENT_NOT_FOUND' }, 409)
    const at = now()

    // The support channel was switched off while a person still "held" this conversation: nobody can
    // answer it any more, and the panel would wait for ever. Give it back to the assistant.
    if (conversation.state !== 'ai' && !supportOn) {
      await pool.query(
        "update assistant_conversation set state = 'ai', updated_at = now() where id = $1 and account_id = $2",
        [conversation.id, accountId]
      )
      conversation.state = 'ai'
    }

    // A person holds the conversation: store it, queue it for the topic, call no model.
    if (conversation.state !== 'ai') {
      if (
        (await overLimitOrClosed(pool, `assistant:human-day:${accountId}`, HUMAN_PER_DAY, at, 86_400_000)) ||
        (await overLimitOrClosed(pool, `assistant:human:${accountId}`, HUMAN_PER_MINUTE, at, 60_000))
      )
        return json(c, { code: 'RATE_LIMITED', window: 'minute' }, 429)
      const relayed = await support
        ?.fromCustomer({
          accountId,
          conversationId: conversation.id,
          text: message,
          relayText: [message, filesNote(files)].filter(Boolean).join('\n\n'),
          requestId,
          retryTurnId,
          sessionId: session.id,
          attachmentIds: fileIds
        })
        .catch((error) => {
          if (error?.code === 'ATTACHMENT_NOT_FOUND') return { error: error.code }
          throw error
        })
      if (relayed && !('error' in relayed)) {
        return sse(
          frame('meta', {
            conversationId: conversation.id,
            state: relayed.state,
            turnId: relayed.turnId,
            links: [],
            suggestHandoff: false
          }) + frame('done', {})
        )
      }
      if (relayed?.error) return json(c, { code: relayed.error }, 409)
      // Back with the AI between the read above and the lock (the person pressed Resolved in
      // another tab): fall through and let the model answer.
    }

    const ctx = await readAskerContext(pool, readers, { email: who.email, currentSite: site })
    if (!ctx) return json(c, { code: 'NOT_SIGNED_IN' }, 401)
    // The session's title and state are facts for the prompt only; nothing of the session's
    // content is read, and nothing is asked of dsh.
    if (session.title !== null || session.state !== null)
      ctx.session = { title: session.title, state: session.state }
    // Minute first: a burst is refused without spending the day's count.
    if (await overLimitOrClosed(pool, `assistant:min:${accountId}`, TURNS_PER_MINUTE, at, 60_000))
      return json(c, { code: 'RATE_LIMITED', window: 'minute' }, 429)
    if (await overLimitOrClosed(pool, `assistant:day:${accountId}`, TURNS_PER_DAY, at, 86_400_000))
      return json(c, { code: 'RATE_LIMITED', window: 'day' }, 429)
    if ((streaming.get(accountId) ?? 0) >= MAX_STREAMS_PER_ACCOUNT) {
      // Not an answer: give both counts back, it never reached a model.
      await refundOne(pool, `assistant:min:${accountId}`, at, 60_000).catch(() => {})
      await refundOne(pool, `assistant:day:${accountId}`, at, 86_400_000).catch(() => {})
      return json(c, { code: 'BUSY' }, 429)
    }

    const hidden = await readUiHidden(pool)
    const links = navigationFor(ctx, { start, hidden })
    const history = await historyOf(pool, accountId, conversation.id, start ? DRAFT_TURNS : undefined)
    // The model reads what was attached (names, kinds, sizes), never the bytes.
    const question = [message, filesNote(files)].filter((part) => part !== '').join('\n\n')
    const messages = [
      {
        role: 'system',
        content: systemPrompt(
          ctx,
          links,
          new Date(at),
          hidden,
          message,
          // The earlier questions keep their guide articles in the prompt, so a follow-up still has the
          // facts the earlier answers in the history were built on.
          history.filter((m) => m.role === 'user').map((m) => m.content),
          { start }
        )
      },
      ...history,
      { role: 'user', content: question }
    ]

    const abort = new AbortController()
    const deadline = setTimeout(() => abort.abort(), TURN_DEADLINE_MS)
    c.req.raw.signal?.addEventListener('abort', () => abort.abort(), { once: true })
    const answer = llm.stream({ messages, signal: abort.signal })

    // The first step resolves the credential and opens the provider's stream, so the refusals a
    // widget can explain (no model, provider down) still get a status instead of an SSE error.
    let first
    try {
      first = await answer.next()
    } catch (error) {
      clearTimeout(deadline)
      // 🔒 A TURN THE MODEL NEVER STARTED IS NOT A TURN: the person is not charged for it.
      await refundOne(pool, `assistant:min:${accountId}`, at, 60_000).catch(() => {})
      await refundOne(pool, `assistant:day:${accountId}`, at, 86_400_000).catch(() => {})
      const code = error?.code === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : 'ASSISTANT_UNAVAILABLE'
      log.warn(
        `[assistant] ${String(error?.code ?? 'FAILED')}${error?.status ? ` HTTP ${error.status}` : ''}`
      )
      return json(c, { code }, 503)
    }
    const modelName = typeof first.value?.model === 'string' ? first.value.model : null

    // Every turn is written under the conversation's lock (`store.js` says why).
    const write = (turn, claim = []) =>
      tx(pool, async (client) => {
        const locked = await lockCurrent(client, accountId, conversation.id, session.id)
        if (!locked) return null
        const id = await saveTurn(client, {
          conversationId: conversation.id,
          accountId,
          anchorSeq: session.anchorSeq,
          ...turn
        })
        // The question and its files are stored together, or neither is.
        if (id) await claimFiles(client, accountId, id, claim)
        return id
      })
    let userTurnId
    try {
      userTurnId =
        retryTurnId ??
        (await write(
          { role: 'user', content: message, requestId },
          files.map((f) => f.id)
        ))
    } catch (error) {
      // A database failure here would leave the provider stream open until the deadline.
      clearTimeout(deadline)
      abort.abort()
      if (error?.code === 'ATTACHMENT_NOT_FOUND') return json(c, { code: error.code }, 409)
      throw error
    }
    if (userTurnId === null) {
      clearTimeout(deadline)
      abort.abort()
      return json(c, { code: 'CONVERSATION_CHANGED' }, 409)
    }

    streaming.set(accountId, (streaming.get(accountId) ?? 0) + 1)
    const encoder = new TextEncoder()
    let said = ''
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event, data) => controller.enqueue(encoder.encode(frame(event, data)))
        send('meta', {
          conversationId: conversation.id,
          state: 'ai',
          turnId: userTurnId,
          links,
          suggestHandoff: supportOn && wantsHuman(message)
        })
        let failure = null
        /** What the provider said the answer cost; null is unknown, never zero. */
        let usage = null
        try {
          if (first.value?.usage) usage = first.value.usage
          if (typeof first.value?.text === 'string') {
            said += first.value.text
            send('delta', { text: first.value.text })
          }
          for await (const piece of answer) {
            if (piece.usage) usage = piece.usage
            if (typeof piece.text !== 'string') continue
            said += piece.text
            send('delta', { text: piece.text })
          }
        } catch (error) {
          failure = String(error?.code ?? 'FAILED')
          log.warn(`[assistant] stream ${failure}`)
        }
        clearTimeout(deadline)
        streaming.set(accountId, Math.max(0, (streaming.get(accountId) ?? 1) - 1))
        // What this turn cost, in characters: the provider's own token counts are not asked for
        // (`stream_options` is not every vendor's), but a per-account trace is what an operator needs.
        log.info?.(
          `[assistant] usage account=${accountId} in_chars=${messages.reduce((n, m) => n + m.content.length, 0)} out_chars=${said.length} in_tokens=${usage?.inputTokens ?? 'unknown'} out_tokens=${usage?.outputTokens ?? 'unknown'} model=${modelName ?? '-'}`
        )
        // 🔒 A 200 with nothing in it is a failure, not a blank answer: a filter, or reasoning that
        // spent the whole token budget. Saying `done` would leave an empty bubble and no error.
        if (!failure && said.trim() === '') {
          failure = 'EMPTY'
          log.warn('[assistant] stream EMPTY')
        }
        // Kept even when cut short: the next turn should know what the asker already read. A
        // conversation cleared meanwhile keeps nothing (`write` answers null).
        let turnId = null
        if (said.trim() !== '')
          turnId = await write({
            role: 'assistant',
            replyToId: userTurnId,
            content: said,
            model: modelName,
            inputTokens: usage?.inputTokens ?? null,
            outputTokens: usage?.outputTokens ?? null
          }).catch(() => null)
        try {
          if (failure) send('error', { code: abort.signal.aborted ? 'TIMEOUT' : failure })
          else send('done', turnId ? { turnId } : {})
          controller.close()
        } catch {
          // The asker closed the panel; nobody is left to tell.
        }
      },
      cancel() {
        abort.abort()
      }
    })
    return sse(stream)
  })

  app.post('/api/assistant/handoff', async (c) => {
    const who = await signedIn(c)
    if (who.error) return who.error
    if (!supportOn) return json(c, { code: 'SUPPORT_UNAVAILABLE' }, 503)
    const b = await body(c)
    const conversationId = conversationIdOf(b)
    if (!conversationId) return json(c, { code: 'BAD_REQUEST' }, 400)
    const at = now()
    if (
      await overLimitOrClosed(pool, `assistant:handoff:h:${who.account.id}`, HANDOFFS_PER_HOUR, at, 3_600_000)
    )
      return json(c, { code: 'RATE_LIMITED', window: 'hour' }, 429)
    if (
      await overLimitOrClosed(pool, `assistant:handoff:d:${who.account.id}`, HANDOFFS_PER_DAY, at, 86_400_000)
    )
      return json(c, { code: 'RATE_LIMITED', window: 'day' }, 429)
    // The summary names the site on screen only when it is one of the asker's own seats.
    const ctx = await readAskerContext(pool, readers, {
      email: who.email,
      currentSite: typeof b.site === 'string' ? b.site.slice(0, 253) : null
    })
    const site = ctx?.current ? { name: ctx.current.name, platform: ctx.current.platform } : null
    const out = await support.open({
      accountId: who.account.id,
      email: who.account.email,
      conversationId,
      site
    })
    if ('error' in out) return json(c, { code: out.error }, out.error === 'CONVERSATION_CHANGED' ? 409 : 503)
    return json(c, out, 202)
  })

  app.post('/api/assistant/handoff/end', async (c) => {
    const who = await signedIn(c)
    if (who.error) return who.error
    const b = await body(c)
    const conversationId = conversationIdOf(b)
    const reason = b?.reason === 'resolved' || b?.reason === 'back_to_ai' ? b.reason : null
    if (!conversationId || !reason) return json(c, { code: 'BAD_REQUEST' }, 400)
    if (!support) return json(c, { state: 'ai' })
    const out = await support.end({ accountId: who.account.id, conversationId, reason })
    if ('error' in out) return json(c, { code: out.error }, 409)
    return json(c, out)
  })

  app.post('/api/assistant/conversation/read', async (c) => {
    const who = await signedIn(c)
    if (who.error) return who.error
    const b = await body(c)
    const conversationId = conversationIdOf(b)
    const through = typeof b?.through === 'string' && TURN_ID.test(b.through) ? b.through : null
    if (!conversationId || !through) return json(c, { code: 'BAD_REQUEST' }, 400)
    await markRead(pool, who.account.id, conversationId, through)
    return c.body(null, 204)
  })

  app.post('/api/assistant/turns/:id/rating', async (c) => {
    const who = await signedIn(c)
    if (who.error) return who.error
    const id = c.req.param('id')
    const b = await body(c)
    const rating = b?.rating === 1 || b?.rating === -1 || b?.rating === null ? b.rating : undefined
    if (!TURN_ID.test(id) || rating === undefined) return json(c, { code: 'BAD_REQUEST' }, 400)
    // Another account's turn, a user turn and a cleared conversation's turn all read as not found.
    if (!(await rateTurn(pool, who.account.id, id, rating))) return json(c, { code: 'NOT_FOUND' }, 404)
    return c.body(null, 204)
  })

  app.post('/api/assistant/tip/seen', async (c) => {
    const who = await signedIn(c)
    if (who.error) return who.error
    await markTipSeen(pool, who.account.id)
    return c.body(null, 204)
  })

  app.post('/api/assistant/conversation/clear', async (c) => {
    const who = await signedIn(c)
    if (who.error) return who.error
    const b = await body(c)
    const conversationId = conversationIdOf(b)
    if (support) {
      const out = await support.clear({ accountId: who.account.id, conversationId })
      if ('error' in out) return json(c, { code: out.error }, 409)
    } else {
      await tx(pool, async (client) => {
        const locked = await lockCurrent(client, who.account.id, conversationId)
        if (locked)
          await client.query('update assistant_conversation set cleared_at = now() where id = $1', [
            locked.id
          ])
      })
    }
    const fresh = await currentConversation(pool, who.account.id)
    return json(c, { conversationId: fresh.id, state: fresh.state })
  })

  app.get('/api/assistant/attachments/:id', async (c) => {
    const who = await signedIn(c)
    if (who.error) return who.error
    const id = c.req.param('id')
    if (!UUID.test(id) || !objects) return json(c, { code: 'NOT_FOUND' }, 404)
    const row = await ownFile(pool, who.account.id, id.toLowerCase())
    const res = row ? await objects.get(row.object_key) : null
    if (!row || !res?.ok) return json(c, { code: 'NOT_FOUND' }, 404)
    // A picture opens in place; any other file downloads, and nothing here can run as a page.
    const inline = isPicture(row.content_type)
    return new Response(res.body, {
      headers: {
        'content-type': row.content_type,
        'cache-control': 'private, max-age=3600',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'content-disposition': row.name ? disposition(inline ? 'inline' : 'attachment', row.name) : 'inline'
      }
    })
  })

  app.post('/api/assistant/telegram/webhook', async (c) => {
    const secret = config.csTelegram?.webhookSecret
    // Off, or polling: this door does not exist. A wrong secret looks the same as no door.
    if (!supportOn || !secret) return c.text('Not found', 404)
    if (!sameSecret(c.req.header('x-telegram-bot-api-secret-token'), secret)) return c.text('Not found', 404)
    if (Number(c.req.header('content-length') ?? 0) > WEBHOOK_MAX_BYTES) return c.text('Too large', 413)
    const raw = await c.req.text()
    if (raw.length > WEBHOOK_MAX_BYTES) return c.text('Too large', 413)
    let update
    try {
      update = JSON.parse(raw)
    } catch {
      return c.text('ok')
    }
    // A database failure throws through to a 5xx, and Telegram sends the update again.
    if (update?.message) await support.receive(update.message)
    return c.text('ok')
  })

  return app
}
