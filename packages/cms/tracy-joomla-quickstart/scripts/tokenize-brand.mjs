/**
 * Turn a quickstart's demo brand into identity tokens in the archive.
 *
 * 🔒 WHY. A Tracy quickstart repeats its demo company's name in module copy, articles, menu
 * metadata and contact rows — measured 23/09/2026 on `tracy-business/j6` 1.1.0: 82 visible spots
 * across 43 languages. A customer's site built from it kept saying "Northgate" wherever a seed did
 * not reach. The archive now says `{site.name}` / `{contact.email}` / … instead, and
 * `plg_system_tracyidentity` shows the values of the one `[Tracy] Site identity` module.
 *
 * The replacements are a reviewed rule table per quickstart, never a guess made here.
 */

/**
 * Apply a rule table to one piece of text. Longer demo names are replaced first, so
 * "Northgate Industrial JSC" becomes one token rather than a token followed by "Industrial JSC".
 *
 * @param {string} text
 * @param {{ replace: { from: string, to: string }[] }} rules
 * @returns {string}
 */
export function tokenizeText(text, rules) {
  // One pass over the text: what a rule wrote is never scanned again, which is what lets a longer
  // rule keep a string whole (`youtube.com/@NorthgateIndustrial` must not become a broken URL).
  const ordered = [...rules.replace].sort((a, b) => b.from.length - a.from.length)
  if (ordered.length === 0) return text
  const to = new Map(ordered.map((r) => [r.from, r.to]))
  const pattern = new RegExp(ordered.map((r) => r.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')
  return text.replace(pattern, (match) => to.get(match))
}

/**
 * Apply a rule table to a JSON params column, down to the strings inside a nested JSON string
 * (`jatools-config` is JSON stored as a string inside the module's JSON params).
 *
 * A column with nothing to replace is returned as the very same string: re-encoding it would
 * rewrite escapes (`é`, `\/`) in rows this pass has no business touching.
 *
 * @param {string} json
 * @param {{ replace: { from: string, to: string }[] }} rules
 * @returns {string}
 */
export function tokenizeParams(json, rules) {
  let value
  try {
    value = JSON.parse(json)
  } catch {
    return tokenizeText(json, rules)
  }
  const { changed, value: next } = walk(value, rules)
  return changed ? JSON.stringify(next) : json
}

/** @returns {{ changed: boolean, value: unknown }} */
function walk(value, rules) {
  if (typeof value === 'string') {
    const nested = nestedJson(value)
    if (nested !== undefined) {
      const inner = walk(nested, rules)
      return inner.changed ? { changed: true, value: JSON.stringify(inner.value) } : { changed: false, value }
    }
    const next = tokenizeText(value, rules)
    return { changed: next !== value, value: next }
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => walk(item, rules))
    return { changed: items.some((i) => i.changed), value: items.map((i) => i.value) }
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([k, v]) => [k, walk(v, rules)])
    return {
      changed: entries.some(([, r]) => r.changed),
      value: Object.fromEntries(entries.map(([k, r]) => [k, r.value]))
    }
  }
  return { changed: false, value }
}

/** A string that is itself a JSON object or array, parsed; otherwise undefined. */
function nestedJson(text) {
  const t = text.trimStart()
  if (!t.startsWith('{') && !t.startsWith('[')) return undefined
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * The columns a visitor of the public site can read, per table (without the `#__` prefix), and
 * whether each holds JSON. Anything else — asset titles, aliases, menutypes, hidden module titles —
 * is admin-only or routing, and a token there would be either invisible or a broken URL.
 */
export const COLUMNS = {
  modules: { content: 'text', params: 'json' },
  content: { title: 'text', introtext: 'text', fulltext: 'text', metadesc: 'text', images: 'json' },
  menu: { title: 'text', params: 'json' },
  // `email_to` is absent on purpose: com_contact SENDS mail to it, and a token is not an address.
  contact_details: { name: 'text', con_position: 'text', address: 'text', misc: 'text', params: 'json' }
}

/** The module every token reads from. Rewriting it would replace the values with tokens. */
const IDENTITY_NOTE = 'tracy:identity'

/**
 * Every column change the rule table asks for, over rows read from the database.
 *
 * @param {{ table: string, id: number, [column: string]: unknown }[]} rows
 * @param {{ replace: { from: string, to: string }[] }} rules
 * @returns {{ table: string, id: number, column: string, before: string, after: string }[]}
 */
export function planUpdates(rows, rules) {
  const out = []
  for (const row of rows) {
    const columns = COLUMNS[row.table]
    if (!columns || (row.table === 'modules' && row.note === IDENTITY_NOTE)) continue
    for (const [column, kind] of Object.entries(columns)) {
      const before = row[column]
      if (typeof before !== 'string' || before === '') continue
      const source = row.table === 'modules' && column === 'params' ? applyAcm(before, rules) : before
      const after = kind === 'json' ? tokenizeParams(source, rules) : tokenizeText(source, rules)
      if (after !== before) out.push({ table: row.table, id: row.id, column, before, after })
    }
  }
  return out
}

/**
 * Replace whole fields of an ACM block, for every module of that block type. A rule table uses this
 * where the demo's STRUCTURE is the brand, not a word in it — Tracy Business lists six Russian
 * networks (Telegram, VK, Dzen, hh.ru…) where a customer has Facebook or TikTok, and no word-level
 * replacement turns one list into the other.
 *
 * @param {string} params  a module's params column
 * @param {{ acm?: Record<string, Record<string, unknown>> }} rules
 * @returns {string} the same string when no override applies
 */
function applyAcm(params, rules) {
  if (!rules.acm) return params
  let outer
  let config
  try {
    outer = JSON.parse(params)
    config = JSON.parse(outer['jatools-config'])
  } catch {
    return params
  }
  const override = rules.acm[config?.[':type']]
  if (!override) return params
  const block = String(config[':type']).split(':').pop()
  config[block] = { ...config[block], ...override }
  outer['jatools-config'] = JSON.stringify(config)
  return JSON.stringify(outer)
}

/** A MariaDB string literal: backslash and single quote escaped, nothing else touched. */
const literal = (value) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/**
 * The planned changes as SQL, one UPDATE per column.
 *
 * @param {{ table: string, id: number, column: string, after: string }[]} updates
 * @param {string} prefix  the site's table prefix, e.g. `ng_`
 * @returns {string}
 */
export function toSql(updates, prefix) {
  return updates
    .map(
      ({ table, id, column, after }) =>
        `UPDATE \`${prefix}${table}\` SET \`${column}\` = ${literal(after)} WHERE \`id\` = ${Number(id)};\n`
    )
    .join('')
}

/**
 * One SELECT that returns every candidate row as a JSON array, for `--rows`. Only the public site's
 * rows (`client_id = 0`) where a table has that column.
 *
 * @param {string} prefix
 */
export function exportQuery(prefix) {
  const where = { modules: 'client_id = 0', menu: 'client_id = 0' }
  const parts = Object.entries(COLUMNS).map(([table, columns]) => {
    const extra = table === 'modules' ? ", 'note', note" : ''
    const fields = Object.keys(columns)
      .map((c) => `'${c}', \`${c}\``)
      .join(', ')
    const filter = where[table] ? ` WHERE ${where[table]}` : ''
    return `SELECT JSON_OBJECT('table', '${table}', 'id', id${extra}, ${fields}) AS x FROM \`${prefix}${table}\`${filter}`
  })
  return `SET SESSION group_concat_max_len = 1073741824; SELECT JSON_ARRAYAGG(x) FROM (${parts.join(' UNION ALL ')}) t;`
}

/** What a slot IS, independent of its position counter: entity, column, and JSON path or XPath. */
const slotSignature = (s) => `${s.entity}|${s.column}|${JSON.stringify(s.jsonPath ?? null)}|${s.xpath ?? ''}`

/**
 * Carry one language's translations from an old capture of a quickstart to a new one.
 *
 * @param {object} args
 * @param {{ key: string, entity: string, column: string, jsonPath?: unknown[], xpath?: string, sample: string }[]} args.oldSlots
 * @param {typeof args.oldSlots} args.newSlots
 * @param {Record<string, string>} args.translations  keyed by the OLD slot keys
 * @param {{ replace: { from: string, to: string }[] }} args.rules
 * @returns {{ translations: Record<string, string>, missing: string[] }} keyed by the NEW slot keys;
 *   `missing` lists every new slot this function would not fill rather than guess at
 */
export function remapTranslations({ oldSlots, newSlots, translations, rules }) {
  const bySignature = new Map(oldSlots.map((s) => [slotSignature(s), s]))
  const out = {}
  const missing = []
  for (const slot of newSlots) {
    const old = bySignature.get(slotSignature(slot))
    const carried = old && typeof translations[old.key] === 'string' ? translations[old.key] : undefined
    // Only a source that is still the same text, tokenized, may keep its translation — and only if
    // the translation still carries every token the source does. A translation that lost
    // `{site.name}` would pass every Claude Cowork plugin check and put the demo's wording back.
    if (carried !== undefined && tokenizeText(old.sample, rules) === slot.sample) {
      const text = tokenizeText(carried, rules)
      if (sameTokens(slot.sample, text)) {
        out[slot.key] = text
        continue
      }
    }
    if (isLanguageNeutral(slot.sample)) {
      out[slot.key] = slot.sample
      continue
    }
    missing.push(slot.key)
  }
  return { translations: out, missing }
}

/** Proper names a translation keeps as they are. */
const NEUTRAL_WORDS = /\b(Facebook|Instagram|LinkedIn|TikTok|YouTube)\b/g
const TOKEN = /\{[a-zA-Z.]+\}/g

/** Text with nothing left to translate once tokens and network names are set aside. */
function isLanguageNeutral(text) {
  return /^[\s\p{P}\p{S}\p{N}]*$/u.test(text.replace(TOKEN, '').replace(NEUTRAL_WORDS, ''))
}

/** Whether two texts carry the same identity tokens, the same number of times. */
function sameTokens(a, b) {
  const list = (t) => (t.match(TOKEN) ?? []).sort().join(',')
  return list(a) === list(b)
}

// CLI. Two steps, so this file never needs a database driver:
//   node tokenize-brand.mjs --export-query ng_                       → SQL to run with `mariadb -N -r`
//   node tokenize-brand.mjs --rules <file> --rows <rows.json> --prefix ng_ > tokenize.sql
// A summary of every change goes to stderr, grouped by what was replaced.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs')
  const { parseArgs } = await import('node:util')
  const { values } = parseArgs({
    options: {
      'export-query': { type: 'string' },
      rules: { type: 'string' },
      rows: { type: 'string' },
      prefix: { type: 'string' },
      'remap-translations': { type: 'boolean' },
      'old-map': { type: 'string' },
      'new-map': { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' }
    }
  })
  if (values['remap-translations']) {
    // --remap-translations --rules R --old-map <old content-map> --new-map <new content-map>
    //   --from <translations/<old version>> --to <translations/<new version>>
    const { readdirSync, writeFileSync, mkdirSync } = await import('node:fs')
    const rules = JSON.parse(readFileSync(values.rules, 'utf8'))
    const oldSlots = JSON.parse(readFileSync(values['old-map'], 'utf8')).slots
    const newSlots = JSON.parse(readFileSync(values['new-map'], 'utf8')).slots.filter(
      (s) => s.type === 'text'
    )
    mkdirSync(values.to, { recursive: true })
    for (const file of readdirSync(values.from)
      .filter((f) => /^[a-z]{2,3}-[A-Z]{2}\.json$/.test(f))
      .sort()) {
      const translations = JSON.parse(readFileSync(`${values.from}/${file}`, 'utf8'))
      // Only the slots this language had a translation for: the rest were never shipped.
      const had = new Set(Object.keys(translations))
      const shipped = oldSlots.filter((s) => had.has(s.key))
      // A translation belongs to the edition that is translated; slots of other editions never had one.
      const entities = new Set(shipped.map((s) => s.entity))
      const targets = newSlots.filter((s) => entities.has(s.entity))
      const out = remapTranslations({ oldSlots: shipped, newSlots: targets, translations, rules })
      writeFileSync(`${values.to}/${file}`, `${JSON.stringify(out.translations, null, 2)}\n`)
      process.stderr.write(
        `${file}  ${Object.keys(out.translations).length} carried, ${out.missing.length} left to the model\n`
      )
    }
  } else if (values['export-query']) {
    process.stdout.write(exportQuery(values['export-query']) + '\n')
  } else {
    if (!values.rules || !values.rows || !values.prefix) {
      process.stderr.write(
        'usage: --export-query <prefix> | --rules <file> --rows <file> --prefix <prefix>\n'
      )
      process.exit(2)
    }
    const rules = JSON.parse(readFileSync(values.rules, 'utf8'))
    const rows = JSON.parse(readFileSync(values.rows, 'utf8'))
    const updates = planUpdates(rows, rules)
    process.stdout.write(toSql(updates, values.prefix))
    const byTable = {}
    for (const u of updates) byTable[`${u.table}.${u.column}`] = (byTable[`${u.table}.${u.column}`] ?? 0) + 1
    process.stderr.write(`${updates.length} column(s) to rewrite over ${rows.length} row(s)\n`)
    for (const [k, n] of Object.entries(byTable).sort())
      process.stderr.write(`  ${String(n).padStart(5)}  ${k}\n`)
  }
}
