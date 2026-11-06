/**
 * A named demo account removed from the database a release cuts (release-joomla.mjs --remove-user).
 *
 * A quickstart can ship an account left over from its own review (JA Voyara 1.0.11: a "Review Tester"
 * with a phone number and a privacy consent): every site restored from it would carry that login.
 * The user's row goes, with the rows Joomla's own delete removes alongside it: its group map, its
 * profile fields, its remember-me keys (user_keys holds the username, not the id), its MFA records,
 * its privacy consents and its action-log notification settings (each table only when the dump has it).
 *
 * Refused, so a cut never ships a site that lost something: a user the dump does not have, the last
 * active member of a group with core.admin (the site's Super Users) and the author (created_by) of any
 * article, which would be left without one.
 */
import { readTable, unquote, writeTable } from './release-dump-table.mjs'

/** The ids of the groups granted core.admin in the root asset, with their descendants (Joomla inherits it). */
function adminGroups(dump, prefix) {
  const groups = readTable(dump, `${prefix}usergroups`)
  if (!groups) return new Set()
  const assets = readTable(dump, `${prefix}assets`)
  const root = assets?.rows.find((r) => unquote(r.f[assets.col('name')]) === 'root.1')
  const granted = root
    ? Object.entries(JSON.parse(unquote(root.f[assets.col('rules')]) || '{}')['core.admin'] ?? {})
        .filter(([, v]) => Number(v) === 1)
        .map(([g]) => g)
    : groups.rows
        .filter((r) => unquote(r.f[groups.col('title')]) === 'Super Users')
        .map((r) => r.f[groups.col('id')])
  const parentOf = new Map(groups.rows.map((r) => [r.f[groups.col('id')], r.f[groups.col('parent_id')]]))
  const out = new Set()
  for (const id of parentOf.keys())
    for (let g = id; g && g !== '0'; g = parentOf.get(g))
      if (granted.includes(g)) {
        out.add(id)
        break
      }
  return out
}

/**
 * @param {string} dump the whole SQL dump (latin1 text: every byte kept)
 * @param {string} prefix the table prefix, like `jav_`
 * @param {string} username the account to remove
 * @returns {{ dump: string, removed: { id: string, username: string, rows: Record<string, number> } }}
 */
export function removeUser(dump, prefix, username) {
  const users = readTable(dump, `${prefix}users`)
  if (!users) throw new Error(`--remove-user ${username}: the dump has no ${prefix}users table`)
  const at = (name) => users.col(name)
  const user = users.rows.find((r) => unquote(r.f[at('username')]) === username)
  if (!user) throw new Error(`--remove-user ${username}: no such user in ${prefix}users`)
  const id = unquote(user.f[at('id')])

  const content = readTable(dump, `${prefix}content`)
  const authored = content?.rows.filter((r) => r.f[content.col('created_by')] === id) ?? []
  if (authored.length)
    throw new Error(
      `--remove-user ${username}: author of ${authored.length} articles (${authored.map((r) => r.f[content.col('id')]).join(', ')})`
    )

  const map = readTable(dump, `${prefix}user_usergroup_map`)
  const admins = adminGroups(dump, prefix)
  const active = new Set(users.rows.filter((r) => r.f[at('block')] === '0').map((r) => r.f[at('id')]))
  const isAdmin = (uid) =>
    map?.rows.some((r) => r.f[map.col('user_id')] === uid && admins.has(r.f[map.col('group_id')]))
  if (isAdmin(id) && ![...active].some((uid) => uid !== id && isAdmin(uid)))
    throw new Error(`--remove-user ${username}: the only active Super User`)

  const rows = {}
  let out = dump
  // [table, column, value]: the user's rows in every table Joomla's delete clears, when the dump has it
  for (const [table, column, value] of [
    ['users', 'id', id],
    ['user_usergroup_map', 'user_id', id],
    ['user_profiles', 'user_id', id],
    ['user_keys', 'user_id', username],
    ['user_mfa', 'user_id', id],
    ['privacy_consents', 'user_id', id],
    ['action_logs_users', 'user_id', id]
  ]) {
    const t = readTable(out, `${prefix}${table}`)
    const i = t?.col(column) ?? -1
    if (i < 0) continue
    // compared as text: an int column dumps bare (12), a varchar one quoted ('12')
    const hits = t.rows.filter((r) => unquote(r.f[i]) === value)
    if (!hits.length) continue
    for (const r of hits) r.drop = true
    rows[table] = hits.length
    out = writeTable(out, t)
  }
  return { dump: out, removed: { id, username, rows } }
}
