/**
 * The hub change feed. Every change takes the next position from ONE counter row (`wo_hub_feed_state`) as the last
 * write of its transaction and holds that row lock until commit, so positions become visible in commit order and a
 * reader that has seen position N has seen everything below it. A sequence would not: a transaction can draw 100,
 * commit after another drew 101, and a reader already past 101 never sees 100.
 *
 * Two feeds read the same log: `changes` (upsert, merge, revoke, delete) and `revocations` (revoke, delete only). Each
 * has its own retention floor; a cursor below its floor has expired (`410 cursor_expired`) and the client must
 * revalidate its cache before reading on.
 */

export const FEEDS = Object.freeze({
  changes: { kinds: null, floor: 'change_floor' },
  revocations: { kinds: ['revoke', 'delete'], floor: 'revocation_floor' }
})
const CURSOR_VERSION = 'c1'
export const PAGE_MAX = 500

export class CursorError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** Opaque, versioned cursor naming a feed and a position. */
export function encodeCursor(feed, seq) {
  return `${CURSOR_VERSION}.${Buffer.from(JSON.stringify({ f: feed, s: String(seq) })).toString('base64url')}`
}

/** The position in `feed` a cursor names; throws `CursorError('bad_cursor')` for anything else. */
export function decodeCursor(feed, text) {
  const [version, body, extra] = String(text).split('.')
  if (version !== CURSOR_VERSION || !body || extra !== undefined)
    throw new CursorError('bad_cursor', 'unknown cursor')
  let parsed
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    throw new CursorError('bad_cursor', 'unreadable cursor')
  }
  if (parsed?.f !== feed || typeof parsed.s !== 'string' || !/^\d{1,18}$/.test(parsed.s)) {
    throw new CursorError('bad_cursor', `not a ${feed} cursor`)
  }
  return BigInt(parsed.s)
}

/**
 * Appends one change inside the caller's transaction and returns its position. Call it as the LAST write: the
 * counter row stays locked until commit, and every other publisher waits on it.
 * @param {import('pg').PoolClient} client  in an open transaction
 * @param {{ kind: 'upsert'|'merge'|'revoke'|'delete', placeId: string, revision: number|bigint, detail?: object }} change
 */
export async function appendChange(client, { kind, placeId, revision, detail = {} }) {
  const { rows } = await client.query('select wo_hub_append_change($1, $2, $3, $4::jsonb) as seq', [
    kind,
    placeId,
    String(revision),
    JSON.stringify(detail)
  ])
  return BigInt(rows[0].seq)
}

const eventOf = (r) => ({
  kind: r.kind,
  placeId: r.place_id,
  revision: Number(r.revision),
  ...r.detail,
  at: r.created_at.toISOString()
})

/**
 * One page of a feed after `cursor` (or, without one, an empty page whose cursor is the current head: take it before
 * loading places, then read on from it).
 * @returns {Promise<{ events: object[], cursor: string, more: boolean }>}
 */
export async function readFeed(pool, feed, { cursor, limit = 100 } = {}) {
  const spec = FEEDS[feed]
  if (!spec) throw new Error(`wo hub: unknown feed ${feed}`)
  const size = Math.max(1, Math.min(PAGE_MAX, Number(limit) || 100))
  const state = (await pool.query(`select seq, ${spec.floor} as floor from wo_hub_feed_state`)).rows[0]
  if (cursor === undefined || cursor === null || cursor === '') {
    return { events: [], cursor: encodeCursor(feed, state.seq), more: false }
  }
  const after = decodeCursor(feed, cursor)
  if (after < BigInt(state.floor))
    throw new CursorError('cursor_expired', 'the cursor is older than the feed keeps')
  const { rows } = await pool.query(
    `select seq, kind, place_id, revision, detail, created_at from wo_hub_change
      where seq > $1 ${spec.kinds ? 'and kind = any($3)' : ''} order by seq limit $2`,
    spec.kinds ? [String(after), size + 1, spec.kinds] : [String(after), size + 1]
  )
  const page = rows.slice(0, size)
  // With no event on the page, skip to the head that was read first: still safe, every position up to it committed.
  const last = page.length ? BigInt(page.at(-1).seq) : after > BigInt(state.seq) ? after : BigInt(state.seq)
  return { events: page.map(eventOf), cursor: encodeCursor(feed, last), more: rows.length > size }
}

/**
 * Drops events older than `before` from a feed and raises its floor. Pruning revocations also prunes them from the
 * change feed, so the change floor rises with them.
 */
export async function pruneFeed(pool, feed, { before }) {
  const spec = FEEDS[feed]
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select 1 from wo_hub_feed_state for update')
    const { rows } = await client.query(
      `delete from wo_hub_change where created_at < $1 and ${feed === 'revocations' ? 'kind = any($2)' : 'kind <> all($2)'}
       returning seq`,
      [before, ['revoke', 'delete']]
    )
    const top = rows.reduce((m, r) => (BigInt(r.seq) > m ? BigInt(r.seq) : m), 0n)
    if (top > 0n) {
      const floors = feed === 'revocations' ? ['revocation_floor', 'change_floor'] : [spec.floor]
      await client.query(
        `update wo_hub_feed_state set ${floors.map((f) => `${f} = greatest(${f}, $1)`).join(', ')}`,
        [String(top)]
      )
    }
    await client.query('commit')
    return { pruned: rows.length }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
