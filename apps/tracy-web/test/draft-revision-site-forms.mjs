// A memory site that stores JSON columns in its own form, as Joomla's Registry does (#599): every JSON object a record
// column is sent is stored re-encoded, by mode: `addkey` adds a key the site defaults, `slashes` escapes every `/`,
// `spaces` indents it, `all` does the three. The write step's read back accepts each (the site may add keys and format
// JSON its own way); a revision, a restore and an abandon must take none of them for an edit made outside Tracy.
// Invented data only.
import { blankSite } from './draft-revision-fixtures.mjs'

export const SITE_FORMS = ['addkey', 'slashes', 'spaces', 'all']

/** A JSON object text in the site's own form; any other value as it is. */
export function siteFormOf(value, mode) {
  if (typeof value !== 'string' || !/^\s*\{/.test(value)) return value
  let o
  try {
    o = JSON.parse(value)
  } catch {
    return value
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return value
  const added = mode === 'addkey' || mode === 'all' ? { site_default: '1', ...o } : o
  const text = mode === 'spaces' || mode === 'all' ? JSON.stringify(added, null, 1) : JSON.stringify(added)
  return mode === 'slashes' || mode === 'all' ? text.replace(/\//g, '\\/') : text
}

/** A memory site (`blankSite`) whose doors store JSON columns in the site's own form; the memory itself is shared. */
export function normalisingSite(memory, mode = 'all') {
  const doors = memory.doors
  const site = Object.create(memory)
  site.doors = {
    ...doors,
    update: (call) =>
      doors.update({
        ...call,
        fields: Object.fromEntries(
          Object.entries(call.fields ?? {}).map(([k, v]) => [k, siteFormOf(v, mode)])
        )
      })
  }
  return site
}

/** A blank memory site in the site's own JSON form (`script`: `blankSite`'s `fail` and `crash`). */
export const blankFormSite = (mode = 'all', script = {}) => normalisingSite(blankSite(script), mode)
