// Searchable index of every string cell in the Joomla database dump, JSON params flattened.

import { articlesAskingLayout } from './article-layout.mjs'
import { compact, letterCount, normText } from './normalize.mjs'
import { readDump } from './sql-dump.mjs'

// Tables that hold copies, logs or installer metadata: a hit there says nothing about where a page's text comes from.
const NOISE =
  /^(assets|extensions|schemas|session|action_log.*|action_logs.*|update.*|finder_.*|ucm_.*|history|contentitem_tag_map|workflow.*|mail_templates|overrider|postinstall_messages|guidedtour.*|scheduler_tasks|privacy_.*|user_keys|user_mfa|webauthn_credentials|messages.*|banner_tracks|content_frontpage|content_rating|user_notes|viewlevels|usergroups|tuf_metadata|content_types|.*_configuration|.*_config|acym_(?!form).*|claudecowork_.*|.*_log|.*_logs|commentmeta|usermeta|term_relationships|termmeta|actionscheduler_.*)$/
// Identifier/config columns: equal to a visible word by coincidence, never the source of it.
const NOISE_COLUMNS =
  /^(alias|path|link|position|module|element|type|menutype|profile_key|field_mappings|content_history_options|regex|note|language|img|access|params_schema|metakey|password|activation|otpKey|otep|lastResetTime|resetCount|checked_out_time|publish_up|publish_down|created|modified|asset_id|lft|rgt|checked_out|hits|version|lastvisitDate|registerDate|post_name|post_type|post_status|post_mime_type|post_password|post_content_filtered|guid|comment_status|ping_status|to_ping|pinged|menu_order|post_parent|option_name|autoload|meta_key|user_login|user_pass|user_nicename|user_status|user_activation_key)$/

function flatten(value, path, out) {
  if (typeof value === 'string') {
    const t = value.trim()
    if (
      (t.startsWith('{') && t.endsWith('}')) ||
      (t.startsWith('[') && t.endsWith(']')) ||
      (t.length > 1 && t.startsWith('"') && t.endsWith('"'))
    ) {
      try {
        return flatten(JSON.parse(t), path, out)
      } catch {
        /* plain string */
      }
    }
    if (letterCount(t) >= 1 || /[/.]/.test(t)) out.push({ path, raw: t })
    // HTML (or ((span)) markup) inside a cell: every text segment is also a cell of its own, so a
    // list item "15 squats" inside a field's <ul> is found by equality, not only by containment.
    if (/<[a-z/][^>]*>|\(\(\/?[a-z][a-z0-9]*(?:\s[^()]*)?\/?\)\)/i.test(t)) {
      for (const seg of t.split(/<[^>]+>|\(\(\/?[a-z][a-z0-9]*(?:\s[^()]*)?\/?\)\)/i))
        if (letterCount(seg) >= 2 && seg.trim() !== t) out.push({ path, raw: seg.trim(), segment: true })
    }
    return out
  }
  if (Array.isArray(value)) value.forEach((v, k) => flatten(v, [...path, k], out))
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) flatten(v, [...path, k], out)
  return out
}

/**
 * The user names and logins of a dump's users table (Joomla `#__users` or `<prefix>users`, WordPress `wp_users`):
 * the accounts the release ships. A user the measured site has beyond them belongs to the machine, not the demo.
 * @param {Map<string, Record<string, any>[]>} tables
 * @param {string} prefix
 * @returns {string[]}
 */
export function usersOfDump(tables, prefix = '') {
  const out = []
  for (const [full, rows] of tables) {
    const table = (prefix && full.startsWith(prefix) ? full.slice(prefix.length) : full).replace(/^#__/, '')
    if (table !== 'users') continue
    for (const row of rows)
      for (const column of ['username', 'name', 'user_login', 'display_name', 'user_nicename'])
        if (typeof row[column] === 'string' && row[column].trim()) out.push(row[column])
  }
  return out
}

/**
 * The accounts a dump ships, by user id: only the login and the display name (an author page names one of them), never
 * an e-mail, a password or a group.
 * @param {Map<string, Record<string, any>[]>} tables
 * @param {string} prefix
 * @returns {Record<string, {username: string, name: string}>}
 */
export function accountsOfDump(tables, prefix = '') {
  const out = {}
  for (const [full, rows] of tables) {
    const table = (prefix && full.startsWith(prefix) ? full.slice(prefix.length) : full).replace(/^#__/, '')
    if (table !== 'users') continue
    for (const row of rows)
      if (row.id != null)
        out[String(row.id)] = { username: String(row.username ?? ''), name: String(row.name ?? '') }
  }
  return out
}

/**
 * The author of each article in a dump's content table (Joomla `#__content.created_by`), by article id: which
 * articles an author page may list. An article with no author (`0`) names none.
 * @param {Map<string, Record<string, any>[]>} tables
 * @param {string} prefix
 * @returns {Record<string, string>}
 */
export function authorsOfDump(tables, prefix = '') {
  const out = {}
  for (const [full, rows] of tables) {
    const table = (prefix && full.startsWith(prefix) ? full.slice(prefix.length) : full).replace(/^#__/, '')
    if (table !== 'content') continue
    for (const row of rows) {
      const by = String(row.created_by ?? '').trim()
      if (row.id != null && /^\d+$/.test(by) && by !== '0') out[String(row.id)] = by
    }
  }
  return out
}

export function buildDbIndex(dumpFile, siteConfig = {}) {
  const { tables, prefix } = readDump(dumpFile)
  const cells = []
  for (const [full, rows] of tables) {
    const table = prefix && full.startsWith(prefix) ? full.slice(prefix.length) : full
    if (NOISE.test(table)) continue
    for (const row of rows) {
      const id = row.id ?? row.extension_id ?? Object.values(row)[0]
      for (const [column, v] of Object.entries(row)) {
        if (v === null || NOISE_COLUMNS.test(column) || letterCount(v) < 1) continue
        if (table === 'users' && !/^(name|username|params|display_name)$/.test(column)) continue
        for (const f of flatten(v, [], [])) {
          cells.push({
            table,
            id: String(id),
            column,
            path: f.path,
            raw: f.raw.toLowerCase(),
            norm: normText(f.raw),
            compact: compact(normText(f.raw)),
            segment: !!f.segment,
            row
          })
        }
      }
    }
  }
  for (const [k, v] of Object.entries(siteConfig)) {
    if (typeof v === 'string' && v.trim())
      cells.push({
        table: 'configuration.php',
        id: '-',
        column: k,
        path: [],
        raw: v.toLowerCase(),
        norm: normText(v),
        compact: compact(normText(v)),
        row: null
      })
  }
  return {
    cells,
    prefix,
    tableCount: tables.size,
    users: usersOfDump(tables, prefix),
    authors: authorsOfDump(tables, prefix),
    accounts: accountsOfDump(tables, prefix),
    // Published articles whose attribs ask for a layout: the audit checks their pages render it (article-layout.mjs).
    layoutAsks: articlesAskingLayout(tables, prefix)
  }
}

/**
 * Find where a text (normalized) or a raw needle (path/href, lowercase) lives in the DB.
 * Exact cell/field equality ranks first, then containment. Returns at most `limit` hits.
 */
export function searchDb(index, { norm, raw }, limit = 4) {
  const exact = []
  const contains = []
  const cmp = norm ? compact(norm) : ''
  const longNeedle = norm && (norm.length >= 20 || norm.split(' ').length >= 4)
  for (const c of index.cells) {
    if (norm) {
      if (c.norm === norm || (c.compact.length >= 4 && c.compact === cmp)) exact.push(c)
      // Containment only for real phrases; a short word is inside half the database.
      else if (longNeedle && c.norm.length > norm.length && c.norm.includes(norm)) contains.push(c)
    } else if (raw && c.raw.includes(raw)) {
      ;(c.raw === raw ? exact : contains).push(c)
    }
    if (exact.length >= limit) break
  }
  const rank = (c) =>
    /^(configuration\.php|content|modules|menu|categories|template_styles|contact_details|tags|fields_values|posts|options|terms|postmeta)$/.test(
      c.table
    )
      ? 0
      : 1
  return [...exact.sort((a, b) => rank(a) - rank(b)), ...contains.sort((a, b) => rank(a) - rank(b))]
    .slice(0, limit)
    .map((c) => ({
      table: c.table,
      id: c.id,
      column: c.column,
      path: c.path,
      exact: exact.includes(c),
      row: c.row
    }))
}
