/**
 * Read-only facts Help may be told about the asker's own sites, each from one SQL read of its own.
 *
 * 🔒 THESE READ ROWS; THEY NEVER CALL A DOOR. Several GET doors have side effects (a job lookup asks
 * the host and writes `job`, `/activity/unseen` writes a watermark, `/address/verify` resolves DNS
 * and writes), so Help reads the tables directly. The `assistant/` directory still imports nothing
 * of `sites/` or `seats/`: the pool is handed in, and the statements live here.
 *
 * 🔒 ONLY WHAT IS SAFE TO SAY. Each reader returns chosen columns: times, kinds, states, counts and
 * error codes. It never returns text another person or the agent wrote (a turn's title or reply, a
 * notification's body, a build's log, a comment), and it never takes a site key from the request:
 * the caller passes the site the asker already holds a seat on (`context.js`).
 *
 * 🔒 A READ THAT FAILS SAYS SO. Every reader answers `{ unavailable: true }` instead of throwing or
 * guessing, and the prompt tells the model to say "I cannot see that right now" for it. Invented
 * data is worse than none because people trust it.
 */

/** One read may not hold a turn of Help for long. */
const READ_TIMEOUT_MS = 2000

/**
 * Run a reader; a failure or a slow database becomes `{ unavailable: true }`.
 * @template T
 * @param {() => Promise<T>} read
 * @returns {Promise<T | { unavailable: true }>}
 */
async function safely(read) {
  let timer
  try {
    return await Promise.race([
      read(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), READ_TIMEOUT_MS)
      })
    ])
  } catch {
    return { unavailable: true }
  } finally {
    clearTimeout(timer)
  }
}

const iso = (value) => (value instanceof Date ? value.toISOString() : null)

/**
 * Builds in progress or ended for the asker's own account (P1): state, step and the customer-facing
 * stage line. Never `job.detail` (the provision log).
 * @param {import('pg').Pool} pool
 * @param {string} accountId
 */
export function buildProgress(pool, accountId) {
  return safely(async () => {
    const { rows } = await pool.query(
      `select c.state as creation_state, c.updated_at as creation_updated,
              j.state as job_state, j.step as job_step, j.updated_at as job_updated,
              b.stage as brief_stage, b.error as brief_error
         from site_creation c
         left join job j on j.id = c.job_id
         -- a brief older than this creation is a deleted site's under the same address (brief-store.js CURRENT)
         left join site_brief b on b.site_key = c.site_key and b.created_at >= c.created_at
        where c.account_id = $1
        order by c.updated_at desc
        limit 3`,
      [accountId]
    )
    return rows.map((r) => ({
      creation: r.creation_state,
      job: r.job_state ?? null,
      step: r.job_step ?? null,
      stage: r.brief_stage ?? null,
      error: r.brief_error ?? null,
      updatedAt: iso(r.job_updated) ?? iso(r.creation_updated)
    }))
  })
}

/**
 * How the site's last agent turns ended (P3): moments and an end reason, never the turn's title
 * or reply. `last_write_at` only covers writes through Apply or the EmDash MCP, so it is reported
 * as that and never as "the last change".
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 */
export function recentActivity(pool, siteKey) {
  return safely(async () => {
    const { rows } = await pool.query(
      `select opened_at, closed_at, state, end_reason, files
         from site_turn where site_key = $1 order by opened_at desc limit 1`,
      [siteKey]
    )
    const { rows: site } = await pool.query('select last_write_at from site where site_key = $1', [siteKey])
    const turn = rows[0]
    return {
      lastTurn: turn
        ? {
            openedAt: iso(turn.opened_at),
            closedAt: iso(turn.closed_at),
            state: turn.state,
            endReason: turn.end_reason ?? null,
            filesChanged: turn.files
          }
        : null,
      lastApplyWriteAt: iso(site[0]?.last_write_at)
    }
  })
}

/**
 * Whether the site's own domain was claimed and proven (P7). No DNS lookup, no `verify` call, and
 * never the TXT token (only an owner sees it, in Site settings).
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 */
export function domainState(pool, siteKey) {
  return safely(async () => {
    // The same three facts the Domains card is drawn from (`sites/address.js` `shownConnected`):
    // active, its route proven by the HTTPS probe (`connected_at`), and — where Cloudflare for SaaS
    // serves the name — its hostname and certificate active. Reading `state` alone said "connected" for
    // a name whose certificate was still being issued, and "not available" for one that had long worked.
    const { rows } = await pool.query(
      `select n.name, n.state, n.ownership_verified_at, n.ownership_proven_at, n.routing_verified_at,
              n.connected_at, h.state as hostname_state, h.hostname_status, h.ssl_status as hostname_ssl,
              h.reason as hostname_reason
         from site_name n
         left join site_custom_hostname h
           on h.name = n.name and h.site_key = n.site_key and h.token = n.token
        where n.site_key = $1 and n.kind = 'custom' and n.state in ('pending', 'active')
        order by n.updated_at desc limit 1`,
      [siteKey]
    )
    const row = rows[0]
    if (!row) return null
    // `gateOf` (`sites/site-domain-provider.js`): the hostname made for this reservation, read without a
    // fault, and it and its certificate active. A name with no hostname row at all is the legacy path.
    const hostnameReady =
      !row.hostname_state ||
      (row.hostname_state === 'created' &&
        !row.hostname_reason &&
        row.hostname_status === 'active' &&
        row.hostname_ssl === 'active')
    const connected = row.state === 'active' && Boolean(row.connected_at) && hostnameReady
    const ownership = row.ownership_verified_at !== null || row.ownership_proven_at !== null
    const routing = row.routing_verified_at !== null
    return {
      name: row.name,
      ownershipVerified: ownership,
      // `connected`: visitors reach the site there. Otherwise the step it is waiting at.
      status: connected
        ? 'connected'
        : !ownership
          ? 'waiting_ownership'
          : !routing
            ? 'waiting_routing'
            : 'waiting_certificate'
    }
  })
}

/**
 * What is waiting for the asker (P8): the Inbox's unread count and the site's open comments, as
 * counts. Never a notification's text or a comment.
 * @param {import('pg').Pool} pool
 * @param {string} accountId
 * @param {string | null} siteKey
 */
export function pendingWork(pool, accountId, siteKey) {
  return safely(async () => {
    const { rows: inbox } = await pool.query(
      `select count(*)::int as n from notification
        where account_id = $1 and in_inbox and read_at is null
          and created_at > now() - interval '90 days'`,
      [accountId]
    )
    let openComments = null
    if (siteKey) {
      const { rows } = await pool.query(
        `select count(*)::int as n from site_comment
          where site_key = $1 and reply_to is null and status <> 'resolved' and deleted_at is null`,
        [siteKey]
      )
      openComments = rows[0].n
    }
    return { inboxUnread: inbox[0].n, openComments }
  })
}

/**
 * Template and origin of the site (P10), from the columns the site row already has.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 */
export function siteOrigin(pool, siteKey) {
  return safely(async () => {
    const { rows } = await pool.query(
      'select quickstart_tag, effective_design, origin from site where site_key = $1',
      [siteKey]
    )
    const r = rows[0]
    return r
      ? { template: r.quickstart_tag ?? null, design: r.effective_design ?? null, origin: r.origin ?? null }
      : null
  })
}

/**
 * Who holds a seat on the site (the team). Names and roles for every accepted seat; emails and
 * pending invitations only when `asker` is an owner (managing people is the Owner's, ADR 0028).
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {'owner' | 'editor' | 'viewer'} askerRole
 */
export function teamOf(pool, siteKey, askerRole) {
  return safely(async () => {
    const { rows } = await pool.query(
      `select s.role, s.accepted_at, a.display_name, a.email
         from seat s join account a on a.id = s.account_id
        where s.site_key = $1 and s.declined_at is null and s.revoked_at is null
        order by s.granted_at asc`,
      [siteKey]
    )
    const sees = askerRole === 'owner'
    const members = rows
      .filter((r) => r.accepted_at !== null)
      .map((r) => ({
        name: r.display_name ?? null,
        role: r.role,
        ...(sees ? { email: r.email } : {})
      }))
    return {
      members,
      ...(sees ? { invitationsWaiting: rows.filter((r) => r.accepted_at === null).length } : {})
    }
  })
}
