// Name the capture-tool rule (or template file) behind a hole, from its class and first evidence line.
// Reads only the evidence strings classify.mjs writes: "<table>#<id>.<column>[ -> json.path] (mod_x "title")".
export function rootCause(it) {
  const ev = it.evidence?.[0] ?? ''
  if (it.class === 'b') {
    const file = ev.split(' ')[0]
    return `template: ${it.classLabel}${file ? ` (${file.split('/').slice(0, 4).join('/')})` : ''}`
  }
  if (it.class === 'c') return `core: ${it.classLabel}`
  if (it.class === 'd') return 'unknown source'
  if ((it.classLabel ?? '').startsWith('language pattern'))
    return 'language pattern filled from configuration/DB value (e.g. %sitename%)'
  const m = ev.replace(/^"[^"]*" <- /, '').match(/^([a-z_.]+)#([^.]+)\.(\w+)(?: -> (\S+))?(?: \((\w+))?/)
  if (!m) return `DB: ${ev.slice(0, 60)}`
  const [, table, , column, jpath = '', modType = ''] = m
  const notEntity = /not a contract entity/.test(it.classLabel ?? '')
  if (table === 'configuration.php') return `global configuration.php ${column} (never in a contract)`
  if (table === 'modules') {
    if (column === 'title') return 'module title (module titles are never slots)'
    if (column === 'params' && jpath.startsWith('jatools-config'))
      return `ACM field skipped by type/name filter (${modType})`
    if (column === 'params')
      return `module param outside jatools-config: ${jpath.split('.')[0]} (${modType || 'module'})`
    if (column === 'content')
      return `module content not captured (${modType}: no module-prefix match or not mod_custom)`
    return `modules.${column}`
  }
  if (table === 'content') {
    if (column === 'images') return 'article images column (intro/full image, alt, caption) not captured'
    if (column === 'urls') return 'article urls column (links A/B/C) not captured'
    if (column.startsWith('meta')) return `article ${column} not captured`
    if (column === 'attribs')
      return `article attribs -> ${jpath.split('.')[0]} (T4/JA extra fields) not captured`
    if (notEntity) return `article not in contract (unpublished/trashed or filtered): ${column}`
    return `article ${column} not captured`
  }
  if (table === 'categories')
    return `category ${column}${jpath ? ' -> ' + jpath : ''} (categories have no slots)`
  if (table === 'menu') {
    if (notEntity) return `menu item outside --menutypes: ${column}`
    return `menu item ${column}${jpath ? ' -> ' + jpath.split('.')[0] : ''} (only menu titles are slots)`
  }
  if (table === 'users')
    return column === 'params'
      ? `author profile params -> ${jpath.split('.')[0]} (users table, never in a contract)`
      : 'author name (users table, never in a contract)'
  if (table === 'template_styles')
    return `template style params -> ${jpath.split('.')[0]} (template styles have no slots)`
  return `table ${table}.${column} (not a contract entity kind)`
}

/** Distinct hole values grouped by root cause, largest group first, with a few examples each. */
export function groupByCause(uniqueHoles) {
  const g = new Map()
  for (const it of uniqueHoles) {
    const k = `${it.class}|${rootCause(it)}`
    const e = g.get(k) ?? { class: it.class, cause: rootCause(it), count: 0, examples: [] }
    e.count++
    if (e.examples.length < 4)
      e.examples.push({
        kind: it.kind,
        value: String(it.remainder ?? it.path ?? it.value).slice(0, 90),
        evidence: it.evidence?.[0] ?? ''
      })
    g.set(k, e)
  }
  return [...g.values()].sort((a, b) => (a.class === 'c') - (b.class === 'c') || b.count - a.count)
}
