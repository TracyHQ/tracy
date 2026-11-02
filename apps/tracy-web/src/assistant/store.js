/**
 * The assistant's conversations (`assistant_conversation`, `assistant_turn`, migrations 064–065, 071–072).
 *
 * 🔒 EVERY READ AND WRITE NAMES THE ACCOUNT. An account has one current conversation (the row with
 * `cleared_at is null`); a conversation id alone opens nothing, so an id from another person's
 * browser reads back as nothing, never as theirs.
 *
 * 🔒 EVERY WRITER LOCKS THE CONVERSATION ROW FIRST (`lockCurrent`). Turn ids come from a sequence,
 * handed out before commit: two writers on one conversation that did not take turns could commit
 * id 12 after a poll already moved past 13, and the panel would never show 12.
 */

import { filesNote } from './files.js'

/** How many earlier turns ride along with a new one: enough to follow a thread, cheap to send. */
export const HISTORY_TURNS = 12
/** What a panel restores at once; older turns stay in the database. */
export const RESTORE_TURNS = 50
/** One poll's page. */
export const PAGE_TURNS = 100

/**
 * Run `fn(client)` in one transaction on its own connection.
 * @template T
 * @param {import('pg').Pool} pool
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function tx(pool, fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const out = await fn(client)
    await client.query('commit')
    return out
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * This account's current conversation in one agent session (`sessionId` ''  is the account-level
 * one the Telegram handoff uses), created on first use. Two first requests at once both get the
 * same row: the partial unique index lets only one insert land.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} accountId
 * @param {string} [sessionId]
 */
export async function currentConversation(db, accountId, sessionId = '') {
  await db.query(
    `insert into assistant_conversation (id, account_id, session_id) values (gen_random_uuid(), $1, $2)
     on conflict (account_id, session_id) where cleared_at is null do nothing`,
    [accountId, sessionId]
  )
  const { rows } = await db.query(
    'select * from assistant_conversation where account_id = $1 and session_id = $2 and cleared_at is null',
    [accountId, sessionId]
  )
  return rows[0]
}

/**
 * The current conversation, locked for the rest of the transaction. Null when `expectedId` is
 * given and is no longer the current one (cleared in another tab).
 * @param {import('pg').PoolClient} client
 * @param {string} accountId
 * @param {string | null} [expectedId]
 * @param {string} [sessionId]
 */
export async function lockCurrent(client, accountId, expectedId = null, sessionId = '') {
  const row = await currentConversation(client, accountId, sessionId)
  const { rows } = await client.query('select * from assistant_conversation where id = $1 for update', [
    row.id
  ])
  const locked = rows[0]
  if (!locked || locked.cleared_at !== null) return null
  if (expectedId && locked.id !== expectedId) return null
  return locked
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {{ conversationId: string, accountId: string, role: 'user' | 'assistant' | 'staff', content: string,
 *   model?: string | null, handoffId?: string | null, staffName?: string | null,
 *   telegramMessageId?: number | null, attachmentId?: string | null, anchorSeq?: number | null,
 *   inputTokens?: number | null, outputTokens?: number | null, replyToId?: string | null, requestId?: string | null }} turn
 * @returns {Promise<string | null>} the new turn's id, or null when Telegram redelivered a message
 *   that already landed.
 */
export async function saveTurn(
  db,
  {
    conversationId,
    accountId,
    role,
    content,
    model = null,
    handoffId = null,
    staffName = null,
    telegramMessageId = null,
    attachmentId = null,
    anchorSeq = null,
    inputTokens = null,
    outputTokens = null,
    replyToId = null,
    requestId = null,
    ended = null
  }
) {
  const { rows } = await db.query(
    `insert into assistant_turn
       (conversation_id, account_id, role, content, model, handoff_id, staff_name, telegram_message_id, attachment_id, anchor_seq,
        input_tokens, output_tokens, reply_to_turn_id, request_id, ended)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     on conflict (handoff_id, telegram_message_id) where telegram_message_id is not null do nothing
     returning id`,
    [
      conversationId,
      accountId,
      role,
      content,
      model,
      handoffId,
      staffName,
      telegramMessageId,
      attachmentId,
      anchorSeq,
      inputTokens,
      outputTokens,
      replyToId,
      requestId,
      ended
    ]
  )
  await db.query('update assistant_conversation set updated_at = now() where id = $1', [conversationId])
  return rows[0] ? String(rows[0].id) : null
}

/**
 * The last turns for the model, oldest first. A staff reply goes to the model as an assistant
 * turn LABELLED as the team's, so it reads what the customer was told without taking it as its own
 * words or as an instruction. A question that carried files keeps the line naming them
 * (`files.js`, `filesNote`), so a follow-up still knows what was attached.
 * @param {import('pg').Pool} pool
 * @param {string} accountId
 * @param {string} conversationId
 * @returns {Promise<Array<{ role: 'user' | 'assistant', content: string }>>}
 */
export async function historyOf(pool, accountId, conversationId, limit = HISTORY_TURNS) {
  const { rows } = await pool.query(
    `select role, content, staff_name, files from (
       select t.id, t.role, t.content, t.staff_name,
              (select json_agg(json_build_object('name', a.name, 'type', a.content_type, 'bytes', a.bytes)
                               order by a.created_at, a.id)
                 from assistant_attachment a
                where a.turn_id = t.id and a.account_id = t.account_id and a.source = 'customer') as files
         from assistant_turn t
        where t.account_id = $1 and t.conversation_id = $2
        order by t.id desc limit $3
     ) last order by id asc`,
    [accountId, conversationId, limit]
  )
  return rows.map((r) => {
    if (r.role === 'staff')
      return {
        role: 'assistant',
        content: `[Reply from ${r.staff_name ?? 'a person'} of the Tracy team] ${r.content}`
      }
    const note = r.role === 'user' && Array.isArray(r.files) ? filesNote(r.files) : ''
    return { role: r.role, content: [r.content, note].filter((part) => part !== '').join('\n\n') }
  })
}

/** A turn as the panel draws it. */
function publicTurn(row) {
  return {
    id: String(row.id),
    role: row.role,
    text: row.content,
    ...(row.reply_to_turn_id ? { replyToId: String(row.reply_to_turn_id) } : {}),
    ...(row.staff_name ? { staffName: row.staff_name } : {}),
    ...(row.attachment_id ? { attachmentId: row.attachment_id } : {}),
    ...(row.rating ? { rating: Number(row.rating) } : {}),
    ...(row.anchor_seq !== null && row.anchor_seq !== undefined ? { anchorSeq: Number(row.anchor_seq) } : {}),
    // An answer that did not finish says how it ended (`stopped` | `cut`), so a restore keeps it (#206).
    ...(row.ended ? { ended: row.ended } : {}),
    at: row.created_at instanceof Date ? row.created_at.toISOString() : null
  }
}

/**
 * Turns of this account's conversation: after `after` (oldest first, a poll), or the latest
 * `RESTORE_TURNS` when `after` is null (a restore).
 * @param {import('pg').Pool} pool
 * @param {string} accountId
 * @param {string} conversationId
 * @param {string | null} after
 */
export async function turnsOf(pool, accountId, conversationId, after) {
  const select =
    'select id, role, content, staff_name, attachment_id, anchor_seq, rating, created_at, reply_to_turn_id, ended from assistant_turn'
  const { rows } =
    after === null
      ? await pool.query(
          `select * from (${select} where account_id = $1 and conversation_id = $2 order by id desc limit $3) last order by id asc`,
          [accountId, conversationId, RESTORE_TURNS]
        )
      : await pool.query(
          `${select} where account_id = $1 and conversation_id = $2 and id > $3 order by id asc limit $4`,
          [accountId, conversationId, after, PAGE_TURNS]
        )
  return rows.map(publicTurn)
}

/** Staff turns the person has not seen yet. */
export async function unreadOf(pool, conversation) {
  const { rows } = await pool.query(
    `select count(*)::int as n from assistant_turn
      where conversation_id = $1 and account_id = $2 and role = 'staff' and id > $3`,
    [conversation.id, conversation.account_id, conversation.last_read_turn_id]
  )
  return rows[0].n
}

/**
 * Move the read mark forward, never back, and never past a turn of this conversation.
 * @param {import('pg').Pool} pool
 */
export async function markRead(pool, accountId, conversationId, throughId) {
  await pool.query(
    `update assistant_conversation c
        set last_read_turn_id = greatest(c.last_read_turn_id, coalesce(
          (select max(id) from assistant_turn
            where conversation_id = c.id and account_id = c.account_id and id <= $3), 0))
      where c.id = $2 and c.account_id = $1 and c.cleared_at is null`,
    [accountId, conversationId, throughId]
  )
}

/**
 * Rate one answer of the asker's own current conversation: 1 up, -1 down, null clears it. Only an
 * `assistant` turn of a conversation that is still current and belongs to the account is touched.
 * @param {import('pg').Pool} pool
 * @param {string} accountId
 * @param {string} turnId
 * @param {1 | -1 | null} rating
 * @returns {Promise<boolean>} whether a turn was rated.
 */
export async function rateTurn(pool, accountId, turnId, rating) {
  const { rowCount } = await pool.query(
    `update assistant_turn t set rating = $3
       from assistant_conversation c
      where t.id = $2 and t.account_id = $1 and t.role = 'assistant'
        and c.id = t.conversation_id and c.account_id = $1 and c.cleared_at is null`,
    [accountId, turnId, rating]
  )
  return rowCount === 1
}

/**
 * Whether the one-time "type /help" tip was already shown to this account.
 * @param {import('pg').Pool} pool
 * @param {string} accountId
 */
export async function tipSeen(pool, accountId) {
  const { rows } = await pool.query('select 1 from assistant_tip_seen where account_id = $1', [accountId])
  return rows.length > 0
}

/**
 * Record that the tip was shown; asking twice changes nothing.
 * @param {import('pg').Pool} pool
 * @param {string} accountId
 */
export async function markTipSeen(pool, accountId) {
  await pool.query('insert into assistant_tip_seen (account_id) values ($1) on conflict do nothing', [
    accountId
  ])
}

/**
 * Delete what was cleared more than `olderThanMs` ago: the conversations (their turns go by
 * conversation id) and the keys of their pictures, which the caller removes from the store.
 * @param {import('pg').Pool} pool
 * @returns {Promise<string[]>} object keys to delete from the artifact store.
 */
export async function purgeCleared(pool, olderThanMs, now = Date.now()) {
  const before = new Date(now - olderThanMs)
  return tx(pool, async (client) => {
    const { rows: gone } = await client.query(
      'select id from assistant_conversation where cleared_at is not null and cleared_at < $1 for update',
      [before]
    )
    if (gone.length === 0) return []
    const ids = gone.map((r) => r.id)
    const { rows: keys } = await client.query(
      'select object_key from assistant_attachment where conversation_id = any($1::uuid[])',
      [ids]
    )
    await client.query('delete from assistant_turn where conversation_id = any($1::uuid[])', [ids])
    await client.query('delete from assistant_conversation where id = any($1::uuid[])', [ids])
    return keys.map((r) => r.object_key)
  })
}
