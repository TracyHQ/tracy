// Searchable index of every string cell in the Joomla database dump, JSON params flattened.
import { readDump } from './sql-dump.mjs'
import { normText, letterCount, compact } from './normalize.mjs'

// Tables that hold copies, logs or installer metadata: a hit there says nothing about where a page's text comes from.
const NOISE =
  /^(assets|extensions|schemas|session|action_log.*|action_logs.*|update.*|finder_.*|ucm_.*|history|contentitem_tag_map|workflow.*|mail_templates|overrider|postinstall_messages|guidedtour.*|scheduler_tasks|privacy_.*|user_keys|user_mfa|webauthn_credentials|messages.*|banner_tracks|content_frontpage|content_rating|user_notes|viewlevels|usergroups|tuf_metadata|content_types|.*_configuration|.*_config|acym_(?!form).*|claudecowork_.*|.*_log|.*_logs)$/
// Identifier/config columns: equal to a visible word by coincidence, never the source of it.
const NOISE_COLUMNS =
  /^(alias|path|link|position|module|element|type|menutype|profile_key|field_mappings|content_history_options|regex|note|language|img|access|params_schema|metakey|password|activation|otpKey|otep|lastResetTime|resetCount|checked_out_time|publish_up|publish_down|created|modified|asset_id|lft|rgt|checked_out|hits|version|lastvisitDate|registerDate)$/

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
        if (table === 'users' && !/^(name|username|params)$/.test(column)) continue
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
  return { cells, prefix, tableCount: tables.size }
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
    /^(configuration\.php|content|modules|menu|categories|template_styles|contact_details|tags|fields_values)$/.test(
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
