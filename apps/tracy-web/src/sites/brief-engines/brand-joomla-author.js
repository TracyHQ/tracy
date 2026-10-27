/**
 * The demo Super User of a new Joomla site, named after the business (brand step, after the site name).
 *
 * 🔒 WHY. A quickstart carries the Super User its stand was installed with (display name "Tracy Agent"): the bootstrap
 * (`joomla-bootstrap.php` `tracy_reset_site`) only gives it a fresh password, and the customer signs in through a separate
 * account Tracy Access creates, named by email. Every article that user wrote went on printing "Written by Tracy Agent" on
 * the customer's blog and author pages (measured 25/10/2026, JA Boxing 1.0.3). Its display name is what a visitor reads, so
 * it becomes the business's: the name the customer gave, or else the site's own name as it stands after the name step.
 *
 * 🔒 ONLY THE DISPLAY NAME OF THE QUICKSTART'S OWN SUPER USERS. The Super Users are read from the site's group map
 * (`db.dump` of `<prefix>user_usergroup_map`, group 8, the id Joomla installs and Tracy Access also relies on); an account
 * Tracy Access made (its username is the person's email) is the customer's and is never touched, and neither is any other
 * user: the template's sample authors stay its people. Username, email and password are never written. The write carries the
 * brand apply id, so `apply.revert` takes it back with the rest of the brand. Soft: a site that cannot say who its Super Users
 * are keeps the name silently; a refused write keeps it and the step says why.
 */

/** Joomla's core "Super Users" group. */
const SUPER_USERS = 8
/** How many users one `content.list` page asks for, and how many pages are read at most. */
const PAGE = 200
const PAGES = 10
/** Rows of the group map one `db.dump` chunk asks for, and how many chunks are read at most. */
const CHUNK = 5000
const CHUNKS = 10
/** The site's own group map: a prefix, never a snapshot copy (`_tracy_snap_<tag>__…`). */
const GROUP_MAP = /^[A-Za-z0-9]+_user_usergroup_map$/

/** What a refusal says. */
const said = (/** @type {any} */ answer) =>
  [answer?.error ?? answer?.code, answer?.message].filter(Boolean).join(': ') || 'no answer'

/** The answer, or a throw with what the site said. */
const answered = (/** @type {any} */ answer) => {
  if (!answer || answer.ok === false) throw new Error(said(answer))
  return answer
}

/**
 * The ids of the site's Super Users.
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} read
 * @returns {Promise<Set<number>>}
 */
async function superUsersOf(read) {
  const tables = answered(await read('db.tables', {})).tables
  const maps = (Array.isArray(tables) ? tables : []).filter((t) => typeof t === 'string' && GROUP_MAP.test(t))
  if (maps.length !== 1) throw new Error(`${maps.length} user group tables`)
  const ids = new Set()
  let offset = 0
  for (let chunk = 0; chunk < CHUNKS; chunk += 1) {
    const dump = answered(await read('db.dump', { table: maps[0], limit: CHUNK, offset }))
    const sql = Buffer.from(String(dump.sql_b64 ?? ''), 'base64').toString('utf8')
    for (const [, user, group] of sql.matchAll(/\('?(\d+)'?,\s*'?(\d+)'?\)/g))
      if (Number(group) === SUPER_USERS) ids.add(Number(user))
    if (dump.done !== false) return ids
    const next = Number(dump.next_offset)
    if (!Number.isInteger(next) || next <= offset) return ids
    offset = next
  }
  return ids
}

/**
 * Every user the plugin lists: `{id, name, username}`.
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} read
 */
async function usersOf(read) {
  /** @type {Array<{id: number, name: string, username: string}>} */
  const users = []
  for (let page = 0; page < PAGES; page += 1) {
    const items = answered(
      await read('content.list', { kind: 'user', limit: PAGE, offset: page * PAGE })
    ).items
    if (!Array.isArray(items)) break
    users.push(...items)
    if (items.length < PAGE) break
  }
  return users
}

/** The site's name as Global Configuration holds it, or ''. */
async function siteNameOf(
  /** @type {(action: string, params: Record<string, unknown>) => Promise<any>} */ read
) {
  const answer = await read('site.identity', { operation: 'read', fields: ['sitename'] }).catch(() => null)
  const name = answer?.ok === false ? '' : answer?.fields?.sitename
  return typeof name === 'string' ? name.trim() : ''
}

/**
 * Name the quickstart's Super Users after the business.
 * @param {object} input
 * @param {unknown} input.name - the name the customer gave, if any
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} input.read
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} input.write - carries the brand apply id
 * @param {(where: string) => void} input.wrote
 * @param {(where: string, reason: string) => void} input.skip
 */
export async function writeDemoAuthorName({ name, read, write, wrote, skip }) {
  const given = typeof name === 'string' ? name.trim() : ''
  const target = given || (await siteNameOf(read))
  if (!target) return
  let demo
  try {
    const supers = await superUsersOf(read)
    demo = (await usersOf(read)).filter(
      (user) =>
        supers.has(Number(user.id)) &&
        // A Tracy Access account is named by its email: the customer's own, never the demo's.
        !String(user.username ?? '').includes('@') &&
        String(user.name ?? '').trim() !== target
    )
  } catch {
    // A plugin that cannot list its users or groups (older, or the door refuses the read) leaves the name as released, without
    // a word: nothing the customer can act on, and no build that needs a complete brand is failed for it.
    return
  }
  let renamed = 0
  for (const user of demo) {
    try {
      await write('content.update', { kind: 'user', id: Number(user.id), fields: { name: target } })
      renamed += 1
    } catch (error) {
      skip(
        'author-name',
        `the site refused the author name (${error instanceof Error ? error.message : error})`
      )
    }
  }
  if (renamed > 0) wrote('author-name')
}
