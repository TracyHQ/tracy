/**
 * THE SITE'S RECENT CHANGES, AS TRACY RECORDED THEM — what `apply.list` with no `apply_id` answers at the
 * Apply door (ladder DL15 on dsl2jo, 14/10/2026).
 *
 * WHY. `apply.list` was answered by the site's plugin alone, which lists ONE apply_id's steps and nothing
 * else, and the agent's tool knows only the ids its own conversation wrote. So a customer who came back
 * and said "undo the title change you made" opened a conversation that held no receipt: the tool answered
 * NOTHING_TO_LIST, the agent bootstrapped Joomla from the shell to read the plugin's log, and undid two
 * articles the customer had not named. Tracy has recorded every change it relayed all along — the audit
 * row with its `apply_id` and the conversation that asked, and in the same statement the `site_write` row
 * with what it was aimed at (`recordApply`, route.js) — so this door can say what was changed, by which
 * receipt, from any conversation.
 *
 * 🔒 ONLY TRACY'S OWN RECORD, AND ONLY CHANGES. A row is listed when the Apply door relayed a call that
 * changes the site (`writeClass`), the site said it wrote (`ok`), it carried an `apply_id`, and a
 * conversation or a seat key asked for it (`sessionId`): a site build's own writes are not "a change you
 * made", and a read is not a change. What a target names is field NAMES only, never a value — the same
 * rule as the Site changes tab (`writeTarget`). A viewer sees only its own rows, as on `GET /applies`.
 *
 * `undone`: an `apply.revert` of that id succeeded after its last write — the same evidence `turnsView`
 * reads. Pure but for {@link recentChangeRows}.
 */
import { pairWrites } from './turn-undo.js'

/** How far back the list reaches. */
export const RECENT_CHANGES_DAYS = 30
/** The most changes (apply ids) one list names, newest first. */
export const RECENT_CHANGES_MAX = 15
/** The most targets one change names; the rest are counted. */
const TARGETS_MAX = 5

/** @param {unknown} value */
const ms = (value) => {
  const t =
    value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(String(value))
  return Number.isFinite(t) ? t : null
}

/**
 * The `audit` and `site_write` rows the list is made from, newest first, of the last `days` days. `actor`, when
 * given, keeps the changes to that person's own (a viewer); every `apply.revert` on the site is read
 * either way, because an undo by an editor still undid the viewer's change. The window is the database's
 * own clock, as `at` is: a cutoff from this server's clock dropped every row once the two clocks differed.
 * @param {import('pg').Pool} pool
 * @param {{ siteKey: string, days?: number, actor?: string | null }} q
 * @returns {Promise<{ audits: any[], writes: any[] }>}
 */
export async function recentChangeRows(pool, { siteKey, days = RECENT_CHANGES_DAYS, actor = null }) {
  const { rows: audits } = await pool.query(
    `select id, at, actor, action, detail from audit
      where site_key = $1 and at >= now() - ($2::int * interval '1 day') and detail->>'ok' = 'true'
        and detail->>'apply_id' is not null
        and (action = 'apply.revert'
             or (detail->>'writeClass' = 'true' and detail->>'sessionId' is not null
                 and ($3::text is null or actor = $3)))
      order by at desc, id desc
      limit 1000`,
    [siteKey, days, actor]
  )
  const { rows: writes } = await pool.query(
    `select id, at, actor, action, outcome, target, via, turn_id, session_id
       from site_write
      where site_key = $1 and at >= now() - ($2::int * interval '1 day') and via = 'apply' and outcome = 'ok'
        and ($3::text is null or actor = $3)
      order by at desc, id desc
      limit 1000`,
    [siteKey, days, actor]
  )
  return { audits, writes }
}

/**
 * What one write was aimed at, as the list shows it: the action, and the record's kind, id and field
 * names its `site_write.target` kept (none when it kept none).
 * @param {string} action
 * @param {unknown} target
 */
function aimOf(action, target) {
  /** @type {{ action: string, kind?: string, id?: string, fields?: string[] }} */
  const aim = { action }
  if (target && typeof target === 'object') {
    const t = /** @type {{ kind?: unknown, id?: unknown, fields?: unknown }} */ (target)
    if (typeof t.kind === 'string') aim.kind = t.kind
    if (typeof t.id === 'string') aim.id = t.id
    if (Array.isArray(t.fields)) {
      const fields = t.fields.filter((f) => typeof f === 'string')
      if (fields.length > 0) aim.fields = fields
    }
  }
  return aim
}

/**
 * The list `apply.list` with no id answers: the site's changes, newest first, one entry per apply id.
 * @param {{ audits: any[], writes: any[], sessionId?: string | null, limit?: number }} facts
 *   `sessionId`: the asking conversation, so its own changes are marked.
 * @returns {{ changes: Array<{ apply_id: string, at: string | null, thisConversation: boolean,
 *   changed: Array<{ action: string, kind?: string, id?: string, fields?: string[] }>, more?: number,
 *   undone?: true }>, more: boolean, days: number }}
 */
export function recentChanges({ audits, writes, sessionId = null, limit = RECENT_CHANGES_MAX }) {
  const paired = pairWrites(writes, audits)
  /** @type {Map<any, unknown>} audit row → the target its write row kept */
  const targetOf = new Map()
  for (const [write, row] of paired) targetOf.set(row, write.target)
  /** @type {Map<string, number>} apply id → the newest successful revert of it */
  const reverted = new Map()
  for (const row of audits) {
    const id = row.detail?.apply_id
    const at = ms(row.at)
    if (row.action !== 'apply.revert' || typeof id !== 'string' || at === null) continue
    reverted.set(id, Math.max(reverted.get(id) ?? 0, at))
  }
  /** @type {Map<string, { apply_id: string, last: number, mine: boolean, aims: Map<string, any> }>} */
  const byId = new Map()
  for (const row of audits) {
    const id = row.detail?.apply_id
    if (typeof id !== 'string' || id === '' || String(row.action).startsWith('apply.')) continue
    const at = ms(row.at) ?? 0
    const entry = byId.get(id) ?? { apply_id: id, last: at, mine: false, aims: new Map() }
    entry.last = Math.max(entry.last, at)
    if (sessionId !== null && row.detail?.sessionId === sessionId) entry.mine = true
    const aim = aimOf(String(row.action), targetOf.get(row))
    entry.aims.set(JSON.stringify(aim), aim)
    byId.set(id, entry)
  }
  const ordered = [...byId.values()].sort((a, b) => b.last - a.last)
  const changes = ordered.slice(0, limit).map((e) => {
    const aims = [...e.aims.values()]
    const undoneAt = reverted.get(e.apply_id)
    return {
      apply_id: e.apply_id,
      at: e.last > 0 ? new Date(e.last).toISOString() : null,
      thisConversation: e.mine,
      changed: aims.slice(0, TARGETS_MAX),
      ...(aims.length > TARGETS_MAX ? { more: aims.length - TARGETS_MAX } : {}),
      ...(undoneAt !== undefined && undoneAt >= e.last ? { undone: /** @type {const} */ (true) } : {})
    }
  })
  return { changes, more: ordered.length > limit, days: RECENT_CHANGES_DAYS }
}

/**
 * The sentence the answer carries for the agent: what the list is and how one entry is undone.
 * @param {{ changes: unknown[] }} listed
 */
export function recentChangesNext(listed) {
  return listed.changes.length === 0
    ? `Nothing Tracy changed on this site in the last ${RECENT_CHANGES_DAYS} days is on record, so there is no change to undo by receipt: tell the customer, or ask which change they mean.`
    : "These are this site's recent changes, newest first, from every conversation (thisConversation marks this one's). apply.revert {apply_id} undoes one — the newest first when two touch the same thing; apply.list {apply_id} says what one changed. If none is the change the customer means, ask them; never guess."
}
