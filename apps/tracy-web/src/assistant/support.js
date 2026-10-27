/**
 * The AI Assistant hands a conversation to a person (05/10/2026).
 *
 *   customer presses "Talk to a person" ─► state waiting_human, a handoff row, outbox:
 *     create_topic (one topic per customer in the CS forum group; asking again reopen_topic's the
 *     same one) → send_text (the summary)
 *   customer writes while a person holds it ─► stored, outbox send_text "Customer: …"; no model
 *   staff writes in the topic ─► Telegram → `receive` → a `staff` turn (text, or a photo kept in
 *     the artifact store) → state human; the panel picks it up on its next poll
 *   customer presses Resolved / Back to chatbot, or clears ─► state ai, outbox: a note, close_topic
 *
 * 🔒 WHO ANSWERS IS THE DATABASE'S STATE, never the model's. Nothing the model writes opens a
 * handoff; only the panel's own door does, after the person confirms.
 *
 * 🔒 A TOPIC REACHES ONE ACCOUNT. A staff message is relayed only through the handoff row bound to
 * its (chat, topic), and only while that handoff is open and its conversation is current. Not the
 * topic's title, not an email in the text, not a reply-to.
 *
 * 🔒 TELEGRAM IS CALLED OUTSIDE EVERY TRANSACTION. What must reach it is written to
 * `assistant_outbox` in the same transaction as the change that caused it, then sent in order per
 * handoff by `drain`. A crash between the two loses nothing; a lost response can repeat a message
 * (Telegram has no idempotency key), which a person in the topic can tell apart.
 *
 * Module graph: `lib/`, `db/` and its own files only; the artifact store arrives as `objects`.
 */
import { randomUUID } from 'node:crypto'
import { PHOTO_MAX_BYTES, splitText } from './telegram.js'
import { lockCurrent, purgeCleared, saveTurn, tx } from './store.js'
import { claimFiles } from './files.js'

/** Turns the summary carries, newest last, and how long it may grow. */
const SUMMARY_TURNS = 12
const SUMMARY_MAX = 6000
/** Outbox pacing: how often it is looked at, and the longest a failing row waits. */
const DRAIN_EVERY_MS = 3000
const BACKOFF_MAX_MS = 10 * 60 * 1000
const LEASE_S = 60
/** Cleared conversations are deleted after this; the current one is kept until cleared. */
export const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000
/** A lock id of its own: the long poll holds it for minutes, the cron's lock must not wait on it. */
const POLL_LOCK_ID = 7_243_017
const POLL_TIMEOUT_S = 25

const ROLE_LABEL = { user: 'Customer', assistant: 'Tracy AI', staff: 'Tracy team' }
const END_NOTE = {
  resolved: 'The customer marked this as resolved. The conversation is back with the AI assistant.',
  back_to_ai: 'The customer went back to the chatbot. The conversation is back with the AI assistant.',
  cleared: 'The customer cleared the conversation. Nothing more reaches them from this topic.'
}
const UNSUPPORTED_NOTE = 'Only text and photos reach the customer. Please send this as text or a photo.'
const PHOTO_FAILED_NOTE = 'That photo could not be delivered to the customer. Please describe it in text.'

/**
 * An answer's Markdown as Telegram shows plain text: a link keeps its label (its address is a path
 * inside the customer's app, useless to staff), bold and code marks go, whitespace collapses.
 * @param {string} text
 */
export function plainText(text) {
  return text
    .replace(/\[([^\]]+)\]\(<?[^)\s>]*>?\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The text staff read first: who asks, from which site, and what was said, as plain text.
 * @param {{ email: string, again?: boolean, site: { name: string, platform: string | null } | null,
 *   turns: Array<{ role: string, content: string, staff_name?: string | null }> }} input
 */
export function summaryText({ email, site, turns, again = false }) {
  const head = [
    again ? 'The customer asked for a person again' : 'New request to talk to a person',
    `Customer: ${email}`,
    `Site on screen: ${site ? `${site.name}${site.platform ? ` (${site.platform})` : ''}` : 'none'}`,
    '',
    'Recent messages:'
  ]
  const lines = turns.slice(-SUMMARY_TURNS).map((t) => {
    const who =
      t.role === 'staff' && t.staff_name ? `${t.staff_name} (Tracy team)` : (ROLE_LABEL[t.role] ?? t.role)
    return `${who}: ${plainText(t.content)}`
  })
  if (lines.length === 0) lines.push('(none)')
  let body = lines.join('\n')
  if (body.length > SUMMARY_MAX) body = `…(older messages cut)\n${body.slice(-SUMMARY_MAX)}`
  return [...head, body, '', 'Reply in this topic: your messages reach the customer’s chat panel.'].join('\n')
}

/**
 * @param {{
 *   pool: import('pg').Pool,
 *   cs: { mode: 'webhook' | 'polling', chatId: string, staffIds: string[] } | null,
 *   api: ReturnType<typeof import('./telegram.js').telegramApi> | null,
 *   objects?: { put: (key: string, bytes: Uint8Array, type: string) => Promise<boolean>,
 *     get: (key: string) => Promise<Response | null>, delete: (key: string) => Promise<void> } | null,
 *   log?: { warn: (...a: unknown[]) => void },
 *   now?: () => number
 * }} deps
 */
export function createSupport({ pool, cs, api, objects = null, log = console, now = Date.now }) {
  const available = Boolean(cs && api)

  async function enqueue(client, handoffId, kind, payload = {}) {
    await client.query('insert into assistant_outbox (handoff_id, kind, payload) values ($1, $2, $3)', [
      handoffId,
      kind,
      JSON.stringify(payload)
    ])
  }

  async function openHandoffOf(client, conversationId) {
    const { rows } = await client.query(
      "select * from assistant_handoff where conversation_id = $1 and status = 'open'",
      [conversationId]
    )
    return rows[0] ?? null
  }

  async function endIn(client, conversation, reason) {
    const handoff = await openHandoffOf(client, conversation.id)
    if (handoff) {
      await client.query(
        "update assistant_handoff set status = 'ended', ended_reason = $2, ended_at = now() where id = $1",
        [handoff.id, reason]
      )
      if (reason === 'cleared') {
        // What the customer wrote and was not sent yet stays unsent: they asked for it to be gone.
        await client.query(
          `update assistant_outbox set done_at = now(), error = 'CANCELLED'
            where handoff_id = $1 and done_at is null and kind = 'send_text' and (payload->>'customer') = 'true'
              and lease_until is null`,
          [handoff.id]
        )
      }
      await enqueue(client, handoff.id, 'send_text', { text: END_NOTE[reason] })
      await enqueue(client, handoff.id, 'close_topic')
    }
    await client.query("update assistant_conversation set state = 'ai', updated_at = now() where id = $1", [
      conversation.id
    ])
  }

  return {
    available,

    /**
     * Hand the current conversation to a person.
     * @param {{ accountId: string, email: string, conversationId: string,
     *   site: { name: string, platform: string | null } | null }} ask
     * @returns {Promise<{ state: string } | { error: string }>}
     */
    async open({ accountId, email, conversationId, site }) {
      if (!available) return { error: 'SUPPORT_UNAVAILABLE' }
      return tx(pool, async (client) => {
        const conversation = await lockCurrent(client, accountId, conversationId)
        if (!conversation) return { error: 'CONVERSATION_CHANGED' }
        if (conversation.state !== 'ai') return { state: conversation.state }
        const { rows: turns } = await client.query(
          `select role, content, staff_name from (
             select id, role, content, staff_name from assistant_turn
              where account_id = $1 and conversation_id = $2 order by id desc limit $3
           ) last order by id asc`,
          [accountId, conversation.id, SUMMARY_TURNS]
        )
        // The account's last topic in this group, if it ever had one: reopened, not replaced
        // (06/10/2026), so the team keeps the whole history of this customer in one place.
        const { rows: earlier } = await client.query(
          `select topic_id from assistant_handoff
            where account_id = $1 and chat_id = $2 and topic_id is not null
            order by opened_at desc limit 1`,
          [accountId, cs.chatId]
        )
        const topicId = earlier[0]?.topic_id ?? null
        const handoffId = randomUUID()
        await client.query(
          'insert into assistant_handoff (id, account_id, conversation_id, chat_id, topic_id) values ($1, $2, $3, $4, $5)',
          [handoffId, accountId, conversation.id, cs.chatId, topicId]
        )
        await client.query(
          "update assistant_conversation set state = 'waiting_human', updated_at = now() where id = $1",
          [conversation.id]
        )
        const name = `${email} · ${handoffId.slice(0, 6)}`
        await enqueue(client, handoffId, topicId === null ? 'create_topic' : 'reopen_topic', { name })
        await enqueue(client, handoffId, 'send_text', {
          text: summaryText({ email, site, turns, again: topicId !== null })
        })
        return { state: 'waiting_human' }
      })
    },

    /**
     * Give the conversation back to the AI.
     * @param {{ accountId: string, conversationId: string, reason: 'resolved' | 'back_to_ai' }} ask
     */
    async end({ accountId, conversationId, reason }) {
      return tx(pool, async (client) => {
        const conversation = await lockCurrent(client, accountId, conversationId)
        if (!conversation) return { error: 'CONVERSATION_CHANGED' }
        if (conversation.state !== 'ai') await endIn(client, conversation, reason)
        return { state: 'ai' }
      })
    },

    /**
     * Clear the account's current conversation (ending a handoff with a note) and start a new one.
     * @param {{ accountId: string, conversationId: string | null }} ask
     */
    async clear({ accountId, conversationId }) {
      return tx(pool, async (client) => {
        const conversation = await lockCurrent(client, accountId, conversationId)
        if (!conversation) return { error: 'CONVERSATION_CHANGED' }
        if (conversation.state !== 'ai') await endIn(client, conversation, 'cleared')
        await client.query('update assistant_conversation set cleared_at = now() where id = $1', [
          conversation.id
        ])
        return { cleared: conversation.id }
      })
    },

    /**
     * A customer's message while a person holds the conversation: stored, and queued for the
     * topic. Null when the conversation is with the AI after all (the caller then asks the model).
     * @param {{ accountId: string, conversationId: string, text: string, sessionId?: string, attachmentIds?: string[], relayText?: string, requestId?: string | null, retryTurnId?: string | null }} msg
     * @returns {Promise<{ turnId: string, state: string } | { error: string } | null>}
     */
    async fromCustomer({
      accountId,
      conversationId,
      text,
      relayText = text,
      sessionId = '',
      attachmentIds = [],
      requestId = null,
      retryTurnId = null
    }) {
      return tx(pool, async (client) => {
        const conversation = await lockCurrent(client, accountId, conversationId, sessionId)
        if (!conversation) return { error: 'CONVERSATION_CHANGED' }
        if (conversation.state === 'ai') return null
        // A response lost after commit must not create or relay the same question again.
        const previous = await client.query(
          `select id from assistant_turn where conversation_id = $1 and account_id = $2 and role = 'user'
            and (id = $3::bigint or (request_id = $4::uuid and $4 is not null))`,
          [conversation.id, accountId, retryTurnId, requestId]
        )
        if (previous.rows[0]) return { turnId: String(previous.rows[0].id), state: conversation.state }
        const handoff = await openHandoffOf(client, conversation.id)
        const turnId = await saveTurn(client, {
          conversationId: conversation.id,
          accountId,
          role: 'user',
          content: text,
          requestId,
          handoffId: handoff?.id ?? null
        })
        await claimFiles(client, accountId, turnId, attachmentIds)
        if (handoff)
          await enqueue(client, handoff.id, 'send_text', { text: `Customer: ${relayText}`, customer: true })
        return { turnId, state: conversation.state }
      })
    },

    /**
     * One message Telegram delivered (webhook or poll). Returns what happened, for tests and logs;
     * throws only on a database failure, so a webhook answers 5xx and Telegram retries.
     * @param {any} message - `update.message`.
     * @returns {Promise<string>}
     */
    async receive(message) {
      if (!available || !message || typeof message !== 'object') return 'IGNORED'
      if (String(message.chat?.id) !== cs.chatId) return 'OTHER_CHAT'
      if (message.from?.is_bot || message.sender_chat) return 'NOT_A_PERSON'
      if (cs.staffIds.length > 0 && !cs.staffIds.includes(String(message.from?.id))) return 'NOT_STAFF'
      const topicId = Number(message.message_thread_id)
      if (!message.is_topic_message || !Number.isSafeInteger(topicId)) return 'NO_TOPIC'
      const { rows } = await pool.query(
        "select * from assistant_handoff where chat_id = $1 and topic_id = $2 and status = 'open'",
        [cs.chatId, topicId]
      )
      const handoff = rows[0]
      if (!handoff) return 'NO_OPEN_HANDOFF'

      const text =
        typeof message.text === 'string'
          ? message.text
          : typeof message.caption === 'string'
            ? message.caption
            : ''
      const photos = Array.isArray(message.photo) ? message.photo : []
      if (text === '' && photos.length === 0) {
        // A service line (topic created, pinned…) carries none of these: say nothing back to it.
        const media = [
          'document',
          'video',
          'voice',
          'audio',
          'sticker',
          'animation',
          'video_note',
          'contact',
          'location'
        ]
        if (media.some((k) => k in message))
          await tx(pool, (client) => enqueue(client, handoff.id, 'send_text', { text: UNSUPPORTED_NOTE }))
        return media.some((k) => k in message) ? 'UNSUPPORTED' : 'IGNORED'
      }

      let attachment = null
      if (photos.length > 0) {
        // Telegram lists the sizes smallest first; the largest within the cap is the one to keep.
        const pick = [...photos]
          .reverse()
          .find((p) => !Number.isFinite(Number(p.file_size)) || Number(p.file_size) <= PHOTO_MAX_BYTES)
        try {
          if (!pick || !objects) throw Object.assign(new Error('NO_STORE'), { code: 'NO_STORE' })
          const { bytes, size } = await api.download(pick.file_id)
          const id = randomUUID()
          const key = `assistant/${handoff.account_id}/${id}`
          if (!(await objects.put(key, bytes, 'image/jpeg')))
            throw Object.assign(new Error('STORE'), { code: 'STORE' })
          attachment = { id, key, size }
        } catch (error) {
          log.warn(`[assistant] photo not relayed: ${String(error?.code ?? 'FAILED')}`)
          await tx(pool, (client) => enqueue(client, handoff.id, 'send_text', { text: PHOTO_FAILED_NOTE }))
          if (text === '') return 'PHOTO_FAILED'
        }
      }

      const name = typeof message.from?.first_name === 'string' ? message.from.first_name.slice(0, 64) : null
      return tx(pool, async (client) => {
        const { rows: convs } = await client.query(
          'select * from assistant_conversation where id = $1 and account_id = $2 and cleared_at is null for update',
          [handoff.conversation_id, handoff.account_id]
        )
        const conversation = convs[0]
        const { rows: still } = await client.query('select status from assistant_handoff where id = $1', [
          handoff.id
        ])
        if (!conversation || still[0]?.status !== 'open') {
          // The picture was stored before this transaction; with no handoff to hang it on it is an orphan.
          if (attachment) await objects?.delete(attachment.key).catch(() => {})
          return 'NO_OPEN_HANDOFF'
        }
        if (attachment)
          await client.query(
            `insert into assistant_attachment (id, account_id, conversation_id, object_key, content_type, bytes)
             values ($1, $2, $3, $4, 'image/jpeg', $5)`,
            [attachment.id, handoff.account_id, conversation.id, attachment.key, attachment.size]
          )
        const turnId = await saveTurn(client, {
          conversationId: conversation.id,
          accountId: handoff.account_id,
          role: 'staff',
          content: text,
          handoffId: handoff.id,
          staffName: name,
          telegramMessageId: Number(message.message_id),
          attachmentId: attachment?.id ?? null
        })
        if (turnId === null) return 'DUPLICATE'
        await client.query(
          "update assistant_conversation set state = 'human', updated_at = now() where id = $1 and state = 'waiting_human'",
          [conversation.id]
        )
        await client.query(
          'update assistant_handoff set first_staff_reply_at = coalesce(first_staff_reply_at, now()) where id = $1',
          [handoff.id]
        )
        return 'RELAYED'
      })
    },

    /** Send what is due, oldest first, one row at a time per handoff. @returns {Promise<number>} rows done */
    async drain(limit = 20) {
      if (!available) return 0
      let done = 0
      for (let i = 0; i < limit; i++) {
        const { rows } = await pool.query(
          `update assistant_outbox o
              set lease_until = now() + ($1 || ' seconds')::interval, attempts = o.attempts + 1
            where o.id = (
              select o2.id from assistant_outbox o2
               where o2.done_at is null and o2.next_at <= now()
                 and (o2.lease_until is null or o2.lease_until < now())
                 and not exists (select 1 from assistant_outbox p
                                  where p.handoff_id = o2.handoff_id and p.done_at is null and p.id < o2.id)
               order by o2.id for update skip locked limit 1)
            returning o.*`,
          [String(LEASE_S)]
        )
        const row = rows[0]
        if (!row) break
        const { rows: hs } = await pool.query(
          'select chat_id, topic_id from assistant_handoff where id = $1',
          [row.handoff_id]
        )
        const handoff = hs[0]
        try {
          if (row.kind === 'create_topic') {
            if (handoff.topic_id === null) {
              const topic = await api.createTopic(handoff.chat_id, row.payload.name)
              await pool.query('update assistant_handoff set topic_id = $2 where id = $1', [
                row.handoff_id,
                topic.message_thread_id
              ])
            }
          } else if (row.kind === 'reopen_topic') {
            await api.reopenTopic(handoff.chat_id, Number(handoff.topic_id)).catch(async (error) => {
              const why = String(error?.description)
              // Already open (someone reopened it by hand): the outcome we wanted.
              if (/TOPIC_NOT_MODIFIED/i.test(why)) return
              // Deleted in Telegram: this customer gets a fresh topic instead.
              if (/TOPIC_ID_INVALID|TOPIC_DELETED|thread not found/i.test(why)) {
                const topic = await api.createTopic(handoff.chat_id, row.payload.name)
                await pool.query('update assistant_handoff set topic_id = $2 where id = $1', [
                  row.handoff_id,
                  topic.message_thread_id
                ])
                return
              }
              throw error
            })
          } else if (handoff.topic_id === null) {
            throw Object.assign(new Error('NO_TOPIC'), { code: 'NO_TOPIC' })
          } else if (row.kind === 'send_text') {
            for (const piece of splitText(row.payload.text))
              await api.sendText(handoff.chat_id, Number(handoff.topic_id), piece)
          } else if (row.kind === 'close_topic') {
            await api.closeTopic(handoff.chat_id, Number(handoff.topic_id)).catch((error) => {
              // Closed by hand in Telegram already: the outcome we wanted.
              if (!/TOPIC_NOT_MODIFIED|TOPIC_CLOSED/i.test(String(error?.description))) throw error
            })
          }
          await pool.query(
            'update assistant_outbox set done_at = now(), lease_until = null, error = null where id = $1',
            [row.id]
          )
          done++
        } catch (error) {
          const code = String(error?.code ?? 'FAILED')
          const wait = error?.retryAfter
            ? error.retryAfter * 1000
            : Math.min(BACKOFF_MAX_MS, 2000 * 2 ** Math.min(row.attempts, 10))
          await pool.query(
            `update assistant_outbox set lease_until = null, error = $2, next_at = now() + ($3 || ' milliseconds')::interval where id = $1`,
            [row.id, code, String(wait)]
          )
          log.warn(
            `[assistant] telegram ${row.kind} failed: ${code}${error?.status ? ` HTTP ${error.status}` : ''}`
          )
        }
      }
      return done
    },

    /** Delete what was cleared long enough ago, pictures included. */
    async purge() {
      const keys = await purgeCleared(pool, PURGE_AFTER_MS, now())
      for (const key of keys) await objects?.delete(key).catch(() => {})
      return keys.length
    },

    /** The bytes of a picture, only for the account that owns it. */
    async picture(accountId, id) {
      if (!objects) return null
      const { rows } = await pool.query(
        `select a.object_key, a.content_type from assistant_attachment a
           join assistant_conversation c on c.id = a.conversation_id
          where a.id = $1 and a.account_id = $2 and c.account_id = $2 and c.cleared_at is null`,
        [id, accountId]
      )
      if (!rows[0]) return null
      const res = await objects.get(rows[0].object_key)
      return res?.ok ? { body: res.body, type: rows[0].content_type } : null
    },

    /** Start the outbox, the purge, and — on a laptop — the long poll. @returns {{ stop: () => Promise<void> }} */
    start() {
      if (!available) return { stop: async () => {} }
      let draining = false
      const tick = async () => {
        if (draining) return
        draining = true
        try {
          await this.drain()
        } catch (error) {
          log.warn(`[assistant] outbox: ${String(error?.code ?? error?.message ?? error)}`)
        } finally {
          draining = false
        }
      }
      const drainTimer = setInterval(tick, DRAIN_EVERY_MS)
      const purgeTimer = setInterval(() => this.purge().catch(() => {}), 60 * 60 * 1000)
      const abort = new AbortController()
      const polling = cs.mode === 'polling' ? this.poll(abort.signal) : Promise.resolve()
      return {
        stop: async () => {
          clearInterval(drainTimer)
          clearInterval(purgeTimer)
          abort.abort()
          await polling.catch(() => {})
        }
      }
    },

    /**
     * getUpdates until `signal` aborts, holding an advisory lock so one process polls at a time.
     * The offset moves only after a batch is handled, so a crash re-reads it (`receive` dedupes).
     */
    async poll(signal) {
      const bot = `cs:${cs.chatId}`
      while (!signal.aborted) {
        const client = await pool.connect().catch(() => null)
        if (!client) {
          await sleep(10_000, signal)
          continue
        }
        try {
          const { rows } = await client.query('select pg_try_advisory_lock($1) as ok', [POLL_LOCK_ID])
          if (!rows[0].ok) {
            await sleep(30_000, signal)
            continue
          }
          while (!signal.aborted) {
            const { rows: off } = await pool.query(
              'select next_update_id from assistant_telegram_offset where bot = $1',
              [bot]
            )
            const offset = Number(off[0]?.next_update_id ?? 0)
            let updates
            try {
              updates = await api.getUpdates({ offset, timeout: POLL_TIMEOUT_S, signal })
            } catch (error) {
              if (signal.aborted) break
              log.warn(`[assistant] getUpdates: ${String(error?.code ?? 'FAILED')}`)
              await sleep(error?.retryAfter ? error.retryAfter * 1000 : 5000, signal)
              continue
            }
            for (const update of updates ?? []) {
              try {
                if (update.message) await this.receive(update.message)
              } catch (error) {
                // One update that cannot be handled must not hold every later one back: say so, move on.
                log.warn(
                  `[assistant] update ${String(update.update_id)} skipped: ${String(error?.code ?? error?.message ?? error)}`
                )
              }
              await pool.query(
                `insert into assistant_telegram_offset (bot, next_update_id) values ($1, $2)
                 on conflict (bot) do update set next_update_id = excluded.next_update_id, updated_at = now()`,
                [bot, Number(update.update_id) + 1]
              )
            }
          }
          await client.query('select pg_advisory_unlock($1)', [POLL_LOCK_ID]).catch(() => {})
        } catch (error) {
          log.warn(`[assistant] poll: ${String(error?.code ?? error?.message ?? error)}`)
          await sleep(5000, signal)
        } finally {
          client.release()
        }
      }
    }
  }
}

/** @param {number} ms @param {AbortSignal} signal */
function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(undefined)
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), resolve(undefined)), { once: true })
  })
}
