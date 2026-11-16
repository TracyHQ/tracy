// The alias of a record the draft write creates (ticket #597, real run of plugin 0.24.85): the address part Joomla
// stores for it. With unicode slugs off (the blank site's setting) Joomla folds every alias it is sent with
// `OutputFilter::stringURLSafe`: letters transliterated, lower case, every other character a hyphen. An alias that
// keeps an accent or a letter of another script is stored as other words than the write sent, and the read back stops
// the whole write (`read_back_mismatch`). So the write sends the alias already folded: ASCII lower case letters and
// digits joined by single hyphens, a form `stringURLSafe` keeps as it is, whatever transliteration the site has.
//
//   fold       accents taken off (`Crème` is `creme`), the letters NFKD does not split written as the repo's post slugs
//              write them (`opportunities-build/post-routes.js`: `đ` d, `ß` ss, `æ` ae, `ø` o), then every run of
//              other characters one hyphen
//   fallback   a name in a script with no Latin letters (Greek, Cyrillic, Han, Hebrew) folds to nothing: the alias is
//              the fold of the record's own key (`article:<item id>` gives the item id), else its record kind
//   unique     one alias per record kind, in plan order (`-2`, `-3` after the first), counting the aliases the blank
//              site already holds (the menu items of the kit's `dataFixes`, the system pages menu) and the ones Joomla
//              refuses for a first level menu item (`component`, the name of a folder of the Joomla root)
// Pure.

/** The folders of a Joomla root: a first level menu item may not take one as its alias (MenuTable::check). */
export const JOOMLA_ROOT_FOLDERS = Object.freeze([
  'administrator',
  'api',
  'cache',
  'cli',
  'components',
  'images',
  'includes',
  'language',
  'layouts',
  'libraries',
  'media',
  'modules',
  'plugins',
  'templates',
  'tmp'
])
/** Letters NFKD leaves whole, as the repo's post slugs write them. */
const LETTERS = { đ: 'd', ð: 'd', ß: 'ss', æ: 'ae', ø: 'o', œ: 'oe', ł: 'l', þ: 'th', ħ: 'h', ı: 'i', ŧ: 't' }

/** A text as an alias Joomla keeps unchanged: ASCII lower case letters and digits joined by one hyphen, or `''`. */
export function aliasFold(text) {
  const lower = String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
  return [...lower]
    .map((c) => LETTERS[c] ?? c)
    .join('')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
    .join('-')
}

/** The alias of a label, with the fallback a name that folds to nothing takes. */
export const slugOf = (text) => aliasFold(text) || 'page'

/** The aliases the blank site holds or Joomla refuses, by record kind, from the kit's own declarations. */
export function reservedAliasesOf(mapping) {
  const menu = new Set(['component', ...JOOMLA_ROOT_FOLDERS])
  for (const fix of Array.isArray(mapping?.dataFixes) ? mapping.dataFixes : [])
    if (fix?.menu)
      for (const item of Array.isArray(fix.items) ? fix.items : [])
        if (typeof item?.alias === 'string') menu.add(aliasFold(item.alias) || item.alias)
  return new Map([['menuItem', menu]])
}

/** The alias a record starts from: its label folded, else its key's last part, else its kind. */
export function baseAliasOf(record) {
  const label = aliasFold(record.title ?? record.subject ?? '')
  if (label) return { alias: label, fallback: false }
  const own = aliasFold(
    String(record.key ?? '')
      .split(':')
      .at(-1)
  )
  return { alias: own || aliasFold(record.recordKind) || 'page', fallback: true }
}

/**
 * Aliases unique per record kind, in plan order: the mark a resumed run finds a created record by.
 * @param {object[]} records the created records, in plan order
 * @param {Map<string, Set<string>>} [reserved] the aliases already taken, by record kind (`reservedAliasesOf`)
 * @returns {Array<{record: string, code: string}>} what the plan says of the aliases it chose
 */
export function aliasesOf(records, reserved = new Map()) {
  const used = new Map()
  const notes = []
  for (const r of records) {
    const kind = r.recordKind
    if (!used.has(kind)) used.set(kind, new Set(reserved.get(kind) ?? []))
    const seen = used.get(kind)
    const { alias: base, fallback } = baseAliasOf(r)
    if (fallback) notes.push({ code: 'alias_from_key', record: r.key })
    let alias = base
    for (let n = 2; seen.has(alias); n++) alias = `${base}-${n}`
    if (alias !== base && reserved.get(kind)?.has(base)) notes.push({ code: 'alias_reserved', record: r.key })
    seen.add(alias)
    r.alias = alias
  }
  return notes
}
