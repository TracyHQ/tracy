/**
 * Backup copies of tables a template author left in the demo database, found in the dump a release cuts.
 *
 * A table whose name (after the site prefix) holds a backup word as one of its underscore separated parts
 * (`bak`, `backup`, `old`, `copy`, `orig`, each with optional digits) is a copy nobody reads: JA Voyara 1.0.12 shipped
 * `<prefix>modules_bak_rev` beside `<prefix>modules`. A customer site restored from the quickstart carries it, and a
 * cut never removes it by itself: the release log names it (`release-stray-table`) and the template's next version drops it.
 * Tables of another prefix are not the site's and are not read. No regex runs over the dump: an indexOf loop.
 */

const MARKERS = new Set(['bak', 'backup', 'old', 'copy', 'orig'])
const HEAD = 'CREATE TABLE `'

/** A name part that is a backup word, with optional trailing digits (`copy2`). */
function isMarker(part) {
  let end = part.length
  while (end > 0 && part.charCodeAt(end - 1) >= 48 && part.charCodeAt(end - 1) <= 57) end--
  return MARKERS.has(part.slice(0, end))
}

/**
 * @param {string} dump the whole SQL dump
 * @param {string} prefix the table prefix, like `jav_`
 * @returns {string[]} the stray table names, in dump order
 */
export function strayTablesOf(dump, prefix) {
  const out = []
  let at = dump.indexOf(HEAD)
  while (at >= 0) {
    const from = at + HEAD.length
    const to = dump.indexOf('`', from)
    if (to < 0) break
    const name = dump.slice(from, to)
    if (name.startsWith(prefix) && name.slice(prefix.length).split('_').some(isMarker)) out.push(name)
    at = dump.indexOf(HEAD, to)
  }
  return out
}
