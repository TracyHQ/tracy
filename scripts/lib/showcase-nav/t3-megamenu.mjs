/**
 * The T3 mega-menu half of a Joomla showcase map: a level item whose every child leaves the navigation
 * still opens a dropdown when a T3 template style keeps a `sub` for it. T3's renderer
 * (`plugins/system/t3/includes/menu/megamenu.php`) sets `dropdown` whenever
 * `mm_config.<menutype>.item-<id>.sub` exists, children or not, so the caret stays and the dropdown opens
 * empty. `templateStyle.megaSubRemove` drops that one key and nothing else.
 *
 * A COLUMN whose head the map hides breaks the panel even when other children stay: `mega()` starts the
 * first column at the first SHOWN child but ends it at the next column's head, which `nav()` has already
 * passed, so the first column renders every remaining column again. `templateStyle.megaColumnRemove`
 * drops the entries of that one column (`{"item": <head>}`, every row; a row it empties goes with it)
 * and keeps every other byte. When no column of items is left and no module column either, the whole
 * `sub` goes instead (`megaSubRemove`).
 *
 * The lock does not carry the menu's `lft`, so which column a child that is NOT a column head sits in
 * is unknown: a column is dropped only when every child still shown is the head of a column that stays.
 *
 * 🔒 BYTE-EXACT OR NOTHING. `mm_config` is a JSON string inside the params JSON. The new column is the old
 * one with only the bytes of the `mm_config` value replaced, and that value is re-encoded the way the
 * release stored it: an encoding is accepted only when re-encoding the parsed text gives back the very
 * bytes the lock holds, for the inner JSON and for the string literal around it. A style whose bytes no
 * encoding here reproduces is `unresolved`, never rewritten in another encoding.
 *
 * Pure: the generator and its tests feed it the tree of `joomla-tree.mjs`.
 */
import { sha256 } from './common.mjs'
import { shownToday } from './joomla-tree.mjs'

export const MEGA_SUB_OP = 'templateStyle.megaSubRemove'
export const MEGA_COLUMN_OP = 'templateStyle.megaColumnRemove'

export const MEGA_RULES = {
  remove: 'hide.mega-sub-of-emptied-item',
  encoding: 'unresolved.mega-sub-encoding',
  shape: 'unresolved.mega-sub-shape',
  column: 'hide.mega-column-of-hidden-items',
  memberShown: 'unresolved.mega-column-member-shown',
  width: 'unresolved.mega-column-width'
}

const hex4 = (code) => `\\u${code.toString(16).padStart(4, '0')}`
const NAMED = { '"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' }

/**
 * The encoders a release may have used: PHP `json_encode` with or without `JSON_UNESCAPED_SLASHES` /
 * `JSON_UNESCAPED_UNICODE` (PHP still escapes U+2028/U+2029 then), and the browser's `JSON.stringify`.
 */
export const ENCODINGS = [
  { name: 'php', slashes: true, unicode: true, lineTerminators: true },
  { name: 'php-unescaped-slashes', slashes: false, unicode: true, lineTerminators: true },
  { name: 'php-unescaped-unicode', slashes: true, unicode: false, lineTerminators: true },
  { name: 'php-unescaped-slashes-unicode', slashes: false, unicode: false, lineTerminators: true },
  { name: 'json-stringify', slashes: false, unicode: false, lineTerminators: false }
]

function encodeString(text, enc) {
  let out = '"'
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const code = text.charCodeAt(i)
    if (NAMED[ch]) out += NAMED[ch]
    else if (code < 0x20) out += hex4(code)
    else if (ch === '/' && enc.slashes) out += '\\/'
    else if (code > 0x7f && enc.unicode) out += hex4(code)
    else if ((code === 0x2028 || code === 0x2029) && enc.lineTerminators) out += hex4(code)
    else out += ch
  }
  return `${out}"`
}

/** Compact JSON as `enc` writes it. Numbers print as JavaScript does; a float PHP wrote as `4.0` then fails the round trip. */
export function encodeJson(value, enc) {
  if (value === null) return 'null'
  if (typeof value === 'string') return encodeString(value, enc)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.map((v) => encodeJson(v, enc)).join(',')}]`
  return `{${Object.keys(value)
    .map((k) => `${encodeString(k, enc)}:${encodeJson(value[k], enc)}`)
    .join(',')}}`
}

/** The first encoding that writes `parsed` back as exactly `text`, or null. */
function roundTrip(text, parsed) {
  return ENCODINGS.find((enc) => encodeJson(parsed, enc) === text) ?? null
}

/** The span of a JSON string literal starting at `i` (on its opening quote). */
function stringEnd(text, i) {
  for (let j = i + 1; j < text.length; j += 1) {
    if (text[j] === '\\') j += 1
    else if (text[j] === '"') return j + 1
  }
  return -1
}

/** The end of the JSON value starting at `i` (strings, nested containers, primitives). */
function valueEnd(text, i) {
  if (text[i] === '"') return stringEnd(text, i)
  if (text[i] === '{' || text[i] === '[') {
    let depth = 0
    for (let j = i; j < text.length; j += 1) {
      const c = text[j]
      if (c === '"') {
        j = stringEnd(text, j) - 1
        if (j < 0) return -1
      } else if (c === '{' || c === '[') depth += 1
      else if (c === '}' || c === ']') {
        depth -= 1
        if (depth === 0) return j + 1
      }
    }
    return -1
  }
  const m = /^[^,\]}\s]+/.exec(text.slice(i))
  return m ? i + m[0].length : -1
}

/**
 * Where the value of top-level member `key` sits in the raw text of a JSON object: `{ start, end }`,
 * or null when the text is not one object, the member is absent, or it appears twice.
 */
export function memberSpan(text, key) {
  const ws = /\s/
  let i = 0
  const skip = () => {
    while (i < text.length && ws.test(text[i])) i += 1
  }
  skip()
  if (text[i] !== '{') return null
  i += 1
  let found = null
  for (;;) {
    skip()
    if (text[i] === '}') break
    if (text[i] !== '"') return null
    const kEnd = stringEnd(text, i)
    if (kEnd < 0) return null
    const name = JSON.parse(text.slice(i, kEnd))
    i = kEnd
    skip()
    if (text[i] !== ':') return null
    i += 1
    skip()
    const end = valueEnd(text, i)
    if (end < 0) return null
    if (name === key) {
      if (found) return null
      found = { start: i, end }
    }
    i = end
    skip()
    if (text[i] === ',') i += 1
    else if (text[i] !== '}') return null
  }
  return found
}

const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v)

/**
 * The params column with one edit made to `mm_config.<menutype>.item-<item>` and every other byte kept.
 * `edit(setting)` changes the parsed setting in place and returns false when there is nothing to change,
 * or `{ problem, rule }` when the change cannot be made exactly.
 * @returns {{ raw: string } | { problem: string, rule: string } | { absent: true }}
 */
function editMegaSetting(raw, menutype, item, edit) {
  if (typeof raw !== 'string')
    return { problem: 'the lock holds no raw params column', rule: MEGA_RULES.encoding }
  let outer
  try {
    outer = JSON.parse(raw)
  } catch {
    return { problem: 'the params column is not JSON', rule: MEGA_RULES.encoding }
  }
  if (!isPlain(outer) || !Object.prototype.hasOwnProperty.call(outer, 'mm_config')) return { absent: true }
  const inner = outer.mm_config
  // An empty or null mm_config is T3's "no mega settings": no sub to edit.
  if (inner === null || inner === '') return { absent: true }
  if (typeof inner !== 'string') return { problem: 'mm_config is not a JSON string', rule: MEGA_RULES.shape }
  let config
  try {
    config = JSON.parse(inner)
  } catch {
    return { problem: 'mm_config does not parse', rule: MEGA_RULES.shape }
  }
  const setting = isPlain(config) && isPlain(config[menutype]) ? config[menutype][`item-${item}`] : undefined
  if (!isPlain(setting) || !Object.prototype.hasOwnProperty.call(setting, 'sub')) return { absent: true }
  const span = memberSpan(raw, 'mm_config')
  const innerEnc = roundTrip(inner, config)
  const outerEnc =
    span && ENCODINGS.find((enc) => encodeString(inner, enc) === raw.slice(span.start, span.end))
  if (!span || !innerEnc || !outerEnc)
    return {
      problem: `mm_config does not re-encode to the bytes the release stored (${!span ? 'its place in params is ambiguous' : !innerEnc ? 'inner JSON' : 'string literal'})`,
      rule: MEGA_RULES.encoding
    }
  const edited = edit(setting)
  if (edited === false) return { absent: true }
  if (edited?.problem) return edited
  const nextInner = encodeJson(config, innerEnc)
  const next = raw.slice(0, span.start) + encodeString(nextInner, outerEnc) + raw.slice(span.end)
  // Proof of the edit: the new column parses to the old one with only mm_config changed, as encoded.
  const reread = JSON.parse(next)
  const want = { ...outer, mm_config: nextInner }
  if (
    JSON.stringify(reread) !== JSON.stringify(want) ||
    encodeJson(JSON.parse(nextInner), innerEnc) !== nextInner
  )
    return { problem: 'the edited params column does not read back as expected', rule: MEGA_RULES.encoding }
  return { raw: next }
}

/** The params column with `mm_config.<menutype>.item-<item>.sub` removed and every other byte kept. */
export function removeMegaSub(raw, menutype, item) {
  return editMegaSetting(raw, menutype, item, (setting) => {
    delete setting.sub
  })
}

/**
 * T3's own test for a module column (`mega()`, `isset($col['position'])`): the key is there and not null.
 * Any other column, `"position": null` included, is a column of items headed by `col.item`.
 */
export const placesModule = (col) =>
  Object.prototype.hasOwnProperty.call(col, 'position') && col.position !== null

/** A whole number JavaScript holds exactly, or null: an id past 2^53 is not one this rule can name. */
const exact = (n) => {
  const t = Math.trunc(n) + 0
  return Number.isSafeInteger(t) ? t : null
}

/**
 * PHP 8 `intval()` of a scalar `position`, the module id `module()` loads; null for a list or object, or for
 * an id outside ±2^53 that this rule cannot hold exactly. A string reads its leading numeric prefix: leading
 * whitespace, a sign, digits with an optional fraction and exponent ("0.5e1" → 5, "1e-5" → 0, "1e3abc" →
 * 1000, "12abc" → 12, "" or "abc" or "0x1A" → 0); a float string truncates, an infinite one is 0. A number
 * truncates (an infinite one is 0), a bool is 1/0.
 */
export function moduleId(position) {
  if (typeof position === 'boolean') return position ? 1 : 0
  if (typeof position === 'number') return Number.isFinite(position) ? exact(position) : 0
  if (typeof position !== 'string') return null
  const text = /^[ \t\n\r\v\f]*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/.exec(position)?.[1]
  if (!text) return 0
  const value = Number(text)
  return Number.isFinite(value) ? exact(value) : 0
}

/** A module column that can put something in the panel: `module()` finds nothing under id 0 or below. */
const placesContent = (col) => placesModule(col) && moduleId(col.position) > 0

const isHead = (col, head) => isPlain(col) && !placesModule(col) && String(col.item) === String(head)

/** The only keys a column may carry for its row to be re-spread: T3 reads `width` and nothing else for size. */
const COLUMN_KEYS = new Set(['item', 'position', 'width'])
const WIDTH_TEXT = /^[1-9][0-9]*$/

/**
 * The widths of a row that keeps `left` of its columns, spread back over the row's old total, or a
 * problem when the row stores its widths in a way this cannot reproduce. T3 sizes a column by its `width`
 * alone (`begincol`: class `col-xs-<width>` / `span<width>`, 12 when absent), so a row qualifies only when
 * every column carries `width`, all as JSON integers >= 1 or all as strings of digits without a leading 0,
 * and no column carries a key besides `item`, `position` and `width` (a `class` may size it too).
 * Spread: T = the row's old sum, S = the sum of what stays; each column gets floor(w*T/S), and the
 * T - sum units left go one each to the columns with the largest (w*T mod S), the leftmost first on a tie.
 */
export function spreadWidths(row, left) {
  if (!row.every((c) => isPlain(c) && Object.keys(c).every((k) => COLUMN_KEYS.has(k))))
    return { problem: 'a column of the row carries a key besides item, position and width' }
  if (!row.every((c) => Object.prototype.hasOwnProperty.call(c, 'width')))
    return { problem: 'a column of the row has no width (T3 would size it 12)' }
  const ints = row.every((c) => Number.isInteger(c.width) && c.width >= 1)
  const texts = row.every((c) => typeof c.width === 'string' && WIDTH_TEXT.test(c.width))
  if (!ints && !texts) return { problem: 'the row mixes or bends its width encodings' }
  // Like an id, a width past 2^53 is not one JavaScript holds exactly (a number has already lost it).
  if (!row.every((c) => Number.isSafeInteger(Number(c.width))))
    return { problem: 'a column of the row has a width beyond the exact integers' }
  // The products w·T can pass 2^53 even when every width is exact, so the spread runs in BigInt.
  const total = row.reduce((sum, c) => sum + BigInt(c.width), 0n)
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    return { problem: 'the row sums its widths beyond the exact integers' }
  const kept = left.reduce((sum, c) => sum + BigInt(c.width), 0n)
  const scaled = left.map((c, i) => ({
    i,
    base: (BigInt(c.width) * total) / kept,
    rest: (BigInt(c.width) * total) % kept
  }))
  let units = total - scaled.reduce((sum, c) => sum + c.base, 0n)
  for (const c of [...scaled].sort((a, b) => (a.rest === b.rest ? a.i - b.i : a.rest < b.rest ? 1 : -1))) {
    if (!units) break
    c.base += 1n
    units -= 1n
  }
  return { widths: scaled.map((c) => (ints ? Number(c.base) : String(c.base))) }
}

/**
 * The params column with every `{"item": <head>}` column of that sub removed (all rows; a row this
 * empties goes too), the other columns of each row that lost one re-spread over the row's old total
 * (`spreadWidths`), and every other byte kept.
 */
export function removeMegaColumn(raw, menutype, item, head) {
  return editMegaSetting(raw, menutype, item, (setting) => {
    const rows = setting.sub?.rows
    if (!Array.isArray(rows) || !rows.some((r) => Array.isArray(r) && r.some((c) => isHead(c, head))))
      return false
    const next = []
    for (const row of rows) {
      if (!Array.isArray(row) || !row.some((c) => isHead(c, head))) {
        next.push(row)
        continue
      }
      const left = row.filter((c) => !isHead(c, head))
      if (!left.length) continue
      const spread = spreadWidths(row, left)
      if (spread.problem)
        return {
          problem: `${spread.problem}: its columns cannot be re-spread exactly`,
          rule: MEGA_RULES.width
        }
      left.forEach((c, i) => {
        c.width = spread.widths[i]
      })
      next.push(left)
    }
    setting.sub.rows = next
  })
}

/** What a `sub` holds that this rule cannot read; module columns are fine and are left alone. */
export function subShape(sub) {
  if (!isPlain(sub)) return 'the sub is not an object'
  if (sub.rows === undefined) return null
  if (!Array.isArray(sub.rows)) return 'its rows are not a list'
  for (const row of sub.rows) {
    if (!Array.isArray(row)) return 'a row is not a list'
    for (const col of row) {
      if (!isPlain(col)) return 'a column is not an object'
      if (placesModule(col) && moduleId(col.position) === null)
        return 'a column names a module that is not a scalar'
      if (!placesModule(col) && (col.item === undefined || col.item === null))
        return 'a column names neither an item nor a module'
    }
  }
  return null
}

/** The `sub` a style keeps for an item, read from its params; undefined when it keeps none. */
function subOf(style, menutype, item) {
  try {
    const config = JSON.parse(JSON.parse(style.rawParams).mm_config)
    return config?.[menutype]?.[`item-${item}`]?.sub
  } catch {
    return undefined
  }
}

/**
 * The T3 mega operations of a map, after its own hides (`hidden`: keys of menu items it hides). An item
 * is looked at when it stays in the navigation and at least one of its children leaves with this map;
 * its children are every lock menu row under it, content map or not, shown as the plugin reads them.
 * Per T3 style that keeps a `sub` for it:
 * - no child left on screen and no module column with a module id above 0 → `megaSubRemove`;
 * - otherwise each column of items whose head is off screen → `megaColumnRemove`, provided every child
 *   still on screen heads a column that stays; else `unresolved`, nothing written.
 * Chained per style, in item then column order.
 * @returns {{ operations: any[], unresolved: Array<{ key: string, label: string, where: string, rule: string, reason: string }> }}
 */
export function megaSubOperations(tree, hidden) {
  const { items, styles } = tree
  const visible = (k) => shownToday(items.get(k)) && !hidden.has(k)
  const stays = (k) => {
    for (let p = k; p; p = items.get(p)?.parent) if (!visible(p)) return false
    return true
  }
  const rows = tree.menuRows ?? []
  const childRows = (i) => rows.filter((r) => r.parentSource === String(i.sourceId))
  const candidates = [...items.values()]
    .filter((i) => stays(i.key) && childRows(i).some((r) => hidden.has(r.key)))
    .sort((a, b) => a.sourceId - b.sourceId)
  const t3 = [...styles.values()].filter((s) => s.t3).sort((a, b) => a.sourceId - b.sourceId)
  const operations = []
  const unresolved = []
  for (const style of t3) {
    let raw = style.rawParams
    for (const item of candidates) {
      const title = item.title.trim()
      const subPath = `mm_config.${item.menutype}.item-${item.sourceId}.sub`
      const note = (rule, problem, where = subPath) =>
        unresolved.push({
          key: style.key,
          label: style.title,
          where,
          rule,
          reason: `children of "${title}" leave the navigation, but ${problem}: the panel stays as the template has it`
        })
      const sub = subOf(style, item.menutype, item.sourceId)
      if (sub === undefined) continue
      const shape = subShape(sub)
      if (shape) {
        note(MEGA_RULES.shape, shape)
        continue
      }
      const children = childRows(item)
      const left = children.filter((r) => r.shown && !hidden.has(r.key))
      const leftIds = new Set(left.map((r) => r.key.slice('menuItem-'.length)))
      const childIds = new Set(children.map((r) => r.key.slice('menuItem-'.length)))
      const cols = (Array.isArray(sub.rows) ? sub.rows : []).flat()
      const modules = cols.filter(placesContent)
      const heads = [...new Set(cols.filter((c) => !placesModule(c)).map((c) => String(c.item)))]
      const push = (op, extra, result, rule, reason) => {
        operations.push({
          op,
          key: style.key,
          identity: style.identity,
          label: `${style.title} · ${title}${extra.column ? ` · column ${extra.column}` : ''}`,
          style: { id: style.sourceId, template: style.template },
          menutype: item.menutype,
          item: item.sourceId,
          ...extra,
          before: sha256(raw),
          after: sha256(result.raw),
          rule,
          reason
        })
        raw = result.raw
      }
      if (!left.length && !modules.length) {
        const result = removeMegaSub(raw, item.menutype, item.sourceId)
        if (result.problem) note(result.rule, result.problem)
        else if (result.raw)
          push(
            MEGA_SUB_OP,
            { path: subPath },
            result,
            MEGA_RULES.remove,
            `every child of "${title}" in ${item.menutype} leaves the navigation; T3 builds a dropdown from this sub whatever the children, so it would open empty`
          )
        continue
      }
      // Columns whose head is a child of this item and off screen (hidden here, or not shown in the lock).
      const gone = heads.filter((h) => childIds.has(h) && !leftIds.has(h))
      if (!gone.length) continue
      const stray = left.filter((r) => !heads.includes(r.key.slice('menuItem-'.length)))
      if (stray.length) {
        note(
          MEGA_RULES.memberShown,
          `column head(s) ${gone.map((h) => `menuItem-${h}`).join(', ')} leave while ${stray.map((r) => r.key).join(', ')} stay shown without heading a column (the lock holds no menu order to tell which column they sit in)`
        )
        continue
      }
      for (const h of gone) {
        const result = removeMegaColumn(raw, item.menutype, item.sourceId, h)
        if (result.problem) {
          note(result.rule, result.problem)
          break
        }
        if (!result.raw) continue
        push(
          MEGA_COLUMN_OP,
          { column: Number(h), path: `${subPath}.rows[item=${h}]` },
          result,
          MEGA_RULES.column,
          `the column headed by menuItem-${h} holds only entries that leave the navigation; T3 starts the first column at the first shown child but ends it at the next head, so the panel would list the other columns twice; the columns left in its row are re-spread over the row's old width`
        )
      }
    }
  }
  return { operations, unresolved }
}
